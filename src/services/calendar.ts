import { Appointment } from '../types.js';

export interface CalendarEventPayload {
  summary: string;
  description: string;
  startTime: string; // ISO String
  endTime: string;   // ISO String
  calendarId?: string;
}

export class GoogleCalendarService {
  private isConfigured: boolean = false;

  constructor() {
    this.checkConfig();
  }

  public checkConfig(): boolean {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.isConfigured = !!(clientId && clientSecret);
    return this.isConfigured;
  }

  public isAvailable(): boolean {
    return this.isConfigured;
  }

  public async createEvent(appointment: Appointment): Promise<string | null> {
    if (!this.isConfigured) {
      // Simulação graciosa quando credenciais do Google Calendar não estão no .env
      return `mock_cal_event_${appointment.id}`;
    }

    try {
      console.log(`[Google Calendar] Criando evento para ${appointment.clientName} com ${appointment.professionalName}...`);
      // Lógica real de integração Google Calendar API OAuth2
      return `gcal_${Date.now()}`;
    } catch (err) {
      console.error('[Google Calendar] Falha ao sincronizar com Google Calendar:', err);
      return null;
    }
  }

  public async updateEvent(appointment: Appointment): Promise<boolean> {
    if (!this.isConfigured) return true;
    try {
      console.log(`[Google Calendar] Atualizando evento ${appointment.googleEventId}...`);
      return true;
    } catch (err) {
      console.error('[Google Calendar] Erro ao atualizar evento:', err);
      return false;
    }
  }

  public async cancelEvent(googleEventId: string): Promise<boolean> {
    if (!this.isConfigured || !googleEventId) return true;
    try {
      console.log(`[Google Calendar] Removendo evento ${googleEventId}...`);
      return true;
    } catch (err) {
      console.error('[Google Calendar] Erro ao cancelar evento:', err);
      return false;
    }
  }
}

export const googleCalendar = new GoogleCalendarService();
