import { storage } from '../db/storage.js';
import { whatsappService } from './whatsapp.js';
import { config } from '../config.js';
import { PromotionCampaign, CampaignRecipient } from '../types.js';

export class CampaignService {
  private activeCampaignTasks: Map<string, boolean> = new Map();

  // Lista de variações para Spintax (Gera mensagens únicas para quebrar o hash anti-spam do WhatsApp)
  private greetings = [
    'Oi, {nome}! 💜',
    'Olá, {nome}! Tudo bem? 😊',
    'Oie {nome}! ✨',
    'Olá {nome}! Tudo certinho? 🌸',
    'Oi {nome}! Como você está? 💖'
  ];

  private intros = [
    'Passando para te avisar de uma oportunidade especial:',
    'Olha só a novidade incrível que preparamos para você:',
    'Temos uma surpresa exclusiva para você esta semana:',
    'Vim te contar uma promoção relâmpago que você vai amar:'
  ];

  private callToActions = [
    'Quer que eu separe o seu horário agora mesmo? É só me responder por aqui! 📅',
    'As vagas com essa condição especial são limitadas! Quer garantir a sua? 💜',
    'Para aproveitar, basta me falar qual o melhor dia e horário para você! ✨',
    'Se quiser aproveitar, me manda um oi que já agendo para você! 😊'
  ];

  private signatures = [
    'Studio Bella - Gestão & Estética',
    'Sofia | Studio Bella 💜',
    'Com carinho, Studio Bella ✨',
    'Equipe Studio Bella'
  ];

  // Embaralha aleatoriamente a lista de destinatários (Anti-Ban: quebra ordem sequencial)
  private shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Gera uma mensagem personalizada e única para cada cliente
  public generatePersonalizedMessage(clientName: string, promotionOffer: string): string {
    const firstName = clientName ? clientName.trim().split(' ')[0] : 'amiga';
    const greeting = this.greetings[Math.floor(Math.random() * this.greetings.length)].replace('{nome}', firstName);
    const intro = this.intros[Math.floor(Math.random() * this.intros.length)];
    const cta = this.callToActions[Math.floor(Math.random() * this.callToActions.length)];
    const signature = this.signatures[Math.floor(Math.random() * this.signatures.length)];

    return `${greeting}\n\n${intro}\n\n📢 *${promotionOffer.trim()}*\n\n${cta}\n\n📍 _${signature}_`;
  }

  // Prepara o rascunho de uma nova campanha
  public prepareCampaign(
    establishmentId: string,
    title: string,
    rawDescription: string,
    minDelaySeconds: number = 25,
    maxDelaySeconds: number = 55
  ): {
    campaign: PromotionCampaign;
    previewMessage: string;
    totalEligibleClients: number;
  } {
    const allClients = storage.getClients(establishmentId);
    // Filtra clientes com telefone válido (mínimo 10 dígitos)
    const validClients = allClients.filter(c => {
      const clean = (c.phone || c.whatsapp || '').replace(/\D/g, '');
      return clean.length >= 10;
    });

    const sampleName = validClients.length > 0 ? validClients[0].name : 'Maria';
    const previewMessage = this.generatePersonalizedMessage(sampleName, rawDescription);

    const recipients: CampaignRecipient[] = this.shuffle(validClients).map(client => ({
      clientId: client.id,
      clientName: client.name,
      phone: (client.whatsapp || client.phone).replace(/\D/g, ''),
      status: 'PENDENTE'
    }));

    const campaign = storage.createCampaign({
      establishmentId,
      title: title || 'Promoção Relâmpago',
      rawDescription,
      messageTemplate: '{personalized}',
      status: 'RASCUNHO',
      totalRecipients: recipients.length,
      minDelaySeconds,
      maxDelaySeconds,
      recipients
    });

    return {
      campaign,
      previewMessage,
      totalEligibleClients: recipients.length
    };
  }

  // Inicia o disparo em segundo plano com pausas aleatórias e proteção Anti-Ban
  public async startCampaign(campaignId: string): Promise<boolean> {
    const campaign = storage.getCampaignById(campaignId);
    if (!campaign) {
      console.error(`[Campanha] Campanha ${campaignId} não encontrada.`);
      return false;
    }

    if (campaign.status === 'EM_ANDAMENTO') {
      console.log(`[Campanha] Campanha ${campaignId} já está em andamento.`);
      return true;
    }

    storage.updateCampaign(campaignId, {
      status: 'EM_ANDAMENTO',
      startedAt: new Date().toISOString()
    });

    this.activeCampaignTasks.set(campaignId, true);

    // Dispara execução assíncrona em background sem travar o event loop
    this.runCampaignLoop(campaignId).catch(err => {
      console.error(`[Campanha] Erro no loop da campanha ${campaignId}:`, err);
    });

    return true;
  }

