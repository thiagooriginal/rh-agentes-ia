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
  private processedMessageIds: Set<string> = new Set();
  private lidToPhoneCache: Map<string, string> = new Map();

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
    if (clean.length > 13 && config.adminPhone) {
      clean = config.adminPhone.replace(/\D/g, '');
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
    if (clean.length > 13 && config.adminPhone) {
      clean = config.adminPhone.replace(/\D/g, '');
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

      try {
        const resJson = (await res.json()) as any;
        const sentId = resJson?.key?.id;
        if (sentId) {
          this.sentMessageIds.add(sentId);
          setTimeout(() => this.sentMessageIds.delete(sentId), 120000);
        }
      } catch {
        // Resposta pode não ser JSON em algumas versões
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
   * Reinicia a sessão na Evolution (ou reconecta o WebSocket sem perder o pareamento)
   */
  public async restartInstance(targetInstance?: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const instance = targetInstance || this.getInstanceName();
    try {
      const url = `${this.getBaseUrl()}/instance/restart/${instance}`;
      const res = await fetch(url, { method: 'POST', headers: this.getHeaders() });
      return res.ok;
    } catch (err) {
      console.error(`[Evolution API] Falha ao reiniciar instância ${instance}:`, err);
      return false;
    }
  }

  /**
   * Baixa a mídia (áudio/imagem) da Evolution API em base64 e decodifica para Buffer
   */
  public async getMediaBuffer(instance: string, msgData: any): Promise<{ buffer?: Buffer; mimetype?: string }> {
    try {
      const url = `${this.getBaseUrl()}/chat/getBase64FromMediaMessage/${instance}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          message: msgData,
          convertToMp4: false
        })
      });

      if (!res.ok) {
        console.error(`[Evolution API] Erro ao obter mídia (${res.status}):`, await res.text());
        return {};
      }

      const json = await res.json() as any;
      const base64Str = json?.base64;
      if (!base64Str) return {};

      const clean = base64Str.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(clean, 'base64');
      const mimetype = json?.mimetype || msgData?.message?.audioMessage?.mimetype || 'audio/ogg; codecs=opus';
      return { buffer, mimetype };
    } catch (err) {
      console.error('[Evolution API] Falha ao extrair buffer de mídia:', err);
      return {};
    }
  }

  /**
   * Resolve o JID real (telefone) de uma mensagem @lid consultando a Evolution API caso remoteJidAlt não venha no webhook
   */
  private async resolveAltJid(instance: string, messageId?: string): Promise<string | undefined> {
    if (!this.isConfigured() || !messageId) return undefined;
    try {
      const url = `${this.getBaseUrl()}/chat/findMessages/${instance}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ where: { key: { id: messageId } }, limit: 1 })
      });
      if (!res.ok) return undefined;
      const json = (await res.json()) as any;
      const alt = json?.messages?.records?.[0]?.key?.remoteJidAlt;
      if (alt && typeof alt === 'string' && !alt.includes('@lid')) {
        return alt;
      }
      return undefined;
    } catch {
      return undefined;
    }
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

      if (key.id) {
        if (this.sentMessageIds.has(key.id) || this.processedMessageIds.has(key.id)) {
          return;
        }
        this.processedMessageIds.add(key.id);
        setTimeout(() => this.processedMessageIds.delete(key.id), 60000);
      }

      let targetJid = key.remoteJid || '';
      if (!targetJid || targetJid.includes('@g.us') || targetJid.includes('@broadcast') || targetJid.includes('@newsletter')) {
        return;
      }

      // Suporte completo a multi-device e privacidade do WhatsApp (LID - Linked Identity)
      if (targetJid.includes('@lid')) {
        if (key.remoteJidAlt && !key.remoteJidAlt.includes('@lid')) {
          this.lidToPhoneCache.set(targetJid, key.remoteJidAlt);
          targetJid = key.remoteJidAlt;
        } else if (this.lidToPhoneCache.has(targetJid)) {
          targetJid = this.lidToPhoneCache.get(targetJid)!;
        } else {
          const resolvedAlt = await this.resolveAltJid(instanceName, key.id);
          if (resolvedAlt) {
            this.lidToPhoneCache.set(targetJid, resolvedAlt);
            targetJid = resolvedAlt;
          }
        }
      }

      let cleanPhone = targetJid.split('@')[0].split(':')[0].replace(/\D/g, '');
      const evoStatus = await this.getStatus(instanceName);
      const botPhone = (evoStatus.phoneNumber || config.adminPhone || '').replace(/\D/g, '');

      // Só trata como @lid de self-chat se ainda não foi resolvido para um telefone distinto
      const isUnresolvedLid = targetJid.includes('@lid');
      const isSelf = Boolean(
        (key.fromMe && (cleanPhone === botPhone || (isUnresolvedLid && msgData?.pushName === 'Você'))) ||
        (botPhone && (cleanPhone === botPhone || (cleanPhone.length >= 8 && cleanPhone.endsWith(botPhone.slice(-8)))))
      );

      // Garante que o telefone do usuário no Self-Chat seja o número WhatsApp canônico
      if (isSelf && botPhone) {
        cleanPhone = botPhone;
      }

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

        // Extrai texto ou áudio se presente
        let trimmedText = (msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || '').trim();
        const isAudio = Boolean(msg.audioMessage || msgData.messageType === 'audioMessage');

        if (isAudio && !trimmedText) {
          console.log(`[Evolution API 🎙️ Áudio] Mensagem de voz recebida de ${cleanPhone}. Baixando da Evolution...`);
          const { buffer, mimetype } = await this.getMediaBuffer(instanceName, msgData);
          if (buffer && buffer.length > 0) {
            console.log(`[Evolution API 🎙️ Áudio] Áudio recebido (${buffer.length} bytes). Transcrevendo com Gemini...`);
            const transcription = await aiService.transcribeAudio(buffer, mimetype || 'audio/ogg');
            if (transcription && transcription.trim()) {
              trimmedText = transcription.trim();
              console.log(`[Evolution API 🎙️ Transcrição Concluída]: "${trimmedText}"`);
            }
          }
        }

        if (!trimmedText) return;
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

      // Extrai texto ou áudio se presente
      let trimmedText = (msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || '').trim();
      const isAudio = Boolean(msg.audioMessage || msgData.messageType === 'audioMessage');

      if (isAudio && !trimmedText) {
        console.log(`[Evolution API 🎙️ Áudio] Mensagem de voz recebida de ${cleanPhone} no portal. Baixando da Evolution...`);
        const { buffer, mimetype } = await this.getMediaBuffer(instanceName, msgData);
        if (buffer && buffer.length > 0) {
          const transcription = await aiService.transcribeAudio(buffer, mimetype || 'audio/ogg');
          if (transcription && transcription.trim()) {
            trimmedText = transcription.trim();
          }
        }
      }

      if (!trimmedText) return;
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
