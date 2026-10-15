import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  WASocket
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { config } from '../config.js';
import { aiService } from './ai.js';
import { storage } from '../db/storage.js';
import { demoService } from './demo.js';
import { WhatsAppState } from '../types.js';

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
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.state = {
        state: 'connecting',
        lastUpdated: new Date().toISOString()
      };

      const { state, saveCreds } = await useMultiFileAuthState(config.authInfoPath);
      const { version } = await fetchLatestBaileysVersion();
      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        version,
        logger,
        auth: state,
        printQRInTerminal: false,
        browser: ['Salão de Beleza AI', 'Chrome', '1.0.0']
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          if (!this.hasPrintedTerminalQR) {
            console.log('\n=========================================');
            console.log('  📲 ESCANEIE O QR CODE NO SEU WHATSAPP');
            console.log('  (Também disponível em http://localhost:' + config.port + ')');
            console.log('=========================================\n');
            qrcodeTerminal.generate(qr, { small: true });
            this.hasPrintedTerminalQR = true;
          }

          try {
            const dataUrl = await QRCode.toDataURL(qr);
            this.state = {
              state: 'qr_ready',
              qrCodeDataUrl: dataUrl,
              lastUpdated: new Date().toISOString()
            };
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
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`[WhatsApp] Sessão desconectada (código ${statusCode}). Reconectar: ${shouldReconnect}`);

          this.state = {
            state: 'disconnected',
            qrCodeDataUrl: undefined,
            lastUpdated: new Date().toISOString()
          };
          this.isConnecting = false;

          if (shouldReconnect) {
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

          const isAllowedExternal = [adminPhone, ...config.allowedPhoneNumbers].filter(Boolean).some(num => 
            isMatchingPhone(cleanClientPhone, num) || isMatchingPhone(resolvedPhone, num)
          );

          // Verifica se há sessão ativa de demonstração pelo telefone ou pelo LID
          const activeDemoLead = demoService.getActiveLead(resolvedPhone) || demoService.getActiveLead(cleanClientPhone);

          if (!isSelf && !isAllowedExternal && !activeDemoLead) {
            console.log(`[WhatsApp Segurança] 🚫 Mensagem de ${cleanClientPhone} (resolvido: ${resolvedPhone}) ignorada: apenas seu próprio número ou leads da vitrine têm permissão.`);
            continue;
          }

          // Se for mensagem enviada por si mesmo (fromMe), aceita APENAS no chat consigo mesmo (self-chat)
          if (msg.key.fromMe && !isSelf) {
            continue;
          }

          const effectivePhone = isSelf ? (botPhone || '5511951364159') : (activeDemoLead ? activeDemoLead.phone : resolvedPhone);
          const effectiveName = activeDemoLead ? activeDemoLead.name : clientName;

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

              const msgToDownload = { ...msg, message: realMsg };
              const audioBuffer = await downloadMediaMessage(
                msgToDownload,
                'buffer',
                {},
                {
                  logger: pino({ level: 'silent' }),
                  reuploadRequest: (m: any) => this.sock!.updateMediaMessage(m)
                }
              );

              if (audioBuffer && Buffer.isBuffer(audioBuffer)) {
                console.log(`[WhatsApp 🎙️ Áudio] Áudio baixado (${audioBuffer.length} bytes). Transcrevendo com Gemini...`);
                const transcription = await aiService.transcribeAudio(
                  audioBuffer,
                  audioMsg.mimetype || 'audio/ogg'
                );

                if (transcription && transcription.trim().length > 0) {
                  messageText = transcription.trim();
                  console.log(`[WhatsApp 🎙️ Transcrição Concluída]: "${messageText}"`);
                } else {
                  console.log(`[WhatsApp 🎙️ Áudio] Não foi possível extrair texto do áudio.`);
                }
              }
            } catch (audioErr) {
              console.error(`[WhatsApp 🎙️ Erro] Falha ao processar áudio:`, audioErr);
            }
          }

          console.log('[WhatsApp Evento]', { 
            remoteJid, 
            cleanClientPhone, 
            resolvedPhone, 
            fromMe: msg.key.fromMe, 
            keys: rawKeys,
            isAudio: !!audioMsg, 
            text: messageText, 
            isDemo: !!activeDemoLead 
          });

          if (!messageText || messageText.trim().length === 0) {
            if (audioMsg) {
              const targetJid = (isSelf || remoteJid.endsWith('@lid')) ? `${effectivePhone}@s.whatsapp.net` : remoteJid;
              await this.sock?.sendMessage(targetJid, {
                text: 'Oi! Recebi seu áudio, mas o som ficou um pouquinho baixo ou cortado. Poderia enviar novamente ou digitar aqui? Estou pronta para te atender! 😊💜'
              });
            }
            continue;
          }

          const trimmedMessage = messageText.trim();

          // 1. COMANDOS DE ADMINISTRAÇÃO DIRETA PELO WHATSAPP (Sempre processados mesmo pausado)
          if (isSelf || isAllowedExternal) {
            const cmd = trimmedMessage.toLowerCase();
            if (cmd === '!pausar' || cmd === '!parar' || cmd === '!pause') {
              storage.setGlobalAiPaused(true);
              const targetJid = remoteJid.endsWith('@lid') ? `${effectivePhone}@s.whatsapp.net` : remoteJid;
              await this.sock?.sendMessage(targetJid, {
                text: '⏸️ *Respostas automáticas da IA foram PAUSADAS com sucesso!*\n\nO bot não responderá mais a nenhuma mensagem nem atenderá clientes ou testes até que você envie `!retomar`.'
              });
              continue;
            }
            if (cmd === '!retomar' || cmd === '!play' || cmd === '!iniciar' || cmd === '!despausar') {
              storage.setGlobalAiPaused(false);
              const targetJid = remoteJid.endsWith('@lid') ? `${effectivePhone}@s.whatsapp.net` : remoteJid;
              await this.sock?.sendMessage(targetJid, {
                text: '▶️ *Respostas automáticas da IA REATIVADAS com sucesso!*\n\nO bot voltará a responder clientes e demonstrações normalmente.'
              });
              continue;
            }
            if (cmd === '!status') {
              const isPaused = storage.isGlobalAiPaused();
              const targetJid = remoteJid.endsWith('@lid') ? `${effectivePhone}@s.whatsapp.net` : remoteJid;
              await this.sock?.sendMessage(targetJid, {
                text: `🤖 *RH de Agentes IA - Status Atual:*\n• Respostas Automáticas: ${isPaused ? '⏸️ PAUSADAS' : '▶️ ATIVAS'}\n• Linha: ${effectivePhone}\n\nEnvie \`!pausar\` ou \`!retomar\` para alternar.`
              });
              continue;
            }
          }

          // 2. VERIFICAÇÃO DE PAUSA GLOBAL
          if (storage.isGlobalAiPaused()) {
            console.log(`[WhatsApp ⏸️ IA Pausada] Mensagem de ${cleanClientPhone} (${effectivePhone}) ignorada: Respostas automáticas estão pausadas globalmente.`);
            continue;
          }

          // 3. PROTEÇÃO ANTI-LOOP: Detecta se a mensagem recebida é de outro robô/assistente
          if (demoService.isPotentialBot(trimmedMessage)) {
            console.log(`[WhatsApp 🤖 Anti-Loop] Detectada mensagem de outro assistente/bot vinda de ${cleanClientPhone}. Abortando envio para evitar loop.`);
            if (activeDemoLead) {
              demoService.completeDemoLead(activeDemoLead.id);
            }
            continue;
          }

          // 4. Se a mensagem for idêntica à última resposta emitida pela IA, evita loop
          if (this.recentBotReplies.has(trimmedMessage)) {
            continue;
          }

          // 5. Verifica se está sob intervenção humana
          if (storage.isHumanInterventionActive(effectivePhone)) {
            console.log(`[WhatsApp] Conversa com ${effectivePhone} sob intervenção humana.`);
            storage.saveConversationMessage(effectivePhone, 'user', trimmedMessage);
            continue;
          }

          // 6. LIMITE DE MENSAGENS PARA DEMOS DA VITRINE (Máximo 8 mensagens por lead)
          if (activeDemoLead && demoService.isLeadLimitReached(activeDemoLead)) {
            console.log(`[WhatsApp Vitrine Demo] Limite de mensagens atingido para lead ${activeDemoLead.name} (${activeDemoLead.phone}).`);
            const completionMsg = `🌟 *Demonstração ao vivo concluída com sucesso!*\n\nVocê pôde comprovar na prática a velocidade, precisão e o atendimento humanizado do nosso colaborador digital do *RH de Agentes IA*!\n\n🚀 Para contratar e ativar este agente com um número exclusivo no seu negócio, acesse nosso site ou fale com nosso time!`;
            demoService.completeDemoLead(activeDemoLead.id);
            const targetJid = remoteJid.endsWith('@lid') ? `${effectivePhone}@s.whatsapp.net` : remoteJid;
            await this.sock?.sendMessage(targetJid, { text: completionMsg });
            continue;
          }

          try {
            if (this.sock) {
              await this.sock.presenceSubscribe(remoteJid);
              await this.sock.sendPresenceUpdate('composing', remoteJid);
            }

            let replyText = '';
            if (activeDemoLead) {
              console.log(`[WhatsApp Vitrine Demo 🌟] Respondendo lead "${activeDemoLead.name}" (${activeDemoLead.niche}): "${trimmedMessage}"`);
              demoService.recordInteraction(cleanClientPhone);
              replyText = await aiService.processDemoMessage(
                effectivePhone,
                trimmedMessage,
                activeDemoLead.name,
                activeDemoLead.niche
              );
            } else {
              console.log(`[WhatsApp 👤 Seu Número] Processando mensagem com IA do Salão: "${trimmedMessage}"`);
              replyText = await aiService.processMessage(effectivePhone, trimmedMessage, effectiveName);
            }

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

        // Se o Baileys mapear o LID deste telefone, associa no demoService
        try {
          const lidJid = await (this.sock as any)?.signalRepository?.lidMapping?.getLIDForPN(remoteJid);
          if (lidJid) {
            const cleanLid = lidJid.split('@')[0].split(':')[0].replace(/\D/g, '');
            demoService.mapLidToPhone(cleanLid, clean);
          }
        } catch (e) {}

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

  public async disconnect(): Promise<void> {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (e) {}
      this.sock = null;
    }
    this.state = {
      state: 'disconnected',
      lastUpdated: new Date().toISOString()
    };
  }
}

export const whatsappService = new WhatsAppService();
