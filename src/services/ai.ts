import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { storage } from '../db/storage.js';
import { config } from '../config.js';
import { googleCalendar } from './calendar.js';
import { campaignService } from './campaign.js';
import { demoService } from './demo.js';
import { DemoNiche } from '../types.js';
import { geocodingService } from './geocoding.js';
import { getLocalDateStr, getLocalTimeStr, getLocalWeekdayName } from '../utils/date.js';

export class AIService {
  private genAI: GoogleGenAI | null = null;
  private currentApiKey: string = '';

  constructor() {
    this.initClient();
  }

  public initClient(apiKey?: string) {
    const key = apiKey || config.geminiApiKey || process.env.GEMINI_API_KEY;
    if (key && key.trim().length > 0) {
      this.currentApiKey = key.trim();
      this.genAI = new GoogleGenAI({ apiKey: this.currentApiKey });
    } else {
      this.genAI = null;
    }
  }

  public hasApiKey(): boolean {
    return !!this.genAI;
  }

  private getFunctionDeclarations(): FunctionDeclaration[] {
    return [
      {
        name: 'buscar_servicos_e_profissionais',
        description: 'Consulta o catálogo de serviços do salão, valores, duração e quais profissionais realizam cada serviço.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            categoria: {
              type: Type.STRING,
              description: 'Opcional: Categoria do serviço (ex: Cabelo, Unhas, Estética)'
            }
          }
        }
      },
      {
        name: 'consultar_disponibilidade',
        description: 'Consulta a agenda real e retorna os horários livres de um profissional específico em uma data.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            nome_ou_id_profissional: {
              type: Type.STRING,
              description: 'Nome ou ID do profissional (ex: Maria, Priscila, Joana, Renata)'
            },
            data_desejada: {
              type: Type.STRING,
              description: 'Data no formato YYYY-MM-DD (ex: 2026-10-10)'
            },
            duracao_minutos: {
              type: Type.INTEGER,
              description: 'Duração prevista do serviço em minutos'
            }
          },
          required: ['nome_ou_id_profissional', 'data_desejada']
        }
      },
      {
        name: 'confirmar_e_criar_agendamento',
        description: 'Cria efetivamente o agendamento no sistema e sincroniza o calendário após confirmação explícita do cliente.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            nome_cliente: {
              type: Type.STRING,
              description: 'Nome completo ou primeiro nome da cliente'
            },
            nome_profissional: {
              type: Type.STRING,
              description: 'Nome da profissional escolhida (Maria, Joana, Priscila, Renata)'
            },
            nome_servico: {
              type: Type.STRING,
              description: 'Nome do serviço escolhido (Progressiva, Corte, Manicure, Bronzeamento)'
            },
            data: {
              type: Type.STRING,
              description: 'Data do agendamento (YYYY-MM-DD)'
            },
            horario: {
              type: Type.STRING,
              description: 'Horário de início (HH:MM)'
            },
            observacoes: {
              type: Type.STRING,
              description: 'Observações adicionais ou preferências'
            }
          },
          required: ['nome_cliente', 'nome_profissional', 'nome_servico', 'data', 'horario']
        }
      },
      {
        name: 'consultar_meus_agendamentos',
        description: 'Localiza os agendamentos já marcados para o número de WhatsApp da cliente.',
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: 'reagendar_horario',
        description: 'Altera a data ou horário de um agendamento existente da cliente para um novo horário vago.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            id_agendamento: {
              type: Type.STRING,
              description: 'Código ou ID do agendamento'
            },
            nova_data: {
              type: Type.STRING,
              description: 'Nova data desejada (YYYY-MM-DD)'
            },
            novo_horario: {
              type: Type.STRING,
              description: 'Novo horário desejado (HH:MM)'
            }
          },
          required: ['id_agendamento', 'nova_data', 'novo_horario']
        }
      },
      {
        name: 'cancelar_agendamento',
        description: 'Cancela um agendamento existente da cliente liberando o horário na agenda.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            id_agendamento: {
              type: Type.STRING,
              description: 'Código do agendamento a cancelar'
            },
            motivo: {
              type: Type.STRING,
              description: 'Motivo do cancelamento informado pela cliente'
            }
          },
          required: ['id_agendamento']
        }
      },
      {
        name: 'registrar_avaliacao_satisfacao',
        description: 'Registra a nota de satisfação (1 a 5 estrelas) e comentário da cliente após o atendimento.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            nota: {
              type: Type.INTEGER,
              description: 'Nota de 1 a 5 estrelas'
            },
            comentario: {
              type: Type.STRING,
              description: 'Elogio, crítica ou sugestão da cliente'
            }
          },
          required: ['nota']
        }
      },
      {
        name: 'chamar_atendimento_humano',
        description: 'Transfere a conversa para a recepcionista ou gerente humana quando o cliente solicita ou em casos complexos.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            motivo: {
              type: Type.STRING,
              description: 'Breve motivo da transferência'
            }
          }
        }
      },
      {
        name: 'preparar_campanha_promocional',
        description: 'Exclusivo para o Administrador/Dono: Prepara uma campanha de promoção relâmpago para ser enviada às clientes cadastradas no salão. Retorna quantas clientes receberão e uma prévia da mensagem gerada.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            descricao_promocao: {
              type: Type.STRING,
              description: 'Texto ou condição da promoção (ex: Progressiva com 30% de desconto hoje e amanhã!)'
            },
            titulo: {
              type: Type.STRING,
              description: 'Título curto da promoção (ex: Promoção Progressiva Relâmpago)'
            }
          },
          required: ['descricao_promocao']
        }
      },
      {
        name: 'confirmar_e_disparar_campanha',
        description: 'Exclusivo para o Administrador/Dono: Inicia o disparo em segundo plano da promoção relâmpago para todas as clientes cadastradas, utilizando pausas aleatórias e proteção Anti-Ban para proteger o chip.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            id_campanha: {
              type: Type.STRING,
              description: 'Opcional: ID da campanha a disparar. Se omitido, dispara a última preparada.'
            }
          }
        }
      },
      {
        name: 'consultar_status_campanha',
        description: 'Exclusivo para o Administrador/Dono: Consulta o andamento dos disparos de promoções em segundo plano (quantos enviados, quantos faltam, tempo restante estimado).',
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      }
    ];
  }

  private async executeFunction(name: string, args: any, clientPhone: string, clientName?: string): Promise<any> {
    const establishment = storage.getEstablishment();

    switch (name) {
      case 'buscar_servicos_e_profissionais': {
        const services = storage.getServices(establishment.id);
        const professionals = storage.getProfessionals(establishment.id);

        const catalogo = services.map(s => {
          const proNames = professionals
            .filter(p => s.allowedProfessionalIds.includes(p.id))
            .map(p => p.name);
          return {
            id: s.id,
            nome: s.name,
            categoria: s.category,
            preco: `R$ ${s.price.toFixed(2)}`,
            duracao: `${Math.floor(s.durationMinutes / 60) > 0 ? Math.floor(s.durationMinutes / 60) + 'h' : ''}${s.durationMinutes % 60 > 0 ? (s.durationMinutes % 60) + 'min' : ''}`.trim(),
            descricao: s.description,
            profissionais_disponiveis: proNames
          };
        });

        return { sucesso: true, catalogo };
      }

      case 'consultar_disponibilidade': {
        const { nome_ou_id_profissional, data_desejada, duracao_minutos } = args;
        const profs = storage.getProfessionals(establishment.id);

        const prof = profs.find(p =>
          p.id.toLowerCase() === (nome_ou_id_profissional || '').toLowerCase() ||
          p.name.toLowerCase().includes((nome_ou_id_profissional || '').toLowerCase()) ||
          p.nickname.toLowerCase().includes((nome_ou_id_profissional || '').toLowerCase())
        );

        if (!prof) {
          return {
            sucesso: false,
            mensagem: `Profissional "${nome_ou_id_profissional}" não encontrada. Nossas profissionais ativas: ${profs.map(p => p.name).join(', ')}`
          };
        }

        const duration = duracao_minutos || 60;
        const slots = storage.getAvailableSlots(prof.id, duration, data_desejada);

        return {
          sucesso: true,
          profissional: prof.name,
          data: data_desejada,
          horarios_livres: slots,
          possui_disponibilidade: slots.length > 0,
          mensagem: slots.length > 0
            ? `Encontrei ${slots.length} horários disponíveis para ${prof.name} no dia ${data_desejada}.`
            : `Não há horários disponíveis para ${prof.name} no dia ${data_desejada}.`
        };
      }

      case 'confirmar_e_criar_agendamento': {
        const { nome_cliente, nome_profissional, nome_servico, data, horario, observacoes } = args;

        const client = storage.findOrCreateClient({
          establishmentId: establishment.id,
          name: nome_cliente || clientName || 'Cliente',
          phone: clientPhone,
          whatsapp: clientPhone
        });

        const profs = storage.getProfessionals(establishment.id);
        const prof = profs.find(p =>
          p.name.toLowerCase().includes((nome_profissional || '').toLowerCase()) ||
          p.nickname.toLowerCase().includes((nome_profissional || '').toLowerCase())
        );
        if (!prof) return { sucesso: false, mensagem: `Profissional "${nome_profissional}" não encontrada.` };

        const services = storage.getServices(establishment.id);
        const serv = services.find(s => s.name.toLowerCase().includes((nome_servico || '').toLowerCase()));
        if (!serv) return { sucesso: false, mensagem: `Serviço "${nome_servico}" não encontrado.` };

        const result = storage.createAppointment({
          establishmentId: establishment.id,
          clientId: client.id,
          clientName: client.name,
          clientPhone,
          professionalId: prof.id,
          serviceId: serv.id,
          date: data,
          startTime: horario,
          notes: observacoes
        });

        if (!result.success || !result.appointment) {
          return { sucesso: false, mensagem: result.message };
        }

        const gcalEventId = await googleCalendar.createEvent(result.appointment);
        if (gcalEventId) {
          result.appointment.googleEventId = gcalEventId;
        }

        return {
          sucesso: true,
          mensagem: 'Agendamento confirmado e registrado com sucesso!',
          agendamento: {
            id: result.appointment.id,
            cliente: result.appointment.clientName,
            servico: result.appointment.serviceName,
            profissional: result.appointment.professionalName,
            data: result.appointment.date,
            horario: result.appointment.startTime,
            duracao: `${result.appointment.durationMinutes} minutos`,
            valor: `R$ ${result.appointment.priceCharged.toFixed(2)}`,
            endereco: establishment.address
          }
        };
      }

      case 'consultar_meus_agendamentos': {
        const client = storage.findClientByPhone(clientPhone, establishment.id);
        if (!client) {
          return { sucesso: true, agendamentos: [], mensagem: 'Nenhum agendamento ativo encontrado.' };
        }

        const apps = storage.getAppointments({
          establishmentId: establishment.id,
          clientId: client.id
        }).filter(a => a.status === 'CONFIRMADO' || a.status === 'AGUARDANDO_CONFIRMACAO');

        return {
          sucesso: true,
          agendamentos: apps.map(a => ({
            id: a.id,
            servico: a.serviceName,
            profissional: a.professionalName,
            data: a.date,
            horario: a.startTime,
            status: a.status
          }))
        };
      }

      case 'reagendar_horario': {
        const { id_agendamento, nova_data, novo_horario } = args;
        const res = storage.rescheduleAppointment(id_agendamento, nova_data, novo_horario);
        if (res.success && res.appointment) {
          await googleCalendar.updateEvent(res.appointment);
          return {
            sucesso: true,
            mensagem: `Agendamento alterado com sucesso para ${nova_data} às ${novo_horario}!`,
            agendamento: res.appointment
          };
        }
        return { sucesso: false, mensagem: res.message };
      }

      case 'cancelar_agendamento': {
        const { id_agendamento, motivo } = args;
        const app = storage.getAppointmentById(id_agendamento);
        if (!app) return { sucesso: false, mensagem: 'Agendamento não encontrado.' };

        storage.updateAppointmentStatus(id_agendamento, 'CANCELADO', {
          cancellationReason: motivo || 'Solicitado pelo cliente via WhatsApp',
          cancelledBy: 'CLIENTE'
        });

        if (app.googleEventId) {
          await googleCalendar.cancelEvent(app.googleEventId);
        }

        return {
          sucesso: true,
          mensagem: `Horário de ${app.serviceName} com ${app.professionalName} no dia ${app.date} foi cancelado com sucesso.`
        };
      }

      case 'registrar_avaliacao_satisfacao': {
        const { nota, comentario } = args;
        const client = storage.findClientByPhone(clientPhone, establishment.id);
        const lastApp = storage.getAppointments({
          establishmentId: establishment.id,
          clientId: client ? client.id : undefined
        }).reverse()[0];

        const review = storage.addReview({
          establishmentId: establishment.id,
          appointmentId: lastApp ? lastApp.id : 'avulso',
          rating: Number(nota),
          comment: comentario || 'Sem comentário adicional'
        });

        return {
          sucesso: true,
          mensagem: 'Avaliação recebida e registrada com sucesso! Muito obrigado pelo feedback!'
        };
      }

      case 'chamar_atendimento_humano': {
        storage.setHumanIntervention(clientPhone, true);
        return {
          sucesso: true,
          mensagem: `Atendimento transferido com sucesso! O responsável pelo estabelecimento já foi notificado e entrará em contato em breve.`
        };
      }

      case 'preparar_campanha_promocional': {
        const { descricao_promocao, titulo } = args;
        const res = campaignService.prepareCampaign(
          establishment.id,
          titulo || 'Promoção Relâmpago',
          descricao_promocao,
          25,
          55
        );
        return {
          sucesso: true,
          id_campanha: res.campaign.id,
          total_clientes: res.totalEligibleClients,
          previa_mensagem: res.previewMessage,
          tempo_estimado_minutos: Math.ceil((res.totalEligibleClients * 40) / 60),
          aviso_antiban: 'Os envios serão realizados em segundo plano com intervalos aleatórios entre 25 e 55 segundos por cliente e simulação de digitação humana para total segurança do seu chip.'
        };
      }

      case 'confirmar_e_disparar_campanha': {
        const campaigns = storage.getCampaigns(establishment.id);
        const targetCamp = args.id_campanha 
          ? campaigns.find(c => c.id === args.id_campanha)
          : campaigns.slice(-1)[0];

        if (!targetCamp) {
          return { sucesso: false, mensagem: 'Nenhuma campanha preparada encontrada para disparar.' };
        }

        const started = await campaignService.startCampaign(targetCamp.id);
        if (!started) {
          return { sucesso: false, mensagem: 'Não foi possível iniciar os disparos da campanha.' };
        }

        return {
          sucesso: true,
          mensagem: `Campanha "${targetCamp.title}" iniciada com sucesso em segundo plano!`,
          total_destinatarios: targetCamp.totalRecipients,
          detalhes: 'Você receberá uma notificação aqui no WhatsApp assim que todos os envios forem concluídos.'
        };
      }

      case 'consultar_status_campanha': {
        const campaigns = storage.getCampaigns(establishment.id);
        const lastCamp = campaigns.slice(-1)[0];
        if (!lastCamp) {
          return { sucesso: true, mensagem: 'Nenhuma campanha ativa no momento.' };
        }
        const status = campaignService.getCampaignStatus(lastCamp.id);
        return {
          sucesso: true,
          status
        };
      }

      default:
        return { erro: `Função ${name} não implementada.` };
    }
  }

  public async processMessage(clientPhone: string, userMessage: string, clientName?: string): Promise<string> {
    const establishment = storage.getEstablishment();

    if (!this.genAI) {
      this.initClient();
    }

    if (!this.genAI) {
      return `Oi! 😊 Sou a *${establishment.secretaryName}*, recepcionista virtual do *${establishment.name}*.\n\n⚠️ O sistema de inteligência artificial ainda não possui a chave do Gemini configurada.`;
    }

    try {
      storage.saveConversationMessage(clientPhone, 'user', userMessage);

      const now = new Date();
      const dataHoje = getLocalDateStr(now);
      const diaSemanaHoje = getLocalWeekdayName(now);
      const horaHoje = getLocalTimeStr(now);

      const adminPhone = (establishment.adminNotificationPhone || config.adminPhone || '').replace(/\D/g, '');
      const cleanSender = clientPhone.replace(/\D/g, '');
      const isSenderAdmin = Boolean(adminPhone && (cleanSender === adminPhone || (cleanSender.length >= 8 && cleanSender.endsWith(adminPhone.slice(-8)))));

      const adminInstructions = isSenderAdmin ? `
MODO ADMINISTRADOR (DONO DO SALÃO):
Você está conversando diretamente com o PROPRIETÁRIO/ADMINISTRADOR do salão (Thiago)!
O Administrador tem poderes de gestão:
1. LANÇAR PROMOÇÃO RELÂMPAGO:
   - Se o dono pedir para enviar, lançar ou disparar uma promoção para as clientes (ex: "lança promoção de progressiva hoje", "avisa as clientes sobre desconto de 20%"):
   - Chame a ferramenta 'preparar_campanha_promocional' passando o texto/oferta da promoção.
   - Mostre a prévia da mensagem gerada com Spintax (variações automáticas de saudação e assinatura), a quantidade de clientes que receberão e o tempo estimado.
   - Destaque que o sistema conta com PROTEÇÃO ANTI-BAN com pausas aleatórias (25s a 55s) e simulação de digitação humana ("digitando...") para evitar qualquer risco de bloqueio do chip.
   - Pergunte se o dono confirma o início dos disparos em segundo plano.
2. CONFIRMAÇÃO DE DISPARO:
   - Quando o dono confirmar ("sim", "pode disparar", "confirmo", "envia"), chame IMEDIATAMENTE 'confirmar_e_disparar_campanha'.
   - Explique que o envio está acontecendo em segundo plano de forma alternada e segura, e que ele receberá um aviso assim que terminar.
3. STATUS DA CAMPANHA:
   - Se o dono perguntar "como estão os envios?", chame 'consultar_status_campanha'.
      ` : '';

      const systemInstruction = `
Você é ${establishment.secretaryName}, a recepcionista virtual do "${establishment.name}".
Seu objetivo é atender clientes no WhatsApp de forma natural, calorosa, gentil, ágil e profissional.

DADOS DO ESTABELECIMENTO:
- Nome: ${establishment.name}
- Endereço: ${establishment.address}
- Telefone / WhatsApp: ${establishment.phone} / ${establishment.whatsapp}
- Horário Geral: ${establishment.openTime} às ${establishment.closeTime} (Segunda a Sábado)

INFORMAÇÃO TEMPORAL:
- Hoje é: ${dataHoje} (${diaSemanaHoje})
- Horário atual: ${horaHoje}

PROFISSIONAIS E SERVIÇOS:
- Maria: Progressiva (R$ 180, 2h30). Atende Segunda a Sábado.
- Joana: Corte de cabelo (R$ 60, 1h). Atende Terça a Sábado.
- Priscila: Manicure (R$ 40, 1h). Atende Segunda, Quarta e Sexta.
- Renata: Bronzeamento (R$ 100, 1h30). Atende Quinta a Domingo.

${adminInstructions}

DIRETRIZES GERAIS:
1. NUNCA invente preços, horários ou profissionais. Sempre chame 'buscar_servicos_e_profissionais' ou 'consultar_disponibilidade'.
2. Se o cliente já informou serviço e data (ex: "Quero manicure sexta às 14h"), consulte diretamente a disponibilidade sem perguntar tudo de novo.
3. Se o horário estiver livre, pergunte se pode confirmar.
4. Somente após a confirmação da cliente ("pode", "sim", "confirma"), chame 'confirmar_e_criar_agendamento'.
5. Após confirmar, envie um resumo elegante com Serviço, Profissional, Data, Horário, Valor e Endereço.
6. No final do atendimento ou agendamento, pergunte com educação e carinho: "Posso te enviar um lembrete um dia antes e também 2h antes aqui no seu WhatsApp para você não esquecer? 😊"
7. Use emojis de forma moderada e carinhosa (😊, 💜, 📅, ⏰).
      `.trim();

      const history = storage.getConversationHistory(clientPhone);
      // Pega as mensagens anteriores (exceto a última que acabamos de salvar)
      const previousTurns = history.slice(0, -1).slice(-10).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      const chat = this.genAI.chats.create({
        model: 'gemini-3.5-flash-lite',
        history: previousTurns,
        config: {
          systemInstruction,
          tools: [{
            functionDeclarations: this.getFunctionDeclarations()
          }]
        }
      });

      let response = await chat.sendMessage({ message: userMessage });

      let iterations = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && iterations < 5) {
        iterations++;
        const call = response.functionCalls[0];
        const result = await this.executeFunction(call.name || '', call.args, clientPhone, clientName);

        response = await chat.sendMessage({
          message: [{
            functionResponse: {
              name: call.name || '',
              response: result
            }
          }]
        });
      }

      const replyText = response.text || 'Horário e solicitação processados com sucesso! 😊';
      storage.saveConversationMessage(clientPhone, 'assistant', replyText);
      return replyText;

    } catch (error: any) {
      console.error('[AI] Erro no fluxo do Gemini:', error);
      const fallback = 'Oi! Tive uma pequena oscilação para consultar a agenda neste exato instante. Poderia me confirmar para qual dia e serviço você deseja o atendimento? 😊';
      storage.saveConversationMessage(clientPhone, 'assistant', fallback);
      return fallback;
    }
  }

  // Processamento de mensagem para os agentes da vitrine de soluções (multi-personas)
  public async processDemoMessage(
    clientPhone: string,
    userMessage: string,
    clientName: string,
    niche: DemoNiche
  ): Promise<string> {
    if (!this.genAI) this.initClient();
    if (!this.genAI) {
      return 'Olá! Nosso serviço de Inteligência Artificial está sendo inicializado. Por favor, tente novamente em alguns instantes.';
    }

    storage.saveConversationMessage(clientPhone, 'user', userMessage);

    try {
      const persona = demoService.getPersona(niche);
      let systemInstruction = persona.systemInstruction(clientName, clientPhone);

      // Diretiva de demonstração no nicho do estabelecimento
      systemInstruction += `\n\n🎯 MODO DEMONSTRAÇÃO AO VIVO (RH DE AGENTES IA):\n` +
        `- Você está conversando com o visitante ${clientName} (${clientPhone}), demonstrando com excelência o atendimento do nicho "${persona.businessName}".\n` +
        `- Atue integralmente como o colaborador digital ${persona.agentName}, tirando dúvidas, apresentando serviços e mostrando agilidade e empatia.\n` +
        `- Se o visitante perguntar sobre o responsável, gerente ou proprietário: explique cordialmente que a gerência foi informada da conversa e que você está à total disposição para ajudá-lo no que precisar!`;

      const history = storage.getConversationHistory(clientPhone);
      // Pega histórico anterior (exceto a mensagem atual que acabamos de salvar)
      const previousTurns = history.slice(0, -1).slice(-10).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      const demoTools = niche === 'pizzaria' ? [{
        functionDeclarations: [
          {
            name: 'calcular_taxa_entrega_geolocalizacao',
            description: 'Calcula a distância exata da pizzaria, o valor da taxa de entrega e o tempo estimado a partir de um endereço ou CEP informado pelo cliente.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                endereco_ou_cep: {
                  type: Type.STRING,
                  description: 'Endereço (rua, número e bairro) ou CEP de 8 dígitos do cliente.'
                }
              },
              required: ['endereco_ou_cep']
            }
          }
        ]
      }] : undefined;

      let response: any;
      let activeChat: any;
      try {
        activeChat = this.genAI.chats.create({
          model: 'gemini-3.5-flash-lite',
          history: previousTurns,
          config: {
            systemInstruction,
            tools: demoTools
          }
        });
        response = await activeChat.sendMessage({ message: userMessage });
      } catch (errLite: any) {
        console.warn(`[AI Demo ${niche}] Falha com gemini-3.5-flash-lite (${errLite?.message}), acionando fallback gemini-3.5-flash...`);
        activeChat = this.genAI.chats.create({
          model: 'gemini-3.5-flash',
          history: previousTurns,
          config: {
            systemInstruction,
            tools: demoTools
          }
        });
        response = await activeChat.sendMessage({ message: userMessage });
      }

      // Processa chamadas de funções para o nicho de Pizzaria (se houver)
      let iterations = 0;
      while (response && response.functionCalls && response.functionCalls.length > 0 && iterations < 3) {
        iterations++;
        const call: any = response.functionCalls[0];
        let funcResult: any = { sucesso: true };

        if (call.name === 'calcular_taxa_entrega_geolocalizacao') {
          const rawQuery = (call.args as any)?.endereco_ou_cep || '';
          const geo = await geocodingService.searchAddressOrCep(rawQuery);
          if (geo) {
            funcResult = {
              sucesso: true,
              endereco_detectado: geo.address,
              bairro: geo.neighborhood || undefined,
              cidade: geo.city || undefined,
              distancia_km: geo.distanceKm,
              taxa_entrega: geo.deliveryFeeFormatted,
              tempo_estimado: geo.estimatedTime,
              dentro_do_raio: geo.withinRange,
              observacao: geo.notes
            };
          } else {
            funcResult = {
              sucesso: false,
              mensagem: 'Não conseguimos localizar as coordenadas exatas desse endereço no mapa. Use a taxa padrão de R$ 7,00 ou peça um ponto de referência próximo.'
            };
          }
        }

        response = await activeChat.sendMessage({
          message: [{
            functionResponse: {
              name: call.name || '',
              response: funcResult
            }
          }]
        });
      }

      const replyText = response.text || 'Entendido com sucesso! Como posso te ajudar mais? 😊';

      storage.saveConversationMessage(clientPhone, 'assistant', replyText);
      return replyText;
    } catch (err: any) {
      console.error(`[AI Demo ${niche}] Erro ao processar mensagem do Gemini:`, err);
      const persona = demoService.getPersona(niche);
      const fallback = `Oi! Tive uma leve oscilação de sinal aqui no sistema da ${persona.businessName}. Poderia me repetir o que você precisa? Estou à disposição! 😊`;
      storage.saveConversationMessage(clientPhone, 'assistant', fallback);
      return fallback;
    }
  }

  // Transcrição de áudio do WhatsApp usando Google Gemini
  public async transcribeAudio(audioBuffer: Buffer, mimeType: string = 'audio/ogg'): Promise<string> {
    if (!this.genAI) this.initClient();
    if (!this.genAI) throw new Error('Gemini API key não configurada.');

    let cleanMime = (mimeType || 'audio/ogg').split(';')[0].trim().toLowerCase();
    if (cleanMime === 'audio/opus') {
      cleanMime = 'audio/ogg';
    }

    const modelsToTry = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'];
    const base64Data = audioBuffer.toString('base64');

    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI 🎙️ Transcrição] Tentando transcrever áudio (${audioBuffer.length} bytes, ${cleanMime}) com ${modelName}...`);
        const response = await this.genAI.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMime,
                    data: base64Data
                  }
                },
                {
                  text: 'Transcreva todo o áudio falado em português do Brasil com precisão absoluta. Retorne APENAS o texto da fala exata da pessoa. Se o áudio contiver apenas ruído, chiado ou for silêncio, responda exatamente [SILÊNCIO]. Não coloque aspas, explicações ou notas adicionais.'
                }
              ]
            }
          ]
        });

        const rawText = (response.text || '').trim();
        if (rawText && !rawText.includes('[SILÊNCIO]')) {
          console.log(`[AI 🎙️ Transcrição Sucesso] Modelo ${modelName} transcreveu: "${rawText}"`);
          return rawText;
        } else if (rawText.includes('[SILÊNCIO]')) {
          console.log(`[AI 🎙️ Transcrição] Áudio inaudível ou silencioso detectado pelo modelo ${modelName}.`);
          return '';
        }
      } catch (err: any) {
        console.warn(`[AI 🎙️ Aviso] Modelo ${modelName} falhou na transcrição:`, err?.message || err);
      }
    }

    console.error('[AI 🎙️ Erro] Todos os modelos de transcrição falharam.');
    return '';
  }

  // ========================================================
  // --- MÓDULO JARVIS: SEGUNDO CÉREBRO & ASSISTENTE PESSOAL ---
  // ========================================================

  private getJarvisFunctionDeclarations(): FunctionDeclaration[] {
    return [
      {
        name: 'jarvis_registrar_transacao',
        description: 'Registra uma despesa (gasto) ou receita (ganho/entrada) financeira informada pelo usuário.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            tipo: {
              type: Type.STRING,
              description: 'DESPESA (para saídas, compras, contas pagas) ou RECEITA (para ganhos, salários, freelas, vendas)'
            },
            valor: {
              type: Type.NUMBER,
              description: 'Valor numérico em reais (positivo, ex: 45.50)'
            },
            descricao: {
              type: Type.STRING,
              description: 'Descrição clara do que foi pago ou recebido (ex: Almoço no restaurante, Uber pro trabalho, Pagamento de freela)'
            },
            categoria: {
              type: Type.STRING,
              description: 'Categoria apropriada (ex: Alimentação, Transporte, Moradia, Lazer, Saúde, Trabalho, Educação, Outros)'
            },
            data: {
              type: Type.STRING,
              description: 'Opcional: Data da transação no formato YYYY-MM-DD. Se for hoje, pode omitir.'
            }
          },
          required: ['tipo', 'valor', 'descricao']
        }
      },
      {
        name: 'jarvis_consultar_financas',
        description: 'Consulta o resumo financeiro (total gasto, total recebido, saldo e lista de transações) do usuário.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            periodo: {
              type: Type.STRING,
              description: 'Período desejado: "hoje", "semana", "mes" ou "tudo". Padrão: "hoje"'
            }
          }
        }
      },
      {
        name: 'jarvis_consultar_fatura_cartao',
        description: 'Consulta a fatura atual do cartão de crédito, compras acumuladas, detalhamento por item e total a pagar (ex: "quanto eu tenho de cartão pra pagar no dia 15?", "qual o total da fatura?", "quanto gastei no cartão?").',
        parameters: {
          type: Type.OBJECT,
          properties: {
            vencimento: {
              type: Type.STRING,
              description: 'Opcional: dia ou data de vencimento específico (ex: "15", "dia 15", "novembro"). Se omitido, consolida a fatura total de cartão de crédito acumulada.'
            }
          }
        }
      },
      {
        name: 'jarvis_adicionar_tarefa',
        description: 'Adiciona uma nova tarefa ou afazer na lista de To-Do do usuário.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            descricao: {
              type: Type.STRING,
              description: 'Descrição da tarefa a ser realizada'
            },
            data_limite: {
              type: Type.STRING,
              description: 'Opcional: Prazo ou data limite no formato YYYY-MM-DD ou texto'
            },
            prioridade: {
              type: Type.STRING,
              description: 'Opcional: ALTA, MEDIA ou BAIXA'
            }
          },
          required: ['descricao']
        }
      },
      {
        name: 'jarvis_listar_tarefas',
        description: 'Lista as tarefas do usuário filtradas por status.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            status: {
              type: Type.STRING,
              description: 'Filtrar por: "pendente", "concluida" ou "todas". Padrão: "pendente"'
            }
          }
        }
      },
      {
        name: 'jarvis_concluir_tarefa',
        description: 'Marca uma tarefa pendente como concluída.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            termo_ou_id: {
              type: Type.STRING,
              description: 'Palavra-chave ou ID da tarefa que foi finalizada'
            }
          },
          required: ['termo_ou_id']
        }
      },
      {
        name: 'jarvis_agendar_lembrete',
        description: 'Agenda um lembrete com data e horário para o Jarvis alertar o usuário.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            titulo: {
              type: Type.STRING,
              description: 'O que o usuário precisa ser lembrado (ex: Pagar o boleto da internet, Reunião com João)'
            },
            data: {
              type: Type.STRING,
              description: 'Data no formato YYYY-MM-DD (ex: 2026-11-05)'
            },
            hora: {
              type: Type.STRING,
              description: 'Horário no formato HH:MM (ex: 14:30)'
            },
            detalhes: {
              type: Type.STRING,
              description: 'Opcional: Detalhes ou observações adicionais'
            }
          },
          required: ['titulo', 'data', 'hora']
        }
      },
      {
        name: 'jarvis_consultar_lembretes',
        description: 'Consulta os lembretes e compromissos agendados.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            data: {
              type: Type.STRING,
              description: 'Opcional: Data específica no formato YYYY-MM-DD para consultar'
            }
          }
        }
      },
      {
        name: 'jarvis_salvar_anotacao',
        description: 'Guarda uma anotação, ideia, insight ou informação importante no caderno de notas do usuário.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            titulo: {
              type: Type.STRING,
              description: 'Título curto que resume o assunto da nota'
            },
            conteudo: {
              type: Type.STRING,
              description: 'Conteúdo detalhado da anotação ou ideia'
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Opcional: Lista de tags ou categorias para facilitar a busca (ex: ["negocios", "ideia"])'
            }
          },
          required: ['titulo', 'conteudo']
        }
      },
      {
        name: 'jarvis_buscar_anotacoes',
        description: 'Busca nas anotações e ideias salvas por palavra-chave.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            termo_busca: {
              type: Type.STRING,
              description: 'Termo ou palavra-chave para filtrar as notas. Se vazio, retorna as notas recentes.'
            }
          }
        }
      },
      {
        name: 'jarvis_adicionar_categoria',
        description: 'Cria uma nova categoria financeira personalizada (ex: "Cartão de Crédito", "Contas Fixas", "Petshop", "Investimentos").',
        parameters: {
          type: Type.OBJECT,
          properties: {
            nome: {
              type: Type.STRING,
              description: 'Nome da categoria (ex: Cartão de Crédito, Contas Fixas, Assinaturas)'
            },
            tipo: {
              type: Type.STRING,
              description: 'DESPESA, RECEITA ou AMBOS. Padrão: DESPESA'
            }
          },
          required: ['nome']
        }
      }
    ];
  }

  private async executeJarvisFunction(name: string, args: any, phone: string): Promise<any> {
    switch (name) {
      case 'jarvis_registrar_transacao': {
        const tx = storage.addPersonalTransaction({
          phone,
          type: args.tipo?.toUpperCase() === 'RECEITA' ? 'RECEITA' : 'DESPESA',
          amount: Number(args.valor) || 0,
          category: args.categoria,
          description: args.descricao,
          date: args.data
        });
        const summary = storage.getPersonalFinanceSummary(phone, 'hoje');
        return {
          sucesso: true,
          transacao_criada: tx,
          saldo_dia: summary.saldo,
          total_gasto_hoje: summary.totalDespesas,
          total_recebido_hoje: summary.totalReceitas
        };
      }

      case 'jarvis_consultar_financas': {
        const period = (args.periodo || 'hoje').toLowerCase() as any;
        const summary = storage.getPersonalFinanceSummary(phone, period);
        return { sucesso: true, ...summary };
      }

      case 'jarvis_consultar_fatura_cartao': {
        const allTransactions = storage.getPersonalTransactions(phone, 'tudo');
        const cardTransactions = allTransactions.filter(tx => {
          const cat = (tx.category || '').toLowerCase();
          const desc = (tx.description || '').toLowerCase();
          return cat.includes('cart') || desc.includes('cart') || desc.includes('fatura') || desc.includes('vencimento');
        });

        const venc = (args.vencimento || '').toLowerCase().trim();
        const filtered = venc
          ? cardTransactions.filter(tx => tx.description.toLowerCase().includes(venc) || tx.date.includes(venc))
          : cardTransactions;

        const finalTxList = filtered.length > 0 ? filtered : cardTransactions;
        const total = finalTxList.reduce((acc, tx) => acc + (tx.type === 'DESPESA' ? tx.amount : 0), 0);

        return {
          sucesso: true,
          total_fatura: total,
          quantidade_compras: finalTxList.length,
          compras: finalTxList.map(t => ({
            descricao: t.description,
            valor: t.amount,
            data: t.date,
            categoria: t.category
          }))
        };
      }

      case 'jarvis_adicionar_tarefa': {
        const task = storage.addPersonalTask({
          phone,
          description: args.descricao,
          dueDate: args.data_limite,
          priority: args.prioridade?.toUpperCase() as any
        });
        return { sucesso: true, tarefa_criada: task };
      }

      case 'jarvis_listar_tarefas': {
        const st = (args.status || 'pendente').toLowerCase() as any;
        const tasks = storage.getPersonalTasks(phone, st);
        return { sucesso: true, total: tasks.length, tarefas: tasks };
      }

      case 'jarvis_concluir_tarefa': {
        const task = storage.completePersonalTask(phone, args.termo_ou_id);
        if (!task) {
          return { sucesso: false, mensagem: `Nenhuma tarefa pendente encontrada com "${args.termo_ou_id}".` };
        }
        return { sucesso: true, tarefa_concluida: task };
      }

      case 'jarvis_agendar_lembrete': {
        const rem = storage.addPersonalReminder({
          phone,
          title: args.titulo,
          reminderDate: args.data,
          reminderTime: args.hora,
          details: args.detalhes
        });
        return { sucesso: true, lembrete_agendado: rem };
      }

      case 'jarvis_consultar_lembretes': {
        const list = storage.getPersonalReminders(phone, args.data);
        return { sucesso: true, total: list.length, lembretes: list };
      }

      case 'jarvis_salvar_anotacao': {
        const note = storage.addPersonalNote({
          phone,
          title: args.titulo,
          content: args.conteudo,
          tags: args.tags
        });
        return { sucesso: true, anotacao_salva: note };
      }

      case 'jarvis_buscar_anotacoes': {
        const list = storage.getPersonalNotes(phone, args.termo_busca);
        return { sucesso: true, total: list.length, anotacoes: list };
      }

      case 'jarvis_adicionar_categoria': {
        const cat = storage.addPersonalCategory({
          phone,
          name: args.nome,
          type: args.tipo?.toUpperCase() === 'RECEITA' ? 'RECEITA' : (args.tipo?.toUpperCase() === 'AMBOS' ? 'AMBOS' : 'DESPESA')
        });
        return { sucesso: true, categoria_criada: cat, mensagem: `Categoria "${cat.name}" criada com sucesso!` };
      }

      default:
        return { sucesso: false, erro: `Função Jarvis desconhecida: ${name}` };
    }
  }

  public async processJarvisMessage(clientPhone: string, userMessage: string, userName?: string): Promise<string> {
    if (!this.genAI) {
      return '⚠️ Jarvis indisponível: Chave da API do Google Gemini não configurada.';
    }

    storage.saveConversationMessage(clientPhone, 'user', userMessage);

    const now = new Date();
    const dataHoje = getLocalDateStr(now);
    const diaSemanaHoje = getLocalWeekdayName(now);
    const horaHoje = getLocalTimeStr(now);
    const nomeUsuario = userName || 'Chefe';
    const userCategories = storage.getPersonalCategories(clientPhone).map(c => c.name).join(', ');

    const systemInstruction = `
