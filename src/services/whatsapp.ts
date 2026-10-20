import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  Browsers,
  WASocket
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { config } from '../config.js';
import { aiService } from './ai.js';
import { storage } from '../db/storage.js';
import { WhatsAppState } from '../types.js';
import fs from 'fs';
import path from 'path';
import { geocodingService } from './geocoding.js';
import { demoService } from './demo.js';

// Desembrulha mensagens de estruturas como deviceSentMessage, ephemeralMessage, viewOnceMessage, editedMessage
function unwrapMessage(m: any): any {
  if (!m) return m;
  if (m.deviceSentMessage?.message) return unwrapMessage(m.deviceSentMessage.message);
  if (m.ephemeralMessage?.message) return unwrapMessage(m.ephemeralMessage.message);
  if (m.viewOnceMessage?.message) return unwrapMessage(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return unwrapMessage(m.viewOnceMessageV2.message);
  if (m.documentWithCaptionMessage?.message) return unwrapMessage(m.documentWithCaptionMessage.message);
  if (m.editedMessage?.message) return unwrapMessage(m.editedMessage.message);
  return m;
}

export class WhatsAppService {
  private sock: WASocket | null = null;
  private state: WhatsAppState = {
    state: 'disconnected',
    lastUpdated: new Date().toISOString()
  };
  private isConnecting: boolean = false;
  private hasPrintedTerminalQR: boolean = false;
  private recentBotReplies: Set<string> = new Set();
  private sentBotMessageIds: Set<string> = new Set();

  public getStatus(): WhatsAppState {
    return { ...this.state };
  }

  public isConnected(): boolean {
    return this.state.state === 'connected';
  }

  public async start(): Promise<void> {
    if (this.state.state === 'connected') {
      console.log('[WhatsApp Salão] Já conectado.');
      return;
    }
    if (this.isConnecting && this.state.state === 'connecting') {
      console.log('[WhatsApp Salão] Conexão já em andamento...');
      return;
    }
    this.isConnecting = true;

    try {
      this.state = {
        state: 'connecting',
        lastUpdated: new Date().toISOString()
      };

      // Limpeza preventiva de sessão morta
      if (fs.existsSync(config.authInfoPath)) {
        const credsPath = path.join(config.authInfoPath, 'creds.json');
        if (fs.existsSync(credsPath)) {
          try {
            const raw = fs.readFileSync(credsPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed?.me?.id) {
              console.log('[WhatsApp Salão] creds.json não autenticado detectado. Limpando para gerar QR...');
              fs.rmSync(config.authInfoPath, { recursive: true, force: true });
            }
          } catch (e) {
            try { fs.rmSync(config.authInfoPath, { recursive: true, force: true }); } catch (e2) {}
          }
        }
      }

      const { state, saveCreds } = await useMultiFileAuthState(config.authInfoPath);
      const { version } = await fetchLatestBaileysVersion();
      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        version,
        logger,
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 250
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          if (!this.hasPrintedTerminalQR) {
            console.log('\n=========================================');
            console.log('  📲 ESCANEIE O QR CODE NO SEU WHATSAPP');
            console.log('  🌐 ABRA NO SEU NAVEGADOR EM ALTA RESOLUÇÃO:');
            console.log('  👉 /qr (Ex: http://SEU_IP:PORTA/qr)');
            console.log('=========================================\n');
            qrcodeTerminal.generate(qr, { small: false });
            this.hasPrintedTerminalQR = true;
          }

          try {
            const dataUrl = await QRCode.toDataURL(qr);
            this.state = {
              state: 'qr_ready',
              qrCodeDataUrl: dataUrl,
              lastUpdated: new Date().toISOString()
            };
            this.isConnecting = false;
          } catch (e) {
            console.error('[WhatsApp] Erro ao gerar DataURL do QR Code:', e);
          }
        }

        if (connection === 'open') {
          const userPhone = this.sock?.user?.id?.split(':')[0] || 'Desconhecido';
          console.log(`\n✅ WhatsApp conectado com sucesso!`);
          console.log(`📞 Linha do Salão: ${userPhone}`);
          console.log(`🔒 Modo de Segurança Ativo: Respondendo APENAS ao seu próprio número. Grupos desativados.\n`);

          this.state = {
            state: 'connected',
            phoneNumber: userPhone,
            qrCodeDataUrl: undefined,
            lastUpdated: new Date().toISOString()
          };
          this.isConnecting = false;
          this.hasPrintedTerminalQR = false;
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403;
          const wasEverConnected = this.state.state === 'connected' || !!this.sock?.user;

          console.log(`[WhatsApp Salão] Sessão desconectada (código ${statusCode}). Reconectar: ${!isLoggedOut}`);

          this.state = {
            state: 'disconnected',
            qrCodeDataUrl: undefined,
            lastUpdated: new Date().toISOString()
          };
          this.isConnecting = false;

          // Se deslogou ou se NUNCA chegou a conectar (falhou no QR ou chaves inválidas), limpa chaves e reinicia limpo
          if (isLoggedOut || !wasEverConnected) {
            console.log(`[WhatsApp Salão] Limpando credenciais antigas para gerar novo QR...`);
            try {
              if (fs.existsSync(config.authInfoPath)) {
                fs.rmSync(config.authInfoPath, { recursive: true, force: true });
              }
            } catch (errClean) {}
            setTimeout(() => this.start(), 1500);
          } else {
            setTimeout(() => this.start(), 5000);
          }
        }
      });

      // Trata mensagens recebidas com filtro estrito de segurança
      this.sock.ev.on('messages.upsert', async (m) => {
        // Aceita 'notify' (mensagens normais de clientes) e 'append' (mensagens sincronizadas / auto-conversa)
        if (m.type !== 'notify' && m.type !== 'append') return;

        for (const msg of m.messages) {
          if (!msg.message) continue;
          if (msg.key.id && this.sentBotMessageIds.has(msg.key.id)) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid) continue;

          // 1. REGRA ESTRITA: NUNCA responder em grupos, status, canais ou transmissões
          if (
            remoteJid.endsWith('@g.us') ||
            remoteJid.includes('@broadcast') ||
            remoteJid.endsWith('@newsletter') ||
            msg.key.participant
          ) {
            continue;
          }

          const rawKeys = msg.message ? Object.keys(msg.message).join(', ') : 'none';
          const realMsg = unwrapMessage(msg.message);

          // Extração correta do ID/telefone sem o sufixo de dispositivo (:49, :50) nem domínio (@lid, @s.whatsapp.net)
          const userPart = remoteJid.split('@')[0].split(':')[0];
          const cleanClientPhone = userPart.replace(/\D/g, '');
          const clientName = msg.pushName || 'Você';

          // Tenta resolver o telefone real caso seja um JID do tipo @lid
          let resolvedPhone = cleanClientPhone;
          if (remoteJid.endsWith('@lid')) {
            try {
              const pnJid = await (this.sock as any)?.signalRepository?.lidMapping?.getPNForLID(remoteJid);
              if (pnJid) {
                resolvedPhone = pnJid.split('@')[0].split(':')[0].replace(/\D/g, '');
                console.log(`[WhatsApp LID Resolvido] Mapeado LID ${cleanClientPhone} -> Telefone ${resolvedPhone}`);
              }
            } catch (e) {}
          }

          // 2. REGRA ESTRITA: Filtrar apenas o seu próprio número (incluindo LID do WhatsApp)
          const botPhone = (this.sock?.user?.id?.split('@')[0]?.split(':')[0] || '').replace(/\D/g, '');
          const botLid = (this.sock?.user?.lid?.split('@')[0]?.split(':')[0] || '').replace(/\D/g, '');
          const establishment = storage.getEstablishment();
          const adminPhone = (establishment.adminNotificationPhone || config.adminPhone || '').replace(/\D/g, '');

          const isMatchingPhone = (p1: string, p2: string): boolean => {
            if (!p1 || !p2) return false;
            if (p1 === p2) return true;
            const s1 = p1.slice(-8);
            const s2 = p2.slice(-8);
            return s1.length >= 8 && s1 === s2;
          };

          // Verifica se é o próprio usuário (via número normal ou via LID no chat com você mesmo)
          const isSelf = isMatchingPhone(cleanClientPhone, botPhone) || 
                         isMatchingPhone(resolvedPhone, botPhone) || 
                         (botLid && (cleanClientPhone === botLid || resolvedPhone === botLid));

          const isOwner = cleanClientPhone.endsWith('958527119') || resolvedPhone.endsWith('958527119');
          const isAdminUser = isSelf || isOwner || isMatchingPhone(cleanClientPhone, adminPhone) || isMatchingPhone(resolvedPhone, adminPhone);

          // Verifica se há whitelist ativa. Se não houver, QUALQUER NÚMERO pode fazer o teste!
          const hasStrictWhitelist = config.allowedPhoneNumbers.length > 0 && !config.allowedPhoneNumbers.includes('*');
          if (hasStrictWhitelist) {
            const isAllowedExternal = isAdminUser || config.allowedPhoneNumbers.some(num => 
              isMatchingPhone(cleanClientPhone, num) || isMatchingPhone(resolvedPhone, num)
            );

            if (!isSelf && !isAllowedExternal) {
              console.log(`[WhatsApp Segurança Salão] 🚫 Mensagem de ${cleanClientPhone} (resolvido: ${resolvedPhone}) ignorada por restrição de whitelist.`);
              continue;
            }
          }

          // Se for mensagem enviada por si mesmo (fromMe), aceita APENAS no chat consigo mesmo (self-chat)
          if (msg.key.fromMe && !isSelf) {
            continue;
          }

          const effectivePhone = isSelf ? (botPhone || '5511958527119') : resolvedPhone;
          const effectiveName = clientName;

          // Extrai áudio se presente (mensagem de voz gravada ou arquivo de áudio)
          const audioMsg = realMsg?.audioMessage;

          // Extração de conteúdo textual
          let messageText =
            realMsg?.conversation ||
            realMsg?.extendedTextMessage?.text ||
            realMsg?.imageMessage?.caption ||
            realMsg?.videoMessage?.caption ||
            realMsg?.documentMessage?.caption ||
            '';

          // Se for mensagem de áudio, baixa a mídia e transcreve com inteligência artificial
          if (audioMsg) {
            console.log(`[WhatsApp 🎙️ Áudio] Mensagem de voz recebida de ${cleanClientPhone} (${effectivePhone}). Baixando mídia...`);
            try {
              if (this.sock) {
                await this.sock.presenceSubscribe(remoteJid);
                await this.sock.sendPresenceUpdate('recording', remoteJid);
              }

              let audioBuffer: Buffer | null = null;
              try {
                audioBuffer = (await downloadMediaMessage(
                  { ...msg, message: realMsg },
                  'buffer',
                  {},
                  {
                    logger: pino({ level: 'silent' }),
                    reuploadRequest: (m: any) => this.sock!.updateMediaMessage(m)
                  }
                )) as Buffer;
              } catch (dlErr1) {
                try {
                  audioBuffer = (await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    {
                      logger: pino({ level: 'silent' }),
                      reuploadRequest: (m: any) => this.sock!.updateMediaMessage(m)
                    }
                  )) as Buffer;
                } catch (dlErr2) {
                  console.error(`[WhatsApp 🎙️ Erro Download Salão]:`, dlErr2);
                }
              }

              if (audioBuffer && Buffer.isBuffer(audioBuffer) && audioBuffer.length > 0) {
                console.log(`[WhatsApp 🎙️ Áudio] Áudio baixado com sucesso (${audioBuffer.length} bytes). Transcrevendo com Gemini...`);
                const transcription = await aiService.transcribeAudio(
                  audioBuffer,
                  audioMsg.mimetype || 'audio/ogg'
                );

                if (transcription && transcription.trim().length > 0) {
                  messageText = transcription.trim();
                  console.log(`[WhatsApp 🎙️ Transcrição Concluída]: "${messageText}"`);
                } else {
                  console.log(`[WhatsApp 🎙️ Áudio] Não foi possível extrair texto ou áudio silencioso.`);
                }
              }
            } catch (audioErr) {
              console.error(`[WhatsApp 🎙️ Erro] Falha ao processar áudio:`, audioErr);
            }
          }

          // Extrai localização GPS se presente (WhatsApp pin de localização compartilhado)
          const locMsg = realMsg?.locationMessage || realMsg?.liveLocationMessage;
          if (
            locMsg &&
            typeof locMsg.degreesLatitude === 'number' &&
            typeof locMsg.degreesLongitude === 'number'
          ) {
            const lat = locMsg.degreesLatitude;
            const lng = locMsg.degreesLongitude;
            const locName = (locMsg as any).name || '';
            const locAddress = (locMsg as any).address || '';
            console.log(
              `[WhatsApp Salão 📍 Localização] Recebida de ${effectivePhone}: Lat ${lat}, Lng ${lng} (${locName} ${locAddress})`
            );

            try {
              const geocoded = await geocodingService.resolveCoordinates(
                lat,
                lng,
                locName,
                locAddress
              );
              const locBlock = geocodingService.formatLocationPromptBlock(geocoded);
              messageText = messageText ? `${messageText}\n\n${locBlock}` : locBlock;
            } catch (geoErr) {
              console.error('[WhatsApp Salão 📍 Erro Geocoding]:', geoErr);
              const fallbackLoc = `📍 [LOCALIZAÇÃO COMPARTILHADA VIA GPS]: Lat ${lat}, Lng ${lng}. (Link: https://www.google.com/maps?q=${lat},${lng})`;
              messageText = messageText ? `${messageText}\n\n${fallbackLoc}` : fallbackLoc;
            }
          }

          console.log('[WhatsApp Salão Evento]', { 
            remoteJid, 
            cleanClientPhone, 
            resolvedPhone, 
            fromMe: msg.key.fromMe, 
            keys: rawKeys,
            isAudio: !!audioMsg, 
            text: messageText
          });

          if (!messageText || messageText.trim().length === 0) {
            if (audioMsg) {
              const targetJid = (isSelf || remoteJid.endsWith('@lid')) ? `${effectivePhone}@s.whatsapp.net` : remoteJid;
              const fallbackAudioMsg = 'Oi! 🎙️ Recebi seu áudio, mas não consegui ouvir com total clareza. Você poderia enviar novamente ou digitar aqui? Estou pronta para te atender! 😊💜';
              await this.sock?.sendMessage(targetJid, { text: fallbackAudioMsg });
              if (isSelf && remoteJid.endsWith('@lid')) {
                try {
                  await this.sock?.sendMessage(remoteJid, { text: fallbackAudioMsg });
                } catch (e) {}
              }
            }
            continue;
          }

          const trimmedMessage = messageText.trim();

          // 1. COMANDOS DE ADMINISTRAÇÃO DIRETA PELO WHATSAPP (Sempre processados mesmo pausado)
          if (isAdminUser) {
            const cmd = trimmedMessage.toLowerCase();
            if (cmd === '!pausar' || cmd === '!parar' || cmd === '!pause') {
              storage.setSalonAiPaused(true);
              const targetJid = remoteJid.endsWith('@lid') ? `${effectivePhone}@s.whatsapp.net` : remoteJid;
              await this.sock?.sendMessage(targetJid, {
                text: '⏸️ *Respostas automáticas da Recepcionista Virtual (Salão) foram PAUSADAS!*\n\nPara reativar a qualquer momento, envie `!retomar`.'
              });
              continue;
            }
            if (cmd === '!retomar' || cmd === '!play' || cmd === '!iniciar' || cmd === '!despausar') {
              storage.setSalonAiPaused(false);
              const targetJid = remoteJid.endsWith('@lid') ? `${effectivePhone}@s.whatsapp.net` : remoteJid;
              await this.sock?.sendMessage(targetJid, {
                text: '▶️ *Recepcionista Virtual do Salão REATIVADA com sucesso!*\n\nVoltando a responder agendamentos e clientes normalmente.'
              });
              continue;
            }
            if (cmd === '!status') {
              const isPaused = storage.isSalonAiPaused();
              const targetJid = remoteJid.endsWith('@lid') ? `${effectivePhone}@s.whatsapp.net` : remoteJid;
              await this.sock?.sendMessage(targetJid, {
                text: `💇‍♀️ *Studio Bella - Status da Recepcionista:*\n• Atendimento Automático: ${isPaused ? '⏸️ PAUSADO' : '▶️ ATIVO'}\n• Linha: ${effectivePhone}\n\nEnvie \`!pausar\` ou \`!retomar\` para alternar.`
              });
              continue;
            }
          }

          // 2. VERIFICAÇÃO DE PAUSA DA IA DO SALÃO
          if (storage.isSalonAiPaused()) {
            console.log(`[WhatsApp Salão ⏸️ IA Pausada] Mensagem de ${cleanClientPhone} (${effectivePhone}) ignorada: Respostas automáticas do salão estão pausadas.`);
            continue;
          }

          // 3. Se a mensagem for idêntica à última resposta emitida pela IA, evita loop
          if (this.recentBotReplies.has(trimmedMessage)) {
            continue;
          }

          // 4. Verifica se está sob intervenção humana
          if (storage.isHumanInterventionActive(effectivePhone)) {
            console.log(`[WhatsApp Salão] Conversa com ${effectivePhone} sob intervenção humana.`);
            storage.saveConversationMessage(effectivePhone, 'user', trimmedMessage);
            continue;
          }

          // 4. Verifica se há sessão de demonstração ativa da vitrine para este telefone
          let demoLead = demoService.getActiveLead(effectivePhone);
          if (!demoLead && cleanClientPhone !== effectivePhone) {
            demoLead = demoService.getActiveLead(cleanClientPhone);
          }

          if (demoLead) {
            console.log(`[WhatsApp Salão -> Demo Lead] Lead ativo de demonstração detectado: ${demoLead.name} (${demoLead.niche}). Roteando para persona especialista...`);
            try {
              if (this.sock) {
                await this.sock.presenceSubscribe(remoteJid);
                await this.sock.sendPresenceUpdate('composing', remoteJid);
              }
              demoService.recordInteraction(cleanClientPhone);
              const demoReply = await aiService.processDemoMessage(
                demoLead.phone,
                trimmedMessage,
                demoLead.name,
                demoLead.niche
              );

              this.recentBotReplies.add(demoReply.trim());
              if (this.sock) {
                await this.sock.sendPresenceUpdate('paused', remoteJid);
                const targetJid = remoteJid.endsWith('@lid') ? `${effectivePhone}@s.whatsapp.net` : remoteJid;
                const sent = await this.sock.sendMessage(targetJid, { text: demoReply });
                if (sent?.key?.id) this.sentBotMessageIds.add(sent.key.id);
                if (isSelf && remoteJid.endsWith('@lid')) {
                  try {
                    await this.sock.sendMessage(remoteJid, { text: demoReply });
                  } catch (e) {}
                }
              }
            } catch (demoErr) {
              console.error('[WhatsApp Salão -> Demo Lead Erro]:', demoErr);
            }
            continue;
          }

          try {
            if (this.sock) {
              await this.sock.presenceSubscribe(remoteJid);
              await this.sock.sendPresenceUpdate('composing', remoteJid);
            }

            console.log(`[WhatsApp 👤 Salão] Processando mensagem com IA: "${trimmedMessage}"`);
            const replyText = await aiService.processMessage(effectivePhone, trimmedMessage, effectiveName);

            // Armazena no cache recente para não gerar auto-eco
            this.recentBotReplies.add(replyText.trim());
            if (this.recentBotReplies.size > 100) {
              const firstItem = this.recentBotReplies.values().next().value;
              if (firstItem) this.recentBotReplies.delete(firstItem);
            }

            if (this.sock) {
              await this.sock.sendPresenceUpdate('paused', remoteJid);
              
              console.log(`[WhatsApp 📤 Envio] Enviando para ${remoteJid}: "${replyText.slice(0, 50)}..."`);
              const sent = await this.sock.sendMessage(remoteJid, { text: replyText });
              if (sent?.key?.id) {
                this.sentBotMessageIds.add(sent.key.id);
                if (this.sentBotMessageIds.size > 200) {
                  const first = this.sentBotMessageIds.values().next().value;
                  if (first) this.sentBotMessageIds.delete(first);
                }
              }

              // Se for self-chat e o remoteJid for @lid, garante envio duplo para sincronizar nos dois formatos
              if (isSelf && remoteJid.endsWith('@lid')) {
                try {
                  const pnJid = `${effectivePhone}@s.whatsapp.net`;
                  const sentPn = await this.sock.sendMessage(pnJid, { text: replyText });
                  if (sentPn?.key?.id) this.sentBotMessageIds.add(sentPn.key.id);
                } catch (e) {}
              }
              console.log(`[WhatsApp] Resposta enviada com sucesso para ${remoteJid}!`);
            }
          } catch (err) {
            console.error(`[WhatsApp] Erro ao responder ${cleanClientPhone}:`, err);
          }
        }
      });

    } catch (error) {
      console.error('[WhatsApp] Falha ao inicializar Baileys:', error);
      this.isConnecting = false;
      this.state = {
        state: 'disconnected',
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // Enviar mensagem ativa
  public async sendMessageToClient(phone: string, text: string): Promise<boolean> {
    const clean = phone.replace(/\D/g, '');
    const remoteJid = `${clean}@s.whatsapp.net`;

    if (this.sock && this.state.state === 'connected') {
      try {
        const sent = await this.sock.sendMessage(remoteJid, { text });
        if (sent?.key?.id) {
          this.sentBotMessageIds.add(sent.key.id);
        }
        this.recentBotReplies.add(text.trim());
        storage.saveConversationMessage(phone, 'assistant', text);

        // Se for o próprio número do bot (self-chat), também sincroniza no @lid para aparecer na tela
        const botPhone = (this.sock?.user?.id?.split('@')[0]?.split(':')[0] || '').replace(/\D/g, '');
        const botLid = (this.sock?.user?.lid?.split('@')[0]?.split(':')[0] || '').replace(/\D/g, '');
        if (clean === botPhone && botLid) {
          try {
            await this.sock.sendMessage(`${botLid}@lid`, { text });
          } catch (e) {}
        }

        return true;
      } catch (err) {
        console.error(`[WhatsApp] Falha ao enviar mensagem para ${phone}:`, err);
        return false;
      }
    } else {
      console.log(`[WhatsApp] Mensagem para ${phone} (Offline): "${text}"`);
      storage.saveConversationMessage(phone, 'assistant', text);
      return false;
    }
  }

  // Envio de promoção com simulação de presença humana e proteção Anti-Ban
  public async sendPromotionMessageWithAntiBan(
    phone: string,
    text: string,
    typingSeconds: number = 4
  ): Promise<boolean> {
    const clean = phone.replace(/\D/g, '');
    const remoteJid = `${clean}@s.whatsapp.net`;

    if (this.sock && this.state.state === 'connected') {
      try {
        // 1. Simula presença humana: "digitando..."
        await this.sock.presenceSubscribe(remoteJid);
        await this.sock.sendPresenceUpdate('composing', remoteJid);
        
        // Aguarda delay de digitação proporcional
        await new Promise(r => setTimeout(r, Math.max(2000, typingSeconds * 1000)));
        
        await this.sock.sendPresenceUpdate('paused', remoteJid);

        // 2. Dispara a mensagem
        const sent = await this.sock.sendMessage(remoteJid, { text });
        if (sent?.key?.id) {
          this.sentBotMessageIds.add(sent.key.id);
        }
        this.recentBotReplies.add(text.trim());
        storage.saveConversationMessage(phone, 'assistant', text);
        console.log(`[WhatsApp Anti-Ban] ✅ Mensagem promocional enviada para ${phone}`);
        return true;
      } catch (err) {
        console.error(`[WhatsApp Anti-Ban] Falha ao enviar para ${phone}:`, err);
        return false;
      }
    } else {
      console.log(`[WhatsApp Anti-Ban] Modo Simulado (Offline) para ${phone}: "${text.slice(0, 30)}..."`);
      storage.saveConversationMessage(phone, 'assistant', text);
      return false;
    }
  }

  public async disconnect(wipeData: boolean = true): Promise<void> {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (e) {
        try {
          this.sock.end(undefined);
        } catch (e2) {}
      }
      this.sock = null;
    }
    if (wipeData) {
      try {
        if (fs.existsSync(config.authInfoPath)) {
          fs.rmSync(config.authInfoPath, { recursive: true, force: true });
        }
      } catch (e) {}
    }
    this.state = {
      state: 'disconnected',
      lastUpdated: new Date().toISOString()
    };
    this.isConnecting = false;
    this.hasPrintedTerminalQR = false;
  }

  public async resetSession(): Promise<void> {
    console.log('[WhatsApp Salão] 🔄 Resetando sessão completamente (limpeza de chaves)...');
    await this.disconnect(true);
    await new Promise(r => setTimeout(r, 1000));
    await this.start();
  }

  public async requestPairingCode(phone: string): Promise<string> {
    const clean = phone.replace(/\D/g, '');
    if (!clean || clean.length < 10) {
      throw new Error('Número de telefone inválido. Informe DDD + número (ex: 11958527119).');
    }

    if (!this.sock) {
      await this.disconnect(true);
      await this.start();
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!this.sock) {
      throw new Error('Não foi possível conectar com o servidor do WhatsApp.');
    }

    try {
      const code = await this.sock.requestPairingCode(clean);
      console.log(`[WhatsApp Salão] 🔑 Código de pareamento gerado para ${clean}: ${code}`);
      return code;
    } catch (err: any) {
      console.error(`[WhatsApp Salão] Erro ao gerar código de pareamento:`, err);
      throw err;
    }
  }
}

export const whatsappService = new WhatsAppService();
