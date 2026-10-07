import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { Appointment } from '../types.js';

export interface CalendarEventPayload {
  summary: string;
  description: string;
  startTime: string; // ISO String
  endTime: string;   // ISO String
  calendarId?: string;
}

export class GoogleCalendarService {
  private calendar: any = null;
  private calendarId: string = 'secretariainteligente1@gmail.com';
  private isConfigured: boolean = false;

  constructor() {
    this.init();
  }

  public init(): boolean {
    try {
      this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'secretariainteligente1@gmail.com';

      // 1. Verifica se existe arquivo de Service Account (google_credentials.json)
      const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || path.resolve(process.cwd(), 'google_credentials.json');
      if (fs.existsSync(serviceAccountPath)) {
        const auth = new google.auth.GoogleAuth({
          keyFile: serviceAccountPath,
          scopes: ['https://www.googleapis.com/auth/calendar']
        });
        this.calendar = google.calendar({ version: 'v3', auth });
        this.isConfigured = true;
        console.log(`[Google Calendar] ✅ Conectado com sucesso via Service Account! Agenda: ${this.calendarId}`);
        return true;
      }

      // 2. Alternativamente, verifica OAuth2 via variáveis de ambiente
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

      if (clientId && clientSecret && refreshToken) {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        this.isConfigured = true;
        console.log(`[Google Calendar] ✅ Conectado com sucesso via OAuth2! Agenda: ${this.calendarId}`);
        return true;
      }

      this.isConfigured = false;
      return false;
    } catch (err) {
      console.error('[Google Calendar] Erro ao inicializar integração:', err);
      this.isConfigured = false;
      return false;
    }
  }

  public isAvailable(): boolean {
    return this.isConfigured;
  }

  public async createEvent(appointment: Appointment): Promise<string | null> {
    if (!this.isConfigured || !this.calendar) {
      return `local_${appointment.id}`;
    }

    try {
      const startDateTime = `${appointment.date}T${appointment.startTime}:00-03:00`;
      const [hours, minutes] = appointment.startTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + appointment.durationMinutes;
      const endHours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
      const endMins = String(totalMinutes % 60).padStart(2, '0');
      const endDateTime = `${appointment.date}T${endHours}:${endMins}:00-03:00`;

      const response = await this.calendar.events.insert({
        calendarId: this.calendarId,
        requestBody: {
          summary: `${appointment.serviceName} - ${appointment.clientName}`,
          description: `Agendamento via Secretária Virtual Sofia 💜\n\n` +
            `Cliente: ${appointment.clientName} (${appointment.clientPhone})\n` +
            `Profissional: ${appointment.professionalName}\n` +
            `Serviço: ${appointment.serviceName}\n` +
            `Valor: R$ ${appointment.priceCharged.toFixed(2)}\n` +
            (appointment.notes ? `Observações: ${appointment.notes}\n` : ''),
          start: {
            dateTime: startDateTime,
            timeZone: 'America/Sao_Paulo'
          },
          end: {
            dateTime: endDateTime,
            timeZone: 'America/Sao_Paulo'
          }
        }
      });

      console.log(`[Google Calendar] ✅ Evento criado na agenda ${this.calendarId}! ID: ${response.data.id}`);
      return response.data.id || null;
    } catch (err) {
      console.error('[Google Calendar] Falha ao criar evento no Google Calendar:', err);
      return null;
    }
  }

  public async updateEvent(appointment: Appointment): Promise<boolean> {
    if (!this.isConfigured || !this.calendar || !appointment.googleEventId || appointment.googleEventId.startsWith('local_')) {
      return true;
    }

    try {
      const startDateTime = `${appointment.date}T${appointment.startTime}:00-03:00`;
      const [hours, minutes] = appointment.startTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + appointment.durationMinutes;
      const endHours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
      const endMins = String(totalMinutes % 60).padStart(2, '0');
      const endDateTime = `${appointment.date}T${endHours}:${endMins}:00-03:00`;

      await this.calendar.events.patch({
        calendarId: this.calendarId,
        eventId: appointment.googleEventId,
        requestBody: {
          start: { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' },
          end: { dateTime: endDateTime, timeZone: 'America/Sao_Paulo' }
        }
      });

      console.log(`[Google Calendar] ✅ Evento atualizado no Google Calendar: ${appointment.googleEventId}`);
      return true;
    } catch (err) {
      console.error('[Google Calendar] Erro ao atualizar evento:', err);
      return false;
    }
  }

  public async cancelEvent(googleEventId: string): Promise<boolean> {
    if (!this.isConfigured || !this.calendar || !googleEventId || googleEventId.startsWith('local_')) {
      return true;
    }

    try {
      await this.calendar.events.delete({
        calendarId: this.calendarId,
        eventId: googleEventId
      });
      console.log(`[Google Calendar] ✅ Evento ${googleEventId} cancelado no Google Calendar.`);
      return true;
    } catch (err) {
      console.error('[Google Calendar] Erro ao cancelar evento no Google Calendar:', err);
      return false;
    }
  }
}

export const googleCalendar = new GoogleCalendarService();
