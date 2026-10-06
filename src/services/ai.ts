import { GoogleGenerativeAI, SchemaType, FunctionDeclaration, Tool } from '@google/generative-ai';
import { storage } from '../db/storage.js';
import { config } from '../config.js';

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
        name: 'consultar_servicos',
        description: 'Consulta a lista de serviços oferecidos pela empresa, com descrições, duração e preços atualizados.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {}
        }
      },
      {
        name: 'consultar_horarios_disponiveis',
        description: 'Verifica horários livres para agendamento em uma data específica.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            data: {
              type: SchemaType.STRING,
              description: 'Data no formato YYYY-MM-DD (exemplo: 2026-10-08)'
            }
          },
          required: ['data']
        }
      },
      {
        name: 'agendar_horario',
        description: 'Registra e confirma um agendamento para o cliente no sistema.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            nome: {
              type: SchemaType.STRING,
              description: 'Nome completo do cliente'
            },
            data: {
              type: SchemaType.STRING,
              description: 'Data escolhida no formato YYYY-MM-DD'
            },
            horario: {
              type: SchemaType.STRING,
              description: 'Horário escolhido no formato HH:MM (ex: 10:00, 14:00)'
            },
            servico: {
              type: SchemaType.STRING,
              description: 'Nome do serviço escolhido pelo cliente'
            },
            observacoes: {
              type: SchemaType.STRING,
              description: 'Observações opcionais passadas pelo cliente'
            }
          },
          required: ['nome', 'data', 'horario', 'servico']
        }
      },
      {
        name: 'listar_meus_agendamentos',
        description: 'Consulta todos os agendamentos já realizados pelo cliente no sistema.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {}
        }
      },
      {
        name: 'cancelar_agendamento',
        description: 'Cancela um agendamento existente informando o ID do agendamento.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id_agendamento: {
              type: SchemaType.STRING,
              description: 'ID único do agendamento (ex: 7 caracteres)'
            }
          },
          required: ['id_agendamento']
        }
      }
    ];
  }

  private executeFunction(name: string, args: any, clientPhone: string): any {
    switch (name) {
      case 'consultar_servicos': {
        const services = storage.getServices();
        return {
          sucesso: true,
          servicos: services.map(s => ({
            id: s.id,
            nome: s.name,
            descricao: s.description,
            duracao: `${s.durationMinutes} minutos`,
            preco: `R$ ${s.price.toFixed(2)}`
          }))
        };
      }

      case 'consultar_horarios_disponiveis': {
        const { data } = args;
        if (!data) return { erro: 'Data não informada' };
        const slots = storage.getAvailableTimeSlots(data);
        return {
          sucesso: true,
          data,
          horarios_disponiveis: slots,
          total_livres: slots.length
        };
      }

      case 'agendar_horario': {
        const { nome, data, horario, servico, observacoes } = args;
        // Valida se horário ainda está livre
        const availableSlots = storage.getAvailableTimeSlots(data);
        if (!availableSlots.includes(horario)) {
          return {
            sucesso: false,
            mensagem: `O horário ${horario} no dia ${data} já está ocupado ou indisponível. Horários livres: ${availableSlots.join(', ')}`
          };
        }

        const app = storage.addAppointment({
          clientName: nome,
          clientPhone,
          date: data,
          time: horario,
          service: servico,
          notes: observacoes
        });

        return {
          sucesso: true,
          mensagem: 'Agendamento confirmado com sucesso!',
          agendamento: app
        };
      }

      case 'listar_meus_agendamentos': {
        const apps = storage.getAppointmentsByPhone(clientPhone);
        return {
          sucesso: true,
          agendamentos: apps.map(a => ({
            id: a.id,
            servico: a.service,
            data: a.date,
            horario: a.time,
            status: a.status
          }))
        };
      }

      case 'cancelar_agendamento': {
        const { id_agendamento } = args;
        const app = storage.getAppointmentById(id_agendamento);
        if (!app) {
          return { sucesso: false, mensagem: `Agendamento com código "${id_agendamento}" não foi encontrado.` };
        }
        storage.cancelAppointment(id_agendamento);
        return {
          sucesso: true,
          mensagem: `Agendamento ${id_agendamento} do dia ${app.date} às ${app.time} foi cancelado com sucesso.`
        };
      }

      default:
        return { erro: `Função ${name} não reconhecida` };
    }
  }

  public async processMessage(clientPhone: string, userMessage: string, clientName?: string): Promise<string> {
    const settings = storage.getSettings();

    if (!this.genAI) {
      this.initClient();
    }

    if (!this.genAI) {
      return `Olá! Sou a secretária virtual da *${settings.companyName}*. ⚠️ O sistema de inteligência artificial ainda precisa ser configurado com uma chave de API do Gemini no painel de controle (http://localhost:${config.port}).`;
    }

    try {
      // Salva mensagem recebida no histórico
      storage.saveConversationMessage(clientPhone, 'user', userMessage);

      // Contexto de data e hora atual
      const now = new Date();
      const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const dataHojeFormatada = now.toISOString().split('T')[0];
      const diaHojeNome = diasSemana[now.getDay()];
      const horaAtual = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const systemInstruction = `
Você é ${settings.secretaryName}, a secretária virtual e assistente executiva oficial da empresa "${settings.companyName}".
Sua missão é atender clientes via WhatsApp com máxima cordialidade, profissionalismo, simpatia e eficiência.

DADOS DA EMPRESA:
- Empresa: ${settings.companyName}
- Descrição dos serviços: ${settings.companyDescription}
- Horário de atendimento: ${settings.workingHours}
- Endereço físico: ${settings.address}
- Telefone do Administrador / Emergência: ${settings.adminPhone || 'Consulte a recepção'}

INFORMAÇÃO TEMPORAL ATUAL:
- Data de hoje: ${dataHojeFormatada} (${diaHojeNome})
- Horário atual: ${horaAtual}

DIRETRIZES DE ATENDIMENTO:
1. Seja sempre acolhedora, objetiva e educada no estilo do WhatsApp (pode usar emojis amigáveis de forma equilibrada 😊📅✅).
2. Use as ferramentas (functions) disponíveis sempre que o cliente:
   - Perguntar sobre serviços, valores ou procedimentos -> chame 'consultar_servicos'.
   - Quiser saber horários vagos em um dia -> chame 'consultar_horarios_disponiveis'.
   - Quiser agendar -> colete nome, data, horário e serviço desejado e chame 'agendar_horario'.
   - Quiser consultar seus agendamentos -> chame 'listar_meus_agendamentos'.
   - Quiser desmarcar ou cancelar -> chame 'cancelar_agendamento'.
3. Se o cliente solicitar falar com um humano ou se for um caso complexo/urgente, oriente-o a aguardar ou contatar o responsável pelo número: ${settings.adminPhone || 'fornecido no suporte'}.
4. Mantenha respostas curtas e fáceis de ler no celular, sem blocos enormes de texto.
      `.trim();

      const tools: Tool[] = [
        {
          functionDeclarations: this.getFunctionDeclarations()
        }
      ];

      // Utiliza o modelo gemini-2.5-flash ou gemini-1.5-flash
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction,
        tools
      });

      // Histórico recente para contexto da conversa
      const history = storage.getConversationHistory(clientPhone);
      // Pega as últimas 10 mensagens anteriores
      const recentHistory = history.slice(0, -1).slice(-10);

      const chat = model.startChat({
        history: recentHistory.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }))
      });

      let response = await chat.sendMessage(userMessage);
      let functionCalls = response.response.functionCalls();

      // Loop de execução de ferramentas (Function Calling)
      let iterations = 0;
      while (functionCalls && functionCalls.length > 0 && iterations < 5) {
        iterations++;
        const functionCall = functionCalls[0];
        const result = this.executeFunction(functionCall.name, functionCall.args, clientPhone);

        // Envia o resultado da função de volta para o Gemini
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
      console.error('[AI] Erro ao processar mensagem com Gemini:', error);
      const fallbackMsg = `Desculpe, tive uma instabilidade temporária ao consultar meu sistema. Poderia repetir ou me dizer se deseja agendar um horário?`;
      storage.saveConversationMessage(clientPhone, 'assistant', fallbackMsg);
      return fallbackMsg;
    }
  }
}

export const aiService = new AIService();
