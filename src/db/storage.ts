import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { Appointment, CompanySettings, DatabaseSchema, ServiceItem, ChatMessage } from '../types.js';

const defaultSettings: CompanySettings = {
  companyName: config.companyName,
  secretaryName: config.secretaryName,
  companyDescription: config.companyDescription,
  workingHours: config.workingHours,
  address: config.address,
  adminPhone: config.adminPhone,
  welcomeMessage: `Olá! Sou a ${config.secretaryName}, assistente virtual da ${config.companyName}. Como posso te ajudar hoje? Posso tirar dúvidas sobre nossos serviços e agendar o seu horário!`
};

const defaultServices: ServiceItem[] = [
  {
    id: '1',
    name: 'Consulta Inicial / Diagnóstico',
    description: 'Avaliação inicial para entender necessidades e planejar próximos passos.',
    durationMinutes: 45,
    price: 150
  },
  {
    id: '2',
    name: 'Atendimento Completo',
    description: 'Sessão completa de consultoria e acompanhamento detalhado.',
    durationMinutes: 60,
    price: 250
  },
  {
    id: '3',
    name: 'Retorno / Alinhamento Rápido',
    description: 'Reunião rápida de alinhamento e checagem de progresso.',
    durationMinutes: 30,
    price: 90
  }
];

class StorageManager {
  private db: DatabaseSchema;
  private filePath: string;

  constructor() {
    this.filePath = config.dataPath;
    this.db = this.loadData();
  }

  private loadData(): DatabaseSchema {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          appointments: parsed.appointments || [],
          services: parsed.services || defaultServices,
          settings: { ...defaultSettings, ...parsed.settings },
          conversations: parsed.conversations || {}
        };
      }
    } catch (err) {
      console.error('[Storage] Erro ao carregar banco de dados, usando padrões:', err);
    }

    const initial: DatabaseSchema = {
      appointments: [],
      services: defaultServices,
      settings: defaultSettings,
      conversations: {}
    };
    this.saveData(initial);
    return initial;
  }

  private saveData(data: DatabaseSchema) {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Storage] Erro ao salvar arquivo JSON:', err);
    }
  }

  // Configurações
  public getSettings(): CompanySettings {
    return { ...this.db.settings };
  }

  public updateSettings(partial: Partial<CompanySettings>): CompanySettings {
    this.db.settings = { ...this.db.settings, ...partial };
    this.saveData(this.db);
    return this.db.settings;
  }

  // Serviços
  public getServices(): ServiceItem[] {
    return [...this.db.services];
  }

  public addService(service: Omit<ServiceItem, 'id'>): ServiceItem {
    const newService: ServiceItem = {
      ...service,
      id: Date.now().toString()
    };
    this.db.services.push(newService);
    this.saveData(this.db);
    return newService;
  }

  public updateService(id: string, updates: Partial<Omit<ServiceItem, 'id'>>): ServiceItem | null {
    const index = this.db.services.findIndex(s => s.id === id);
    if (index === -1) return null;
    this.db.services[index] = { ...this.db.services[index], ...updates };
    this.saveData(this.db);
    return this.db.services[index];
  }

  public deleteService(id: string): boolean {
    const initialLen = this.db.services.length;
    this.db.services = this.db.services.filter(s => s.id !== id);
    if (this.db.services.length !== initialLen) {
      this.saveData(this.db);
      return true;
    }
    return false;
  }

  // Agendamentos
  public getAppointments(dateFilter?: string): Appointment[] {
    if (dateFilter) {
      return this.db.appointments.filter(a => a.date === dateFilter);
    }
    return [...this.db.appointments].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }

  public getAppointmentById(id: string): Appointment | undefined {
    return this.db.appointments.find(a => a.id === id);
  }

  public getAppointmentsByPhone(phone: string): Appointment[] {
    const clean = phone.replace(/\D/g, '');
    return this.db.appointments.filter(a => a.clientPhone.replace(/\D/g, '') === clean);
  }

  public addAppointment(data: {
    clientName: string;
    clientPhone: string;
    date: string;
    time: string;
    service: string;
    notes?: string;
  }): Appointment {
    const newAppointment: Appointment = {
      id: Math.random().toString(36).substring(2, 9).toUpperCase(),
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      date: data.date,
      time: data.time,
      service: data.service,
      status: 'confirmed',
      notes: data.notes || '',
      createdAt: new Date().toISOString()
    };
    this.db.appointments.push(newAppointment);
    this.saveData(this.db);
    return newAppointment;
  }

  public updateAppointmentStatus(id: string, status: 'confirmed' | 'cancelled' | 'completed'): boolean {
    const app = this.db.appointments.find(a => a.id === id);
    if (app) {
      app.status = status;
      this.saveData(this.db);
      return true;
    }
    return false;
  }

  public cancelAppointment(id: string): boolean {
    return this.updateAppointmentStatus(id, 'cancelled');
  }

  // Cálculo de horários disponíveis
  public getAvailableTimeSlots(dateString: string): string[] {
    // Horários padrão de atendimento em intervalos de 1 hora das 08:00 às 17:00
    const standardSlots = [
      '08:00', '09:00', '10:00', '11:00', 
      '13:00', '14:00', '15:00', '16:00', '17:00'
    ];

    const bookedTimes = this.db.appointments
      .filter(a => a.date === dateString && a.status === 'confirmed')
      .map(a => a.time);

    return standardSlots.filter(slot => !bookedTimes.includes(slot));
  }

  // Conversas / Mensagens
  public getConversationHistory(phone: string): ChatMessage[] {
    const clean = phone.replace(/\D/g, '');
    return this.db.conversations[clean] || [];
  }

  public saveConversationMessage(phone: string, sender: 'user' | 'assistant', content: string) {
    const clean = phone.replace(/\D/g, '');
    if (!this.db.conversations[clean]) {
      this.db.conversations[clean] = [];
    }
    this.db.conversations[clean].push({
      sender,
      content,
      timestamp: new Date().toISOString()
    });

    // Mantém as últimas 40 mensagens por cliente para economizar memória
    if (this.db.conversations[clean].length > 40) {
      this.db.conversations[clean] = this.db.conversations[clean].slice(-40);
    }

    this.saveData(this.db);
  }
}

export const storage = new StorageManager();
