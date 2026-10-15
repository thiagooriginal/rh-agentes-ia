import { storage } from '../db/storage.js';
import { whatsappService } from './whatsapp.js';

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  public start(intervalMs: number = 60000) {
    if (this.timer) return;
    console.log('[Scheduler] Serviço de automações em background iniciado (verificação a cada 60s)');
    
    // Executa imediatamente e depois a cada intervalo
    this.runAutomations();
    this.timer = setInterval(() => this.runAutomations(), intervalMs);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async runAutomations() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const establishment = storage.getEstablishment();
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const currentHourMin = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const appointments = storage.getAppointments({
        establishmentId: establishment.id
      });

      for (const app of appointments) {
        // --- 1. CONCLUSÃO AUTOMÁTICA ---
        if (app.status === 'CONFIRMADO' || app.status === 'EM_ATENDIMENTO') {
          if (app.date < todayStr || (app.date === todayStr && currentHourMin >= app.endTime)) {
            // Verifica se já passou a margem de segurança (ex: 30 minutos)
            if (establishment.completionMode === 'AUTO') {
              console.log(`[Scheduler] Concluindo automaticamente agendamento ${app.id} (${app.serviceName})...`);
              storage.updateAppointmentStatus(app.id, 'CONCLUIDO');
            }
          }
        }

        // --- 2. PESQUISA DE SATISFAÇÃO (Pós-Atendimento) ---
        if (app.status === 'CONCLUIDO' && !app.surveySent) {
          // Dispara mensagem de pesquisa
          console.log(`[Scheduler] Enviando pesquisa de satisfação para ${app.clientName} (${app.clientPhone})...`);
          const surveyMessage = `Oi, ${app.clientName}! 😊 Esperamos que tenha dado tudo certo no seu atendimento com a ${app.professionalName}.\n\nDe 1 a 5, qual nota você daria para o atendimento de hoje?\n⭐ 1  |  ⭐⭐ 2  |  ⭐⭐⭐ 3  |  ⭐⭐⭐⭐ 4  |  ⭐⭐⭐⭐⭐ 5\n\nSe quiser, também pode mandar um elogio, crítica ou sugestão!`;
          
          await whatsappService.sendMessageToClient(app.clientPhone, surveyMessage);
          app.surveySent = true;
          storage.updateAppointmentStatus(app.id, 'CONCLUIDO'); // Salva flag
        }

        // --- 3. LEMBRETE 24 HORAS ANTES ---
        if (app.status === 'CONFIRMADO' && !app.reminderSent24h) {
          // Se o atendimento for amanhã
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split('T')[0];

          if (app.date === tomorrowStr) {
            console.log(`[Scheduler] Enviando lembrete de 24h para ${app.clientName}...`);
            const reminderMsg = `Oi, ${app.clientName}! 😊 Passando para lembrar do seu horário de *${app.serviceName}* amanhã às *${app.startTime}* com a ${app.professionalName}.\n\n📍 ${establishment.address}\n\nSe precisar reagendar ou avisar algo, é só responder esta mensagem!`;
            await whatsappService.sendMessageToClient(app.clientPhone, reminderMsg);
            app.reminderSent24h = true;
          }
        }

        // --- 4. LEMBRETE 2 HORAS ANTES ---
        if (app.status === 'CONFIRMADO' && !app.reminderSent2h && app.date === todayStr) {
          const [appHour, appMin] = app.startTime.split(':').map(Number);
          const appDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), appHour, appMin);
          const diffMs = appDate.getTime() - now.getTime();
          const diffMinutes = Math.floor(diffMs / 60000);

          // Se faltar entre 30 e 130 minutos (em torno de 2 horas antes)
          if (diffMinutes > 0 && diffMinutes <= 130) {
            console.log(`[Scheduler] Enviando lembrete de 2h para ${app.clientName}...`);
            const reminder2hMsg = `Oi, ${app.clientName}! ⏰ Passando para lembrar que seu atendimento de *${app.serviceName}* com ${app.professionalName} é hoje às *${app.startTime}* (daqui a aprox. 2 horas)!\n\n📍 ${establishment.address}\n\nEstamos te esperando com muito carinho! ✨`;
            await whatsappService.sendMessageToClient(app.clientPhone, reminder2hMsg);
            app.reminderSent2h = true;
          }
        }
      }

      // --- 4. RECORRÊNCIA DE DESPESAS ---
      this.checkRecurringExpenses(establishment.id);

    } catch (err) {
      console.error('[Scheduler] Erro ao executar rotinas automáticas:', err);
    } finally {
      this.isRunning = false;
    }
  }

  private checkRecurringExpenses(establishmentId: string) {
    const today = new Date();
    const currentMonth = today.toISOString().substring(0, 7); // "YYYY-MM"
    const currentDay = today.getDate();

    const allExpenses = storage.getExpenses(establishmentId);
    const recurringExpenses = allExpenses.filter(e => e.isRecurring && e.recurrenceDay);

    for (const rec of recurringExpenses) {
      const targetDueDate = `${currentMonth}-${rec.recurrenceDay!.toString().padStart(2, '0')}`;
      
      // Já existe lançamento desta despesa para este mês?
      const exists = allExpenses.some(e => {
        return e.description === rec.description && e.dueDate === targetDueDate;
      });

      if (!exists && currentDay >= rec.recurrenceDay!) {
        console.log(`[Scheduler] Gerando despesa recorrente do mês: ${rec.description} (Vencimento: ${targetDueDate})`);
        storage.addExpense({
          establishmentId,
          description: rec.description,
          category: rec.category,
          supplier: rec.supplier,
          amount: rec.amount,
          dueDate: targetDueDate,
          status: 'A_VENCER',
          isRecurring: true,
          recurrenceDay: rec.recurrenceDay
        });
      }
    }
  }
}

export const schedulerService = new SchedulerService();