Você é o JARVIS, o Assistente Executivo e Segundo Cérebro de alta performance de ${nomeUsuario}.
Você opera diretamente pelo WhatsApp através de texto e mensagens de voz na conversa privada consigo mesmo (Self-Chat).

INFORMAÇÃO TEMPORAL ATUAL:
- Data de hoje: ${dataHoje} (${diaSemanaHoje})
- Horário atual: ${horaHoje}

CATEGORIAS FINANCEIRAS DISPONÍVEIS:
${userCategories}
- Use "Cartão de Crédito" para compras/gastos no cartão de crédito/fatura.
- Use "Contas Fixas" para contas recorrentes (aluguel, condomínio, luz, internet, água, planos).
- Se o usuário pedir para criar uma categoria nova (ex: "cria a categoria Assinaturas"), chame 'jarvis_adicionar_categoria'.

SEU PERFIL E PERSONALIDADE:
- Tom de voz: Sofisticado, executivo, extremamente ágil, proativo e confiável. Trate o usuário com respeito cordial (ex: "${nomeUsuario}" ou "Senhor", de forma natural e moderna).
- Objetividade: Sempre direto ao ponto. Nunca faça textos longos ou redundantes quando uma confirmação limpa for suficiente.
- Formatação: Use emojis elegantes (👔, 📊, 💰, ⏰, 📌, ✅, 💡) e listas formatadas em Markdown com negritos para facilitar a leitura rápida no celular.

