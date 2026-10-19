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
import { demoService, NICHE_PERSONAS } from './demo.js';
import { DemoNiche, WhatsAppState } from '../types.js';
import { geocodingService } from './geocoding.js';
import { dashboardDemoService } from './dashboard-demo.js';

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

export class PortalWhatsAppService {
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

      const { state, saveCreds } = await useMultiFileAuthState(config.portalAuthInfoPath);
      const { version } = await fetchLatestBaileysVersion();
      const logger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        version,
        logger,
        auth: state,
        printQRInTerminal: false,
        browser: ['RH de Agentes IA', 'Chrome', '1.0.0']
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          if (!this.hasPrintedTerminalQR) {
            console.log('\n=========================================');
            console.log('  📲 ESCANEIE O QR CODE DO PORTAL DAS IAs');
            console.log('  (RH de Agentes IA - Linha Dedicada 2)');
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
          } catch (e) {
            console.error('[Portal WhatsApp] Erro ao gerar DataURL do QR Code:', e);
          }
        }

        if (connection === 'open') {
          const userPhone = this.sock?.user?.id?.split(':')[0] || 'Desconhecido';
          console.log(`\n=================================================`);
          console.log(`✅ WhatsApp do PORTAL DAS IAs conectado com sucesso!`);
          console.log(`📞 Linha Dedicada da Vitrine: ${userPhone}`);
          console.log(`🤖 Atendendo Personas: Petshop, Estética, Dentista, Médico, Barbearia, Jarvis, Pizzaria`);
          console.log(`=================================================\n`);

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

          console.log(`[Portal WhatsApp] Sessão desconectada (código ${statusCode}). Reconectar: ${shouldReconnect}`);

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

      // Trata mensagens recebidas na linha dedicada da Vitrine / Portal de IAs
      this.sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify' && m.type !== 'append') return;

        for (const msg of m.messages) {
          if (!msg.message) continue;
          if (msg.key.id && this.sentBotMessageIds.has(msg.key.id)) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid) continue;

          // 1. Filtrar grupos, status, canais ou transmissões
          if (
            remoteJid.endsWith('@g.us') ||
            remoteJid.includes('@broadcast') ||
            remoteJid.endsWith('@newsletter') ||
            msg.key.participant
          ) {
            continue;
          }

          // Se a mensagem foi enviada por si mesmo (fromMe) e não for chat de teste, ignora
          const botPhone = (this.sock?.user?.id?.split('@')[0]?.split(':')[0] || '').replace(/\D/g, '');
          const botLid = (this.sock?.user?.lid?.split('@')[0]?.split(':')[0] || '').replace(/\D/g, '');
          const userPart = remoteJid.split('@')[0].split(':')[0];
          const cleanClientPhone = userPart.replace(/\D/g, '');

          const isMatchingPhone = (p1: string, p2: string): boolean => {
            if (!p1 || !p2) return false;
            if (p1 === p2) return true;
            const s1 = p1.slice(-8);
            const s2 = p2.slice(-8);
            return s1.length >= 8 && s1 === s2;
          };

          const isSelf = isMatchingPhone(cleanClientPhone, botPhone) || (botLid && cleanClientPhone === botLid);

          if (msg.key.fromMe && !isSelf) {
            continue;
          }

          // Tenta resolver o telefone real caso seja LID
          let resolvedPhone = cleanClientPhone;
          if (remoteJid.endsWith('@lid')) {
            try {
              const pnJid = await (this.sock as any)?.signalRepository?.lidMapping?.getPNForLID(remoteJid);
              if (pnJid) {
                resolvedPhone = pnJid.split('@')[0].split(':')[0].replace(/\D/g, '');
                console.log(`[Portal WhatsApp LID Resolvido] Mapeado LID ${cleanClientPhone} -> Telefone ${resolvedPhone}`);
              }
            } catch (e) {}
          }

          const realMsg = unwrapMessage(msg.message);
          const clientName = msg.pushName || 'Visitante';

          // Extrai áudio se presente
          const audioMsg = realMsg?.audioMessage;
          let messageText =
            realMsg?.conversation ||
            realMsg?.extendedTextMessage?.text ||
            realMsg?.imageMessage?.caption ||
            realMsg?.videoMessage?.caption ||
            realMsg?.documentMessage?.caption ||
            '';

          // Transcreve áudio com Gemini
          if (audioMsg) {
            console.log(`[Portal WhatsApp 🎙️ Áudio] Áudio recebido de ${resolvedPhone}. Processando...`);
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
                  console.error(`[Portal WhatsApp 🎙️ Erro Download]:`, dlErr2);
                }
              }

              if (audioBuffer && Buffer.isBuffer(audioBuffer) && audioBuffer.length > 0) {
                console.log(`[Portal WhatsApp 🎙️ Áudio] Áudio baixado com sucesso (${audioBuffer.length} bytes). Transcrevendo com Gemini...`);
                const transcription = await aiService.transcribeAudio(
                  audioBuffer,
                  audioMsg.mimetype || 'audio/ogg'
                );
                if (transcription && transcription.trim().length > 0) {
                  messageText = transcription.trim();
                  console.log(`[Portal WhatsApp 🎙️ Transcrição]: "${messageText}"`);
                } else {
                  console.log(`[Portal WhatsApp 🎙️ Áudio] Transcrição vazia ou áudio inaudível.`);
                }
              }
            } catch (audioErr) {
              console.error(`[Portal WhatsApp 🎙️ Erro] Falha no áudio:`, audioErr);
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
              `[Portal WhatsApp 📍 Localização] Recebida de ${resolvedPhone}: Lat ${lat}, Lng ${lng} (${locName} ${locAddress})`
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
              console.error('[Portal WhatsApp 📍 Erro Geocoding]:', geoErr);
              const fallbackLoc = `📍 [LOCALIZAÇÃO COMPARTILHADA VIA GPS]: Lat ${lat}, Lng ${lng}. (Link: https://www.google.com/maps?q=${lat},${lng})`;
              messageText = messageText ? `${messageText}\n\n${fallbackLoc}` : fallbackLoc;
            }
          }

          const trimmedMessage = messageText.trim();
          if (!trimmedMessage) {
            if (audioMsg) {
              console.log(`[Portal WhatsApp 🎙️ Fallback] Enviando aviso amigável de áudio inaudível para ${resolvedPhone}...`);
              const targetJid = remoteJid.endsWith('@lid') ? `${resolvedPhone}@s.whatsapp.net` : remoteJid;
              const fallbackAudioMsg = '🎙️ Recebi seu áudio, mas não consegui ouvir com total clareza. Você poderia me mandar em texto ou tentar gravar novamente por favor? Estou aqui para te atender! 😊';
              await this.sock?.sendMessage(targetJid, { text: fallbackAudioMsg });
              if (isSelf && remoteJid.endsWith('@lid')) {
                try {
                  await this.sock?.sendMessage(remoteJid, { text: fallbackAudioMsg });
                } catch (e) {}
              }
            }
            continue;
          }

          // Comandos de administração na Linha do Portal
          const cmd = trimmedMessage.toLowerCase();
          if (cmd === '!pausar' || cmd === '!parar') {
            storage.setPortalAiPaused(true);
            const targetJid = remoteJid.endsWith('@lid') ? `${resolvedPhone}@s.whatsapp.net` : remoteJid;
            await this.sock?.sendMessage(targetJid, {
              text: '⏸️ *Demonstrações do Portal das IAs foram PAUSADAS.*\nPara reativar, envie `!retomar`.'
            });
            continue;
          }
          if (cmd === '!retomar' || cmd === '!play') {
            storage.setPortalAiPaused(false);
            const targetJid = remoteJid.endsWith('@lid') ? `${resolvedPhone}@s.whatsapp.net` : remoteJid;
            await this.sock?.sendMessage(targetJid, {
              text: '▶️ *Demonstrações do Portal das IAs REATIVADAS com sucesso!*'
            });
            continue;
          }
          if (cmd === '!status') {
            const isPaused = storage.isPortalAiPaused();
            const targetJid = remoteJid.endsWith('@lid') ? `${resolvedPhone}@s.whatsapp.net` : remoteJid;
            await this.sock?.sendMessage(targetJid, {
              text: `🤖 *RH de Agentes IA (Portal - Linha 2):*\n• Status: ${isPaused ? '⏸️ PAUSADO' : '▶️ ATIVO'}\n• Número: ${botPhone}`
            });
            continue;
          }

          // Busca lead ativo no serviço de demonstração
          let lead = demoService.getActiveLead(resolvedPhone) || demoService.getActiveLead(cleanClientPhone);

          // Comando do Dashboard / Painel Gerencial
          const isPainelRequest =
            cmd === 'painel' ||
            cmd === '!painel' ||
            cmd === 'dashboard' ||
            cmd === 'ver painel' ||
            cmd === 'meu painel' ||
            cmd === 'link painel';

          if (isPainelRequest) {
            const currentNiche: DemoNiche = lead ? lead.niche : 'pizzaria';
            const persona = demoService.getPersona(currentNiche);
            const dashLink = dashboardDemoService.getDashboardLink(currentNiche, resolvedPhone);

            const painelMsg = `📊✨ *PAINEL DE GESTÃO DO(A) ${persona.businessName.toUpperCase()}*\n\n` +
              `Acesse seu Dashboard Gerencial em tempo real:\n` +
              `👉 *Link de Acesso:* ${dashLink}\n\n` +
              `🚀 *O que você pode gerenciar neste Painel:*\n` +
              `• 💰 *Financeiro & DRE:* Faturamento do mês, ticket médio, margem de lucro e gráficos diários.\n` +
              `• 👥 *Clientes & Promoções:* Cadastro dos clientes captados no WhatsApp + disparador de promoções com proteção anti-ban.\n` +
              `• 💼 *Equipe & Parceiros:* Controle de colaboradores, comissões % e repasses automáticos.\n` +
              `• 💸 *Custos & Contas:* Controle de despesas fixas (aluguel, energia, internet) e variáveis (fornecedores, insumos).\n` +
              `• 🤖 *Secretária de IA:* Acompanhamento em tempo real dos atendimentos e conversões 24h.\n\n` +
              `💡 _Clique no link acima para abrir o painel interativo agora mesmo no seu celular ou computador!_`;

            const targetJid = remoteJid.endsWith('@lid') ? `${resolvedPhone}@s.whatsapp.net` : remoteJid;
            await this.sock?.sendMessage(targetJid, { text: painelMsg });
            storage.saveConversationMessage(cleanClientPhone, 'assistant', painelMsg);
            continue;
          }

          // Verifica se o portal está pausado
          if (storage.isPortalAiPaused()) {
            console.log(`[Portal WhatsApp ⏸️ Pausado] Mensagem de ${resolvedPhone} ignorada.`);
            continue;
          }

          // Proteção anti-loop de outros robôs
          if (demoService.isPotentialBot(trimmedMessage)) {
            console.log(`[Portal WhatsApp 🤖 Anti-Loop] Mensagem de outro robô detectada de ${resolvedPhone}. Abortando.`);
            continue;
          }

          // Evita auto-eco
          if (this.recentBotReplies.has(trimmedMessage)) continue;

          // Se não há lead ativo, permite escolher um nicho diretamente por número (1 a 7) ou envia o menu de boas-vindas
          if (!lead) {
            const nicheChoiceMap: Record<string, DemoNiche> = {
              '1': 'petshop',
              '2': 'estetica',
              '3': 'dentista',
              '4': 'medico',
              '5': 'cabeleireiro',
              '6': 'pessoal',
              '7': 'pizzaria'
            };

            let chosenNiche: DemoNiche | undefined = nicheChoiceMap[trimmedMessage];
            if (!chosenNiche) {
              const lower = trimmedMessage.toLowerCase();
              if (lower.includes('1') || lower.includes('pet') || lower.includes('bob') || lower.includes('veterin') || lower === 'um') {
                chosenNiche = 'petshop';
              } else if (lower.includes('2') || lower.includes('estetica') || lower.includes('estética') || lower.includes('camila') || lower === 'dois') {
                chosenNiche = 'estetica';
              } else if (lower.includes('3') || lower.includes('dent') || lower.includes('mariana') || lower.includes('odonto') || lower === 'tres' || lower === 'três') {
                chosenNiche = 'dentista';
              } else if (lower.includes('4') || lower.includes('med') || lower.includes('médic') || lower.includes('helena') || lower.includes('consultorio') || lower === 'quatro') {
                chosenNiche = 'medico';
              } else if (lower.includes('5') || lower.includes('salao') || lower.includes('salão') || lower.includes('barbearia') || lower.includes('cabelo') || lower.includes('sofia') || lower === 'cinco') {
                chosenNiche = 'cabeleireiro';
              } else if (lower.includes('6') || lower.includes('jarvis') || lower.includes('executivo') || lower.includes('finan') || lower === 'seis') {
                chosenNiche = 'pessoal';
              } else if (lower.includes('7') || lower.includes('pizza') || lower.includes('luigi') || lower.includes('delivery') || lower === 'sete') {
                chosenNiche = 'pizzaria';
              }
            }

            if (chosenNiche) {
              const session = await demoService.startDemoSession(clientName, resolvedPhone, chosenNiche);
              lead = session.lead;
              const targetJid = remoteJid.endsWith('@lid') ? `${resolvedPhone}@s.whatsapp.net` : remoteJid;
              await this.sock?.sendMessage(targetJid, { text: session.openerMessage });

              // Notifica o dono Thiago (11 95852-7119) em tempo real que um teste foi iniciado!
              const ownerPhone = '5511958527119';
              if (resolvedPhone.replace(/\D/g, '') !== ownerPhone && this.sock) {
                const persona = demoService.getPersona(chosenNiche);
                const ownerAlert = `🔔 *[RH de Agentes IA - Novo Teste Iniciado]*\n\n` +
                  `👤 *Cliente:* ${clientName} (${resolvedPhone})\n` +
                  `🎯 *Agente Escolhido:* ${persona.agentName} - ${persona.title}\n` +
                  `🏢 *Negócio:* ${persona.businessName}\n\n` +
                  `_Aviso em tempo real para você como Dono do Negócio!_`;
                this.sendMessageToClient(ownerPhone, ownerAlert).catch(() => {});
              }
              continue;
            } else {
              // Responde menu interativo convidando para testar
              const targetJid = remoteJid.endsWith('@lid') ? `${resolvedPhone}@s.whatsapp.net` : remoteJid;
              const menuMsg = `Olá, ${clientName}! 🤖✨ Bem-vindo ao *RH de Agentes IA*!\n\nAqui você pode recrutar colaboradores digitais inteligentes de alta performance para o WhatsApp do seu negócio.\n\nEscolha qual colaborador você quer entrevistar agora:\n\n🐾 Digite *1* para *Pet Shop & Veterinária* (Bob)\n💆‍♀️ Digite *2* para *Clínica de Estética* (Camila)\n🦷 Digite *3* para *Consultório Odontológico* (Dra. Mariana)\n🩺 Digite *4* para *Secretária Médica* (Helena)\n✂️ Digite *5* para *Salão & Barbearia* (Sofia)\n👔 Digite *6* para *Assistente Executivo & Finanças* (Jarvis)\n🍕 Digite *7* para *Pizzaria & Delivery* (Luigi)\n\n_Ou acesse nossa vitrine completa pelo navegador!_`;
              await this.sock?.sendMessage(targetJid, { text: menuMsg });
              continue;
            }
          }

          // Verifica limite de mensagens da demonstração gratuita (8 msgs)
          if (demoService.isLeadLimitReached(lead)) {
            console.log(`[Portal WhatsApp] Limite de mensagens atingido para ${lead.name} (${lead.phone}).`);
            demoService.completeDemoLead(lead.id);
            const targetJid = remoteJid.endsWith('@lid') ? `${lead.phone}@s.whatsapp.net` : remoteJid;
            const finishMsg = `🌟 *Demonstração ao vivo concluída com sucesso!*\n\nVocê pôde comprovar na prática a velocidade, precisão e o atendimento humanizado do nosso colaborador digital do *RH de Agentes IA*!\n\n🚀 Para contratar e ativar este agente com um número exclusivo no seu negócio, acesse nosso site ou fale com nosso time!`;
            await this.sock?.sendMessage(targetJid, { text: finishMsg });
            continue;
          }

          try {
            if (this.sock) {
              await this.sock.presenceSubscribe(remoteJid);
              await this.sock.sendPresenceUpdate('composing', remoteJid);
            }

            console.log(`[Portal WhatsApp 🌟 Demo Lead] Respondendo "${lead.name}" (${lead.niche}): "${trimmedMessage}"`);
            demoService.recordInteraction(cleanClientPhone);

            const replyText = await aiService.processDemoMessage(
              lead.phone,
              trimmedMessage,
              lead.name,
              lead.niche
            );

            // Se o visitante pedir contato do dono, atendente ou ajuda humana, avisa o dono no WhatsApp!
            const lowerMsg = trimmedMessage.toLowerCase();
            const asksOwner = lowerMsg.includes('dono') || lowerMsg.includes('proprietario') || lowerMsg.includes('gerente') || lowerMsg.includes('humano') || lowerMsg.includes('atendente');
            if (asksOwner && resolvedPhone.replace(/\D/g, '') !== '5511958527119') {
              const ownerNotice = `⚠️ *[RH de Agentes IA - Cliente Solicitou Contato do Dono]*\n\n` +
                `👤 *Cliente:* ${lead.name} (${lead.phone})\n` +
                `🏢 *Agente/Nicho:* ${lead.niche}\n` +
                `💬 *Mensagem do Cliente:* "${trimmedMessage}"\n\n` +
                `👉 O robô passou o seu contato (11) 95852-7119 para ele!`;
              this.sendMessageToClient('5511958527119', ownerNotice).catch(() => {});
            }

            this.recentBotReplies.add(replyText.trim());
            if (this.recentBotReplies.size > 100) {
              const first = this.recentBotReplies.values().next().value;
              if (first) this.recentBotReplies.delete(first);
            }

            if (this.sock) {
              await this.sock.sendPresenceUpdate('paused', remoteJid);
              console.log(`[Portal WhatsApp 📤 Envio] Enviando para ${remoteJid}: "${replyText.slice(0, 50)}..."`);
              const sent = await this.sock.sendMessage(remoteJid, { text: replyText });
              if (sent?.key?.id) {
                this.sentBotMessageIds.add(sent.key.id);
                if (this.sentBotMessageIds.size > 200) {
                  const first = this.sentBotMessageIds.values().next().value;
                  if (first) this.sentBotMessageIds.delete(first);
                }
              }

              // Se for self-chat via LID, garante espelhamento
              if (isSelf && remoteJid.endsWith('@lid')) {
                try {
                  const pnJid = `${lead.phone}@s.whatsapp.net`;
                  const sentPn = await this.sock.sendMessage(pnJid, { text: replyText });
                  if (sentPn?.key?.id) this.sentBotMessageIds.add(sentPn.key.id);
                } catch (e) {}
              }
            }
          } catch (err) {
            console.error(`[Portal WhatsApp] Erro ao responder lead:`, err);
          }
        }
      });

    } catch (error) {
      console.error('[Portal WhatsApp] Falha ao inicializar Baileys:', error);
      this.isConnecting = false;
      this.state = {
        state: 'disconnected',
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // Disparo ativo de mensagens pela linha do Portal
  public async sendMessageToClient(phone: string, text: string): Promise<boolean> {
    const clean = phone.replace(/\D/g, '');
    if (!this.sock || this.state.state !== 'connected') {
      console.warn(`[Portal WhatsApp] Tentativa de envio para ${phone}, mas o socket não está conectado.`);
      throw new Error('WhatsApp do Portal (Linha 2) não está conectado no momento.');
    }

    try {
      console.log(`[Portal WhatsApp 🚀 Disparo] Iniciando verificação e envio para ${clean}...`);

      let targetJid = `${clean}@s.whatsapp.net`;

      // 1. Resolve o JID real usando onWhatsApp (essencial para números do Brasil com ou sem 9º dígito)
      try {
        const variants = [targetJid];
        if (clean.startsWith('55') && clean.length === 13 && clean[4] === '9') {
          // Versão alternativa sem o 9º dígito (55 + DDD + 8 dígitos)
          variants.push(`55${clean.substring(2, 4)}${clean.substring(5)}@s.whatsapp.net`);
        } else if (clean.startsWith('55') && clean.length === 12) {
          // Versão alternativa com o 9º dígito (55 + DDD + 9 + 8 dígitos)
          variants.push(`55${clean.substring(2, 4)}9${clean.substring(4)}@s.whatsapp.net`);
        }

        console.log(`[Portal WhatsApp 🔍 Checagem] Consultando existência no WhatsApp:`, variants);
        const results = await this.sock.onWhatsApp(...variants);
        console.log(`[Portal WhatsApp 🔍 Resultado onWhatsApp]:`, JSON.stringify(results));

        const valid = results?.find(r => r.exists);
        if (valid?.jid) {
          targetJid = valid.jid;
          console.log(`[Portal WhatsApp ✅ JID Validado]: ${targetJid}`);
        } else {
          console.warn(`[Portal WhatsApp ⚠️ Atenção] Número ${clean} não localizado via onWhatsApp.`);
          throw new Error(`O número informado não foi localizado no WhatsApp. Por favor, confira o DDD e os dígitos digitados.`);
        }
      } catch (errCheck: any) {
        if (errCheck.message && errCheck.message.includes('não foi localizado no WhatsApp')) {
          throw errCheck;
        }
        console.error(`[Portal WhatsApp] Aviso ao consultar onWhatsApp:`, errCheck.message);
      }

      // 2. Dispara a mensagem para o targetJid verificado
      console.log(`[Portal WhatsApp 📤 Enviando Mensagem] Disparando para ${targetJid}: "${text.slice(0, 60)}..."`);
      const sent = await this.sock.sendMessage(targetJid, { text });

      if (sent?.key?.id) {
        this.sentBotMessageIds.add(sent.key.id);
      }
      this.recentBotReplies.add(text.trim());
      console.log(`[Portal WhatsApp ✅ Sucesso] Mensagem enviada com sucesso para ${targetJid}! Key:`, sent?.key?.id);

      // Se o Baileys mapear o LID deste telefone, associa no demoService
      try {
        const lidJid = await (this.sock as any)?.signalRepository?.lidMapping?.getLIDForPN(targetJid);
        if (lidJid) {
          const cleanLid = lidJid.split('@')[0].split(':')[0].replace(/\D/g, '');
          demoService.mapLidToPhone(cleanLid, clean);
        }
      } catch (e) {}

      // Se for o próprio número do bot (self-chat), também sincroniza no @lid
      const botPhone = (this.sock?.user?.id?.split('@')[0]?.split(':')[0] || '').replace(/\D/g, '');
      const botLid = (this.sock?.user?.lid?.split('@')[0]?.split(':')[0] || '').replace(/\D/g, '');
      if (clean === botPhone && botLid) {
        try {
          await this.sock.sendMessage(`${botLid}@lid`, { text });
        } catch (e) {}
      }

      return true;
    } catch (err: any) {
      console.error(`[Portal WhatsApp ❌ Falha] Erro ao enviar mensagem para ${phone}:`, err);
      throw err;
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
    this.isConnecting = false;
  }
}

export const portalWhatsAppService = new PortalWhatsAppService();
