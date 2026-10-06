import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { config } from '../config.js';
import { aiService } from './ai.js';
import { storage } from '../db/storage.js';
import { WhatsAppState } from '../types.js';

export class WhatsAppService {
  private sock: WASocket | null = null;
  private state: WhatsAppState = {
    state: 'disconnected',
    lastUpdated: new Date().toISOString()
  };
  private isConnecting: boolean = false;
  private hasPrintedTerminalQR: boolean = false;
  private recentBotReplies: Set<string> = new Set();

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
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid) continue;

          // 1. REGRA ESTRITA: NUNCA responder em grupos, status, canais ou transmissões
          if (
            remoteJid.endsWith('@g.us') ||
            remoteJid.includes('@broadcast') ||
            remoteJid.endsWith('@newsletter') ||
            msg.key.participant
          ) {
            // Ignora silenciosamente grupos
            continue;
          }

          const rawClientPhone = remoteJid.replace('@s.whatsapp.net', '');
          const cleanClientPhone = rawClientPhone.replace(/\D/g, '');
          const clientName = msg.pushName || 'Você';

          const messageText =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            '';

          if (!messageText || messageText.trim().length === 0) {
            continue;
          }

          // Se a mensagem for idêntica à última resposta emitida pela IA, evita loop
          if (this.recentBotReplies.has(messageText.trim())) {
            continue;
          }

          // 2. REGRA ESTRITA: Filtrar apenas o seu próprio número
          const botPhone = (this.sock?.user?.id?.split(':')[0] || '').replace(/\D/g, '');
          const establishment = storage.getEstablishment();
          const adminPhone = (establishment.adminNotificationPhone || config.adminPhone || '').replace(/\D/g, '');

          const allowedNumbers = [
            botPhone,
            adminPhone,
            ...config.allowedPhoneNumbers
          ].filter(Boolean);

          const isMatchingPhone = (p1: string, p2: string): boolean => {
            if (!p1 || !p2) return false;
            if (p1 === p2) return true;
            // Se os últimos 8 dígitos forem idênticos (tolerância a DDD/nono dígito)
            const s1 = p1.slice(-8);
            const s2 = p2.slice(-8);
            return s1.length >= 8 && s1 === s2;
          };

          // Verifica se o remetente é um dos números autorizados
          const isAuthorized = allowedNumbers.some(allowed => isMatchingPhone(cleanClientPhone, allowed));

          if (!isAuthorized) {
            console.log(`[WhatsApp Segurança] 🚫 Mensagem de ${cleanClientPhone} ignorada: apenas seu próprio número tem permissão.`);
            continue;
          }

          // Se for mensagem enviada por si mesmo (fromMe), só aceita se for no próprio chat privado
          if (msg.key.fromMe && cleanClientPhone !== botPhone) {
            continue;
          }

          console.log(`[WhatsApp 👤 Seu Número] Mensagem recebida: "${messageText}"`);

          // Verifica se está sob intervenção humana
          if (storage.isHumanInterventionActive(cleanClientPhone)) {
            console.log(`[WhatsApp] Conversa com ${cleanClientPhone} sob intervenção humana.`);
            storage.saveConversationMessage(cleanClientPhone, 'user', messageText);
            continue;
          }

          try {
            if (this.sock) {
              await this.sock.presenceSubscribe(remoteJid);
              await this.sock.sendPresenceUpdate('composing', remoteJid);
            }

            const replyText = await aiService.processMessage(cleanClientPhone, messageText, clientName);

            // Armazena no cache recente para não gerar auto-eco
            this.recentBotReplies.add(replyText.trim());
            if (this.recentBotReplies.size > 100) {
              const firstItem = this.recentBotReplies.values().next().value;
              if (firstItem) this.recentBotReplies.delete(firstItem);
            }

            if (this.sock) {
              await this.sock.sendPresenceUpdate('paused', remoteJid);
              await this.sock.sendMessage(remoteJid, { text: replyText });
              console.log(`[WhatsApp] Resposta enviada com sucesso para seu número!`);
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
        await this.sock.sendMessage(remoteJid, { text });
        storage.saveConversationMessage(phone, 'assistant', text);
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
