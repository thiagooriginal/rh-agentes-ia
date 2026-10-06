import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  proto
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { config } from '../config.js';
import { aiService } from './ai.js';
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
        printQRInTerminal: false, // Geramos manualmente para melhor controle
        browser: ['Secretária Virtual', 'Chrome', '1.0.0']
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log('\n=========================================');
          console.log('  📲 ESCANEIE O QR CODE NO SEU WHATSAPP');
          console.log('=========================================\n');
          qrcodeTerminal.generate(qr, { small: true });
          console.log('Ou abra o painel web em http://localhost:' + config.port);

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
          console.log(`\n✅ Conexão com WhatsApp estabelecida com sucesso!`);
          console.log(`📞 Conectado como: ${userPhone}\n`);

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

          console.log(`[WhatsApp] Conexão encerrada (código: ${statusCode}). Reconectar: ${shouldReconnect}`);

          this.state = {
            state: 'disconnected',
            qrCodeDataUrl: undefined,
            lastUpdated: new Date().toISOString()
          };
          this.isConnecting = false;

          if (shouldReconnect) {
            console.log('[WhatsApp] Tentando reconectar em 5 segundos...');
            setTimeout(() => this.start(), 5000);
          }
        }
      });

      // Trata mensagens recebidas
      this.sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          // Ignora mensagens enviadas por nós mesmos ou de status
          if (msg.key.fromMe || !msg.message || msg.key.remoteJid === 'status@broadcast') {
            continue;
          }

          // Apenas mensagens privadas (não responde em grupos a menos que seja desejado)
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith('@g.us')) {
            continue;
          }

          const clientPhone = remoteJid.replace('@s.whatsapp.net', '');
          const clientName = msg.pushName || 'Cliente';

          // Extrai o texto da mensagem
          const messageText = 
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';

          if (!messageText || messageText.trim().length === 0) {
            continue;
          }

          console.log(`[WhatsApp] Mensagem de ${clientName} (${clientPhone}): "${messageText}"`);

          try {
            if (this.sock) {
              // Mostra presença digitando
              await this.sock.presenceSubscribe(remoteJid);
              await this.sock.sendPresenceUpdate('composing', remoteJid);

              // Processa resposta com o Gemini
              const replyText = await aiService.processMessage(clientPhone, messageText, clientName);

              // Pausa a digitação
              await this.sock.sendPresenceUpdate('paused', remoteJid);

              // Envia resposta no WhatsApp
              await this.sock.sendMessage(remoteJid, { text: replyText });
              console.log(`[WhatsApp] Resposta enviada para ${clientPhone}`);
            }
          } catch (err) {
            console.error(`[WhatsApp] Erro ao responder cliente ${clientPhone}:`, err);
          }
        }
      });

    } catch (error) {
      console.error('[WhatsApp] Falha ao inicializar socket Baileys:', error);
      this.isConnecting = false;
      this.state = {
        state: 'disconnected',
        lastUpdated: new Date().toISOString()
      };
    }
  }

  public async disconnect(): Promise<void> {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (e) {
        // Ignora erro de logout se já desconectado
      }
      this.sock = null;
    }
    this.state = {
      state: 'disconnected',
      lastUpdated: new Date().toISOString()
    };
  }
}

export const whatsappService = new WhatsAppService();
