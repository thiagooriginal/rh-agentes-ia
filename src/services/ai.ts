import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { storage } from '../db/storage.js';
import { config } from '../config.js';
import { googleCalendar } from './calendar.js';
import { campaignService } from './campaign.js';
import { demoService } from './demo.js';
import { DemoNiche } from '../types.js';
import { geocodingService } from './geocoding.js';

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
          mensagem: `Atendimento transferido com sucesso! O proprietário e responsável geral é o Thiago no WhatsApp (11) 95852-7119. Ele já foi notificado e pode falar diretamente com você a qualquer momento.`
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
      const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const dataHoje = now.toISOString().split('T')[0];
      const diaSemanaHoje = diasSemana[now.getDay()];
      const horaHoje = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const adminPhone = (establishment.adminNotificationPhone || config.adminPhone || '5511958527119').replace(/\D/g, '');
      const cleanSender = clientPhone.replace(/\D/g, '');
      const isSenderAdmin = cleanSender === adminPhone || cleanSender.endsWith('958527119') || cleanSender === '5511958527119';

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

      // Diretiva mestre do Dono / Proprietário Geral (Thiago - 11 95852-7119)
      const isOwner = clientPhone.replace(/\D/g, '').endsWith('958527119');
      if (isOwner) {
        systemInstruction += `\n\n👑 ATENÇÃO ESPECIAL: Você está conversando diretamente com o THIAGO (${clientPhone}), o PROPRIETÁRIO/DONO deste negócio e da plataforma RH de Agentes IA!\n` +
          `- Trate-o com deferência e cordialidade como o Dono da empresa.\n` +
          `- Chame-o de Thiago ou Senhor Thiago.\n` +
          `- Preste contas, detalhe os atendimentos e permita testes administrativos.`;
      } else {
        systemInstruction += `\n\n👑 INFORMAÇÃO DO PROPRIETÁRIO / DONO:\n` +
          `- Dono / Proprietário Geral Responsável: THIAGO\n` +
          `- WhatsApp Direto do Dono: (11) 95852-7119 (5511958527119)\n` +
          `- Se o cliente perguntar "quem é o dono?", "qual o contato do proprietário?", "quero falar com o responsável ou gerente": responda com máxima cordialidade informando que o dono responsável é o Thiago no WhatsApp (11) 95852-7119 e que você já está avisando ele também!`;
      }

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
}

export const aiService = new AIService();
