import { config } from '../config.js';
import { demoService } from './demo.js';
import { aiService } from './ai.js';
import { storage } from '../db/storage.js';

export interface EvolutionState {
  state: 'connected' | 'qr_ready' | 'connecting' | 'disconnected';
  phoneNumber?: string;
  qrCodeDataUrl?: string;
  pairingCode?: string;
  lastUpdated: string;
}

export class EvolutionService {
  private recentBotReplies: Set<string> = new Set();
  private sentMessageIds: Set<string> = new Set();

  public isConfigured(): boolean {
    return !!(config.evolutionApiUrl && config.evolutionApiKey);
  }

  public getBaseUrl(): string {
    return config.evolutionApiUrl.replace(/\/$/, '');
  }

  public getInstanceName(): string {
    return config.evolutionInstanceName || 'portal-ias';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'apikey': config.evolutionApiKey
    };
  }

  /**
   * Consulta o estado atual da instância na Evolution API
   */
  public async getStatus(targetInstance?: string): Promise<EvolutionState> {
    if (!this.isConfigured()) {
      return {
        state: 'disconnected',
        lastUpdated: new Date().toISOString()
      };
    }

    const instance = targetInstance || this.getInstanceName();

    try {
      // 1. Tenta buscar detalhes completos da instância via fetchInstances
      try {
        const urlFetch = `${this.getBaseUrl()}/instance/fetchInstances?instanceName=${instance}`;
        const resFetch = await fetch(urlFetch, { headers: this.getHeaders() });
        if (resFetch.ok) {
          const list = (await resFetch.json()) as any;
          const inst = Array.isArray(list) ? list.find((i: any) => i.name === instance) : undefined;
          if (inst) {
            const status = inst.connectionStatus;
            const phone = inst.ownerJid ? inst.ownerJid.split('@')[0]?.split(':')[0] : undefined;
            if (status === 'open') {
              return {
                state: 'connected',
                phoneNumber: phone,
                lastUpdated: new Date().toISOString()
              };
            }
          }
        }
      } catch (eFetch) {
        // Fallback silencioso para connectionState
      }

      // 2. Consulta connectionState da instância
      const url = `${this.getBaseUrl()}/instance/connectionState/${instance}`;
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) {
        if (res.status === 404) {
          // Instância não existe ainda, tenta criar
          await this.createInstance(instance);
        }
        return { state: 'disconnected', lastUpdated: new Date().toISOString() };
      }

      const data = (await res.json()) as any;
      const state = data?.instance?.state || data?.state;

      if (state === 'open') {
        const phone = data?.instance?.ownerJid?.split('@')[0]?.split(':')[0] || undefined;
        return {
          state: 'connected',
          phoneNumber: phone,
          lastUpdated: new Date().toISOString()
        };
      } else if (state === 'connecting') {
        // Tenta obter QR Code se estiver conectando
        const qrInfo = await this.getQRCode(instance);
        if (qrInfo.qrCodeDataUrl) {
          return {
            state: 'qr_ready',
            qrCodeDataUrl: qrInfo.qrCodeDataUrl,
            pairingCode: qrInfo.pairingCode,
            lastUpdated: new Date().toISOString()
          };
        }
        return { state: 'connecting', lastUpdated: new Date().toISOString() };
      } else {
        return { state: 'disconnected', lastUpdated: new Date().toISOString() };
      }
    } catch (err) {
      console.error(`[Evolution API] Erro ao consultar status de ${instance}:`, err);
      return { state: 'disconnected', lastUpdated: new Date().toISOString() };
    }
  }

  /**
   * Cria a instância se ela não existir
   */
  public async createInstance(targetInstance?: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const instance = targetInstance || this.getInstanceName();
    try {
      const url = `${this.getBaseUrl()}/instance/create`;
      const body = {
        instanceName: instance,
        token: config.evolutionApiKey,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS'
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });
      console.log(`[Evolution API] Criação da instância ${instance}: status ${res.status}`);
      return res.ok;
    } catch (err) {
      console.error(`[Evolution API] Erro ao criar instância ${instance}:`, err);
      return false;
    }
  }

  /**
   * Inicia a conexão e obtém o QR Code ou Pairing Code
   */
  public async getQRCode(targetInstance?: string): Promise<{ qrCodeDataUrl?: string; pairingCode?: string }> {
    if (!this.isConfigured()) return {};
    const instance = targetInstance || this.getInstanceName();
    try {
      const url = `${this.getBaseUrl()}/instance/connect/${instance}`;
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) {
        if (res.status === 404) {
          await this.createInstance(instance);
          return this.getQRCode(instance);
        }
        return {};
      }
      const data = (await res.json()) as any;
      const base64 = data?.base64 || data?.qrcode?.base64 || data?.code;
      const pairingCode = data?.pairingCode;

      return {
        qrCodeDataUrl: base64 ? (base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`) : undefined,
        pairingCode: pairingCode || undefined
      };
    } catch (err) {
      console.error(`[Evolution API] Erro ao buscar QR Code para ${instance}:`, err);
      return {};
    }
  }

  /**
   * Solicita código de pareamento de 8 dígitos para um telefone
   */
  public async requestPairingCode(phone: string, targetInstance?: string): Promise<string> {
    if (!this.isConfigured()) throw new Error('Evolution API não configurada.');
    const instance = targetInstance || this.getInstanceName();
    let clean = phone.replace(/\D/g, '');
    if ((clean.length === 10 || clean.length === 11) && !clean.startsWith('55')) {
      clean = '55' + clean;
    }

    try {
      // Endpoint da Evolution v2 para pareamento por número
      const url = `${this.getBaseUrl()}/instance/connect/${instance}?number=${clean}`;
      const res = await fetch(url, { headers: this.getHeaders() });
      const data = (await res.json()) as any;
      const code = data?.pairingCode || data?.code;
      if (!code) throw new Error(data?.message || 'Código não retornado pela Evolution API');
      return code;
    } catch (err: any) {
      console.error(`[Evolution API] Erro ao solicitar código de pareamento para ${instance}:`, err);
      throw err;
    }
  }

  /**
   * Dispara mensagem de texto via Evolution API
   */
  public async sendMessage(phone: string, text: string, targetInstance?: string): Promise<boolean> {
    if (!this.isConfigured()) throw new Error('Evolution API não configurada.');
    const instance = targetInstance || this.getInstanceName();
    let clean = phone.replace(/\D/g, '');
    if ((clean.length === 10 || clean.length === 11) && !clean.startsWith('55')) {
      clean = '55' + clean;
    }

    try {
      const url = `${this.getBaseUrl()}/message/sendText/${instance}`;
      const body = {
        number: clean,
        text: text
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Evolution API] Falha ao enviar para ${clean} via ${instance}:`, errText);
        throw new Error(`Evolution API erro ${res.status}: ${errText}`);
      }

      this.recentBotReplies.add(text.trim());
      if (this.recentBotReplies.size > 100) {
        const first = this.recentBotReplies.values().next().value;
        if (first) this.recentBotReplies.delete(first);
      }
      console.log(`[Evolution API ✅] Mensagem enviada com sucesso para ${clean}: "${text.slice(0, 50)}..."`);
      return true;
    } catch (err: any) {
      console.error(`[Evolution API] Erro ao enviar mensagem:`, err);
      throw err;
    }
  }

  /**
   * Configura o Webhook da Evolution para apontar para a nossa aplicação
   */
  public async configureWebhook(appUrl: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const cleanAppUrl = appUrl.replace(/\/$/, '');
      const webhookUrl = `${cleanAppUrl}/api/evolution/webhook`;
      const url = `${this.getBaseUrl()}/webhook/set/${this.getInstanceName()}`;
      const body = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: [
            'MESSAGES_UPSERT',
            'CONNECTION_UPDATE'
          ]
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });
      console.log(`[Evolution API Webhook] Apontado para ${webhookUrl}: ${res.status}`);
      return res.ok;
    } catch (err) {
      console.error('[Evolution API] Erro ao configurar webhook:', err);
      return false;
    }
  }

  /**
   * Desconecta a sessão na Evolution
   */
  public async disconnect(targetInstance?: string): Promise<void> {
    if (!this.isConfigured()) return;
    const instance = targetInstance || this.getInstanceName();
    try {
      const url = `${this.getBaseUrl()}/instance/logout/${instance}`;
      await fetch(url, { method: 'DELETE', headers: this.getHeaders() });
    } catch (e) {}
  }

  /**
   * Reinicia a sessão na Evolution para gerar novo QR Code
   */
  public async restartInstance(targetInstance?: string): Promise<void> {
    if (!this.isConfigured()) return;
    const instance = targetInstance || this.getInstanceName();
    try {
      const url = `${this.getBaseUrl()}/instance/restart/${instance}`;
      await fetch(url, { method: 'PUT', headers: this.getHeaders() });
    } catch (e) {}
  }

  /**
   * Trata mensagens recebidas pelo Webhook da Evolution API
   */
  public async handleWebhook(payload: any): Promise<void> {
    try {
      const event = payload?.event || payload?.type;
      if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
        return;
      }

      const instanceName = payload?.instance || this.getInstanceName();
      const msgData = payload?.data || payload;
      const key = msgData?.key;
      if (!key) return;

      const remoteJid = key.remoteJid;
      if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@broadcast') || remoteJid.includes('@newsletter')) {
        return;
      }

      const cleanPhone = remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '');
      const evoStatus = await this.getStatus(instanceName);
      const botPhone = (evoStatus.phoneNumber || '').replace(/\D/g, '');
      const isSelf = Boolean(
        (key.fromMe && cleanPhone === botPhone) ||
        (botPhone && (cleanPhone === botPhone || (cleanPhone.length >= 8 && cleanPhone.endsWith(botPhone.slice(-8)))))
      );

      // Se a mensagem veio da instância jarvis-pessoal:
      if (instanceName === 'jarvis-pessoal') {
        const isAdmin = config.adminPhone && (cleanPhone === config.adminPhone.replace(/\D/g, ''));
        if (config.selfChatOnly && !isSelf && !isAdmin) {
          // Ignora mensagens de terceiros (amigos, família, grupos) para proteger a privacidade
          return;
        }

        if (key.fromMe && !isSelf) return;

        const msg = msgData?.message;
        if (!msg) return;

        const text = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || '';
        if (!text || !text.trim()) return;

        const trimmedText = text.trim();
        if (this.recentBotReplies.has(trimmedText)) return;

        console.log(`[Evolution API 👔 Jarvis] Atendendo mensagem pessoal (${cleanPhone}): "${trimmedText}"`);
        const replyText = await aiService.processJarvisMessage(cleanPhone, trimmedText, msgData?.pushName || 'Chefe');
        this.recentBotReplies.add(replyText.trim());
        setTimeout(() => this.recentBotReplies.delete(replyText.trim()), 60000);
        await this.sendMessage(cleanPhone, replyText, instanceName);
        return;
      }

      // Se a mensagem veio da instância portal-ias ou outra:
      if (key.fromMe && !isSelf) return;

      const msg = msgData?.message;
      if (!msg) return;

      // Extrai texto da mensagem
      const text = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || '';
      if (!text || !text.trim()) return;

      const trimmedText = text.trim();
      if (this.recentBotReplies.has(trimmedText)) return;

      console.log(`[Evolution API 📩 Recebida em ${instanceName}] Mensagem de ${cleanPhone}: "${trimmedText}"`);

      // 0. Se for conversa com você mesmo (Self-Chat), aciona o Jarvis diretamente!
      if (isSelf) {
        console.log(`[Evolution API 👔 Jarvis Self-Chat] Atendendo mensagem pessoal: "${trimmedText}"`);
        const replyText = await aiService.processJarvisMessage(cleanPhone, trimmedText, msgData?.pushName || 'Chefe');
        this.recentBotReplies.add(replyText.trim());
        setTimeout(() => this.recentBotReplies.delete(replyText.trim()), 60000);
        await this.sendMessage(cleanPhone, replyText, instanceName);
        return;
      }

      // 1. Verifica se há demonstração de lead ativa da Vitrine
      let demoLead = demoService.getActiveLead(cleanPhone);
      if (demoLead) {
        if (demoService.isLeadLimitReached(demoLead)) {
          console.log(`[Evolution API] Limite de demonstração atingido para ${demoLead.name} (${demoLead.phone}).`);
          demoService.completeDemoLead(demoLead.id);
          const finishMsg = `🌟 *Demonstração ao vivo concluída com sucesso!*\n\nVocê pôde comprovar na prática a velocidade, precisão e o atendimento humanizado do nosso colaborador digital do *RH de Agentes IA*!\n\n🚀 Para contratar e ativar este agente com um número exclusivo no seu negócio, acesse nossa vitrine ou converse com nossa equipe!`;
          await this.sendMessage(cleanPhone, finishMsg, instanceName);
          return;
        }

        console.log(`[Evolution API -> Demo Lead] Lead ativo encontrado: ${demoLead.name} (${demoLead.niche}). Respondendo com IA...`);
        demoService.recordInteraction(cleanPhone);

        const demoReply = await aiService.processDemoMessage(
          demoLead.phone,
          trimmedText,
          demoLead.name,
          demoLead.niche
        );

        this.recentBotReplies.add(demoReply.trim());
        setTimeout(() => this.recentBotReplies.delete(demoReply.trim()), 60000);
        await this.sendMessage(cleanPhone, demoReply, instanceName);
        return;
      }

      // 2. Se for atendimento de salão Sofia
      if (!storage.isGlobalAiPaused() && !storage.isSalonAiPaused()) {
        const pushName = msgData?.pushName || 'Cliente';
        const replyText = await aiService.processMessage(cleanPhone, trimmedText, pushName);
        this.recentBotReplies.add(replyText.trim());
        setTimeout(() => this.recentBotReplies.delete(replyText.trim()), 60000);
        await this.sendMessage(cleanPhone, replyText, instanceName);
      }
    } catch (err) {
      console.error('[Evolution API Webhook Erro]:', err);
    }
  }
}

export const evolutionService = new EvolutionService();