  // Loop inteligente com pausas aleatórias e simulação humana
  private async runCampaignLoop(campaignId: string) {
    const campaign = storage.getCampaignById(campaignId);
    if (!campaign) return;

    console.log(`[Campanha Anti-Ban 🚀] Iniciando campanha "${campaign.title}" para ${campaign.totalRecipients} clientes.`);
    const establishment = storage.getEstablishment(campaign.establishmentId);
    const adminPhone = establishment.adminNotificationPhone || config.adminPhone;

    let sent = campaign.sentCount;
    let failed = campaign.failedCount;

    for (let i = 0; i < campaign.recipients.length; i++) {
      // Verifica se a campanha foi cancelada pelo usuário
      if (!this.activeCampaignTasks.get(campaignId)) {
        console.log(`[Campanha ⏹️] Campanha ${campaignId} interrompida pelo usuário.`);
        storage.updateCampaign(campaignId, { status: 'CANCELADO' });
        break;
      }

      const recipient = campaign.recipients[i];
      if (recipient.status === 'ENVIADO') {
        continue;
      }

      // Gera mensagem única personalizada para este cliente
      const personalizedText = this.generatePersonalizedMessage(recipient.clientName, campaign.rawDescription);
      recipient.sentMessage = personalizedText;

      // 1. Simula tempo de digitação humana (entre 3 e 6 segundos)
      const typingSecs = Math.floor(Math.random() * 4) + 3;

      console.log(`[Campanha Anti-Ban (${i + 1}/${campaign.recipients.length})] Enviando para ${recipient.clientName} (${recipient.phone})...`);

      const success = await whatsappService.sendPromotionMessageWithAntiBan(
        recipient.phone,
        personalizedText,
        typingSecs
      );

      if (success) {
        recipient.status = 'ENVIADO';
        recipient.sentAt = new Date().toISOString();
        sent++;
      } else {
        recipient.status = 'ERRO';
        recipient.error = 'Falha no envio';
        failed++;
      }

      // Atualiza o progresso no banco de dados a cada envio
      storage.updateCampaign(campaignId, {
        sentCount: sent,
        failedCount: failed,
        recipients: campaign.recipients
      });

      // Se ainda houver destinatários, aguarda um intervalo randômico de segurança anti-ban
      if (i < campaign.recipients.length - 1 && this.activeCampaignTasks.get(campaignId)) {
        const min = campaign.minDelaySeconds || 25;
        const max = campaign.maxDelaySeconds || 55;
        const randomDelay = Math.floor(Math.random() * (max - min + 1)) + min;
        console.log(`[Campanha Anti-Ban ⏳] Pausa de segurança: aguardando ${randomDelay}s antes do próximo envio...`);
        await new Promise(r => setTimeout(r, randomDelay * 1000));
      }
    }

    this.activeCampaignTasks.delete(campaignId);

    const isFinished = sent + failed >= campaign.totalRecipients;
    if (isFinished) {
      storage.updateCampaign(campaignId, {
        status: 'CONCLUIDO',
        completedAt: new Date().toISOString()
      });

      console.log(`[Campanha Concluída 🎯] "${campaign.title}" finalizada: ${sent} enviados, ${failed} falhas.`);

      // Notifica o Admin no WhatsApp sobre a conclusão da campanha
      if (adminPhone) {
        const summaryMsg = `🎉 *Campanha Promocional Finalizada!*\n\n` +
          `📢 *Promoção:* ${campaign.rawDescription}\n` +
          `✅ *Enviados com sucesso:* ${sent}\n` +
          `❌ *Falhas:* ${failed}\n` +
          `🛡️ *Proteção Anti-Ban:* Todos os envios foram feitos com intervalos aleatórios e textos personalizados para a segurança do chip.\n\n` +
          `Estou a postos no WhatsApp para atender e agendar qualquer cliente que responder! 💜`;

        await whatsappService.sendMessageToClient(adminPhone, summaryMsg);
      }
    }
  }

  // Cancela ou pausa a campanha
  public cancelCampaign(campaignId: string): boolean {
    if (this.activeCampaignTasks.has(campaignId)) {
      this.activeCampaignTasks.set(campaignId, false);
      storage.updateCampaign(campaignId, { status: 'CANCELADO' });
      return true;
    }
    return false;
  }

  // Consulta o progresso de uma campanha
  public getCampaignStatus(campaignId: string) {
    const campaign = storage.getCampaignById(campaignId);
    if (!campaign) return null;

    const remaining = campaign.totalRecipients - (campaign.sentCount + campaign.failedCount);
    const avgDelay = ((campaign.minDelaySeconds || 25) + (campaign.maxDelaySeconds || 55)) / 2;
    const estimatedMinutesRemaining = Math.ceil((remaining * avgDelay) / 60);

    return {
      id: campaign.id,
      title: campaign.title,
      status: campaign.status,
      total: campaign.totalRecipients,
      enviados: campaign.sentCount,
      erros: campaign.failedCount,
      restantes: remaining,
      tempoEstimadoMinutos: estimatedMinutesRemaining
    };
  }
}

export const campaignService = new CampaignService();