SEUS 4 PILARES DE ATUAÇÃO:
1. 💰 FINANÇAS PESSOAIS & GASTOS:
   - Quando o usuário disser que gastou ou recebeu (ex: "gastei 45 no almoço", "paguei 80 de conta", "recebi 500 do cliente X"):
   - Chame 'jarvis_registrar_transacao' imediatamente.
   - Responda confirmando o lançamento com categoria, valor e o saldo diário atualizado.
   - Se ele perguntar "quanto gastei hoje?" ou "qual meu saldo?", chame 'jarvis_consultar_financas'.
   - Se ele perguntar sobre CARTÃO DE CRÉDITO, FATURA, VENCIMENTO (ex: "quanto tenho de cartão pra pagar no dia 15?", "qual o total do cartão?", "quanto deu a fatura?"):
     Chame SEMPRE 'jarvis_consultar_fatura_cartao' para obter o somatório acumulado consolidado de todos os lançamentos!

2. ✅ GERENCIAMENTO DE TAREFAS (TO-DO):
   - Quando o usuário mandar anotar afazeres (ex: "tenho que pagar o fornecedor amanhã", "anota aí: enviar contrato"):
   - Chame 'jarvis_adicionar_tarefa'.
   - Se ele perguntar "o que tenho pendente?", chame 'jarvis_listar_tarefas' e apresente em lista organizada.
   - Quando ele avisar que terminou ("concluí o contrato"), chame 'jarvis_concluir_tarefa'.

