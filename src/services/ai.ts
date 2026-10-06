import { GoogleGenerativeAI, SchemaType, FunctionDeclaration, Tool } from '@google/generative-ai';
import { storage } from '../db/storage.js';
import { config } from '../config.js';
import { googleCalendar } from './calendar.js';

export class AIService {
  private genAI: GoogleGenerativeAI | null = null;
  private currentApiKey: string = '';

  constructor() {
    this.initClient();
  }

  public initClient(apiKey?: string) {
    const key = apiKey || config.geminiApiKey || process.env.GEMINI_API_KEY;
    if (key && key.trim().length > 0) {
      this.currentApiKey = key.trim();
      this.genAI = new GoogleGenerativeAI(this.currentApiKey);
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
          type: SchemaType.OBJECT,
          properties: {
            categoria: {
              type: SchemaType.STRING,
              description: 'Opcional: Categoria do serviço (ex: Cabelo, Unhas, Estética)'
            }
          }
        }
      },
      {
        name: 'consultar_disponibilidade',
        description: 'Consulta a agenda real e retorna os horários livres de um profissional específico em uma data.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            nome_ou_id_profissional: {
              type: SchemaType.STRING,
              description: 'Nome ou ID do profissional (ex: Maria, Priscila, Joana, Renata)'
            },
            data_desejada: {
              type: SchemaType.STRING,
              description: 'Data no formato YYYY-MM-DD (ex: 2026-10-10)'
            },
            duracao_minutos: {
              type: SchemaType.INTEGER,
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
          type: SchemaType.OBJECT,
          properties: {
            nome_cliente: {
              type: SchemaType.STRING,
              description: 'Nome completo ou primeiro nome da cliente'
            },
            nome_profissional: {
              type: SchemaType.STRING,
              description: 'Nome da profissional escolhida (Maria, Joana, Priscila, Renata)'
            },
            nome_servico: {
              type: SchemaType.STRING,
              description: 'Nome do serviço escolhido (Progressiva, Corte, Manicure, Bronzeamento)'
            },
            data: {
              type: SchemaType.STRING,
              description: 'Data do agendamento (YYYY-MM-DD)'
            },
            horario: {
              type: SchemaType.STRING,
              description: 'Horário de início (HH:MM)'
            },
            observacoes: {
              type: SchemaType.STRING,
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
          type: SchemaType.OBJECT,
          properties: {}
        }
      },
      {
        name: 'reagendar_horario',
        description: 'Altera a data ou horário de um agendamento existente da cliente para um novo horário vago.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id_agendamento: {
              type: SchemaType.STRING,
              description: 'Código ou ID do agendamento'
            },
            nova_data: {
              type: SchemaType.STRING,
              description: 'Nova data desejada (YYYY-MM-DD)'
            },
            novo_horario: {
              type: SchemaType.STRING,
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
          type: SchemaType.OBJECT,
          properties: {
            id_agendamento: {
              type: SchemaType.STRING,
              description: 'Código do agendamento a cancelar'
            },
            motivo: {
              type: SchemaType.STRING,
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
          type: SchemaType.OBJECT,
          properties: {
            nota: {
              type: SchemaType.INTEGER,
              description: 'Nota de 1 a 5 estrelas'
            },
            comentario: {
              type: SchemaType.STRING,
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
          type: SchemaType.OBJECT,
          properties: {
            motivo: {
              type: SchemaType.STRING,
              description: 'Breve motivo da transferência'
            }
          }
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

        // Encontra profissional pelo nome aproximado
        const prof = profs.find(p =>
          p.id.toLowerCase() === nome_ou_id_profissional.toLowerCase() ||
          p.name.toLowerCase().includes(nome_ou_id_profissional.toLowerCase()) ||
          p.nickname.toLowerCase().includes(nome_ou_id_profissional.toLowerCase())
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

        // Busca ou cria cadastro do cliente
        const client = storage.findOrCreateClient({
          establishmentId: establishment.id,
          name: nome_cliente || clientName || 'Cliente',
          phone: clientPhone,
          whatsapp: clientPhone
        });

        const profs = storage.getProfessionals(establishment.id);
        const prof = profs.find(p =>
          p.name.toLowerCase().includes(nome_profissional.toLowerCase()) ||
          p.nickname.toLowerCase().includes(nome_profissional.toLowerCase())
        );
        if (!prof) return { sucesso: false, mensagem: `Profissional "${nome_profissional}" não encontrada.` };

        const services = storage.getServices(establishment.id);
        const serv = services.find(s => s.name.toLowerCase().includes(nome_servico.toLowerCase()));
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

        // Sincroniza com o Google Calendar
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
          mensagem: `Atendimento transferido para a recepção humana. O número do salão é ${establishment.transferToHumanPhone || establishment.phone}.`
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
      return `Oi! 😊 Sou a *${establishment.secretaryName}*, recepcionista virtual do *${establishment.name}*.\n\n⚠️ O sistema de inteligência artificial ainda não possui a chave do Gemini configurada. Você pode adicioná-la no painel em http://localhost:${config.port}/.`;
    }

    try {
      storage.saveConversationMessage(clientPhone, 'user', userMessage);

      const now = new Date();
      const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const dataHoje = now.toISOString().split('T')[0];
      const diaSemanaHoje = diasSemana[now.getDay()];
      const horaHoje = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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

PROFISSIONAIS E SERVIÇOS (REGRAS IMPORTANTES):
- Maria: Progressiva (R$ 180, 2h30). Atende Segunda a Sábado.
- Joana: Corte de cabelo (R$ 60, 1h). Atende Terça a Sábado.
- Priscila: Manicure (R$ 40, 1h). Atende Segunda, Quarta e Sexta.
- Renata: Bronzeamento (R$ 100, 1h30). Atende Quinta a Domingo.

DIRETRIZES DE ATENDIMENTO:
1. NUNCA invente preços, horários ou profissionais. Sempre chame 'buscar_servicos_e_profissionais' ou 'consultar_disponibilidade'.
2. Se o cliente disser tudo de uma vez (ex: "Quero fazer manicure sábado às 14"), NÃO fique perguntando de novo o serviço ou dia! Chame diretamente a disponibilidade para o horário indicado.
3. Se o horário estiver vago, PERGUNTE SE PODE CONFIRMAR antes de registrar.
4. Somente após a confirmação da cliente ("pode", "sim", "confirma"), chame 'confirmar_e_criar_agendamento'.
5. Após confirmar, envie uma mensagem bonita com os dados do agendamento (Serviço, Profissional, Data, Horário, Valor e Endereço).
6. Se o cliente pedir para mudar ou cancelar, localize os agendamentos com 'consultar_meus_agendamentos', confirme com o cliente e use 'reagendar_horario' ou 'cancelar_agendamento'.
7. Se o cliente der uma nota (ex: "5", "adorei", "nota 4"), chame 'registrar_avaliacao_satisfacao'.
8. Se pedir para falar com atendente ou humano, chame 'chamar_atendimento_humano'.
9. Use emojis amigáveis de forma equilibrada (😊, 💜, 📅, ⏰). Não envie mensagens gigantes.
      `.trim();

      const tools: Tool[] = [
        {
          functionDeclarations: this.getFunctionDeclarations()
        }
      ];

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction,
        tools
      });

      const history = storage.getConversationHistory(clientPhone);
      const recentHistory = history.slice(0, -1).slice(-10);

      const chat = model.startChat({
        history: recentHistory.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }))
      });

      let response = await chat.sendMessage(userMessage);
      let functionCalls = response.response.functionCalls();

      let iterations = 0;
      while (functionCalls && functionCalls.length > 0 && iterations < 5) {
        iterations++;
        const functionCall = functionCalls[0];
        const result = await this.executeFunction(functionCall.name, functionCall.args, clientPhone, clientName);

        response = await chat.sendMessage([
          {
            functionResponse: {
              name: functionCall.name,
              response: result
            }
          }
        ]);

        functionCalls = response.response.functionCalls();
      }

      const replyText = response.response.text();
      storage.saveConversationMessage(clientPhone, 'assistant', replyText);
      return replyText;

    } catch (error: any) {
      console.error('[AI] Erro no fluxo do Gemini:', error);
      const fallback = 'Oi! Tive uma pequena oscilação para consultar a agenda neste exato instante. Poderia me confirmar para qual dia e serviço você deseja o atendimento? 😊';
      storage.saveConversationMessage(clientPhone, 'assistant', fallback);
      return fallback;
    }
  }
}

export const aiService = new AIService();
