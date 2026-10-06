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
          console.log('\n=========================================');
          console.log('  📲 ESCANEIE O QR CODE NO SEU WHATSAPP');
          console.log('=========================================\n');
          qrcodeTerminal.generate(qr, { small: true });

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
          console.log(`📞 Linha do Salão: ${userPhone}\n`);

          this.state = {
            state: 'connected',
            phoneNumber: userPhone,
            qrCodeDataUrl: undefined,
            lastUpdated: new Date().toISOString()
          };
          this.isConnecting = false;
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

      // Trata mensagens recebidas
      this.sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          if (msg.key.fromMe || !msg.message || msg.key.remoteJid === 'status@broadcast') {
            continue;
          }

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith('@g.us')) {
            continue; // Ignora grupos
          }

          const clientPhone = remoteJid.replace('@s.whatsapp.net', '');
          const clientName = msg.pushName || 'Cliente';

          const messageText =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';

          if (!messageText || messageText.trim().length === 0) {
            continue;
          }

          console.log(`[WhatsApp] Mensagem de ${clientName} (${clientPhone}): "${messageText}"`);

          // Verifica se este número está com atendimento humano assumido
          if (storage.isHumanInterventionActive(clientPhone)) {
            console.log(`[WhatsApp] Conversa com ${clientPhone} sob intervenção humana. A IA não interferirá.`);
            storage.saveConversationMessage(clientPhone, 'user', messageText);
            continue;
          }

          try {
            // Mostra presença digitando no WhatsApp
            if (this.sock) {
              await this.sock.presenceSubscribe(remoteJid);
              await this.sock.sendPresenceUpdate('composing', remoteJid);
            }

            // Processa com a IA (Function Calling)
            const replyText = await aiService.processMessage(clientPhone, messageText, clientName);

            // Pausa digitação e envia resposta
            if (this.sock) {
              await this.sock.sendPresenceUpdate('paused', remoteJid);
              await this.sock.sendMessage(remoteJid, { text: replyText });
              console.log(`[WhatsApp] Resposta enviada para ${clientPhone}`);
            }
          } catch (err) {
            console.error(`[WhatsApp] Erro ao responder cliente ${clientPhone}:`, err);
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

  // Enviar mensagem ativa (Lembretes, Pesquisas, Avisos)
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
      // Loga caso não conectado
      console.log(`[WhatsApp] Mensagem agendada/disparada para ${phone} (Offline): "${text}"`);
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