3. ⏰ LEMBRETES & COMPROMISSOS:
   - Quando ele pedir para lembrar de algo ("me lembra amanhã às 14h de..."):
   - Chame 'jarvis_agendar_lembrete' calculando a data e horário corretos baseando-se na data/hora de hoje (${dataHoje} ${horaHoje}).
   - Se ele perguntar a programação, chame 'jarvis_consultar_lembretes'.

4. 📝 ANOTAÇÕES, IDEIAS & INSIGHTS:
   - Quando ele mandar ideias, reflexões ou notas ("anota essa ideia...", "guarda essa informação..."):
   - Chame 'jarvis_salvar_anotacao' com um título conciso e o conteúdo completo.
   - Para recuperar, chame 'jarvis_buscar_anotacoes'.

REGRAS ESSENCIAIS:
- Se uma mensagem contiver múltiplos itens (ex: "gastei 30 no almoço e me lembra amanhã às 15h de ligar pro banco"), processe AMBOS chamando as respectivas ferramentas!
- Sempre que executar uma ação, confirme com clareza o que foi registrado.
`.trim();

    const history = storage.getConversationHistory(clientPhone);
    const previousTurns = history.slice(0, -1).slice(-10).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const tools = [{
      functionDeclarations: this.getJarvisFunctionDeclarations()
    }];

    const modelsToTry = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'];
    let activeChat: any = null;
    let response: any = null;

    for (const model of modelsToTry) {
      try {
        activeChat = this.genAI.chats.create({
          model,
          history: previousTurns,
          config: { systemInstruction, tools }
        });
        response = await activeChat.sendMessage({ message: userMessage });
        break;
      } catch (err: any) {
        console.warn(`[Jarvis AI] Modelo ${model} falhou:`, err?.message);
      }
    }

    if (!response || !activeChat) {
      return '⚠️ Jarvis: Não foi possível processar seu comando neste momento. Tente novamente em instantes.';
    }

    let iterations = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && iterations < 5) {
      iterations++;
      const call = response.functionCalls[0];
      const result = await this.executeJarvisFunction(call.name || '', call.args, clientPhone);

      response = await activeChat.sendMessage({
        message: [{
          functionResponse: {
            name: call.name || '',
            response: result
          }
        }]
      });
    }

    const replyText = response.text || 'Comando registrado com sucesso, Chefe! 👔✅';
    storage.saveConversationMessage(clientPhone, 'assistant', replyText);
    return replyText;
  }
}

export const aiService = new AIService();
