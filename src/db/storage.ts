import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import {
  Appointment,
  Client,
  DatabaseSchema,
  Establishment,
  Expense,
  Professional,
  Revenue,
  Review,
  ServiceItem,
  User,
  WorkingDaySchedule,
  ChatMessage,
  FinancialSnapshot,
  PromotionCampaign,
  DemoLead
} from '../types.js';

const PILOT_ESTABLISHMENT_ID = 'est_pilot_01';

// Agenda padrão (segunda a sábado, 09:00 às 18:00, almoço 12:00 às 13:00)
const createSchedule = (activeDays: number[]): WorkingDaySchedule[] => {
  return [0, 1, 2, 3, 4, 5, 6].map(day => ({
    dayOfWeek: day,
    enabled: activeDays.includes(day),
    startHour: '09:00',
    endHour: '18:00',
    lunchStart: '12:00',
    lunchEnd: '13:00'
  }));
};

const defaultEstablishment: Establishment = {
  id: PILOT_ESTABLISHMENT_ID,
  name: 'Studio Bella - Gestão & Estética',
  document: '12.345.678/0001-90',
  phone: '(11) 3456-7890',
  whatsapp: '5511999998888',
  address: 'Rua das Flores, 123 - Jardins, São Paulo - SP',
  timezone: 'America/Sao_Paulo',
  workingDays: [1, 2, 3, 4, 5, 6], // Segunda a Sábado
  openTime: '09:00',
  closeTime: '19:00',
  slotIntervalMinutes: 30,
  autoCompleteMinutes: 30,
  completionMode: 'AUTO',
  satisfactionSurveyDelayMinutes: 30,
  lowRatingThreshold: 2,
  adminNotificationPhone: '',
  transferToHumanPhone: '',
  secretaryName: 'Sofia',
  aiPromptCustomization: 'Atendimento acolhedor, profissional e ágil, com foco na melhor experiência para as clientes do salão.'
};

const defaultProfessionals: Professional[] = [
  {
    id: 'prof_maria',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Maria Silva',
    nickname: 'Maria',
    specialty: 'Progressiva e Tratamentos Capilares',
    phone: '5511988880001',
    status: 'ATIVO',
    workingSchedule: createSchedule([1, 2, 3, 4, 5, 6]), // Segunda a Sábado
    blocks: [],
    financialRule: {
      type: 'PERCENTUAL',
      percentProfessional: 50,
      percentSalon: 50,
      effectiveFrom: '2026-01-01'
    },
    createdAt: new Date().toISOString()
  },
  {
    id: 'prof_joana',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Joana Santos',
    nickname: 'Joana',
    specialty: 'Corte de Cabelo e Visagismo',
    phone: '5511988880002',
    status: 'ATIVO',
    workingSchedule: createSchedule([2, 3, 4, 5, 6]), // Terça a Sábado
    blocks: [],
    financialRule: {
      type: 'ALUGUEL_FIXO',
      fixedRentMonthly: 500,
      rentDueDay: 10,
      effectiveFrom: '2026-01-01'
    },
    createdAt: new Date().toISOString()
  },
  {
    id: 'prof_priscila',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Priscila Rocha',
    nickname: 'Priscila',
    specialty: 'Manicure, Pedicure e Unhas em Gel',
    phone: '5511988880003',
    status: 'ATIVO',
    workingSchedule: createSchedule([1, 3, 5]), // Segunda, Quarta e Sexta
    blocks: [],
    financialRule: {
      type: 'PERCENTUAL',
      percentProfessional: 70,
      percentSalon: 30,
      effectiveFrom: '2026-01-01'
    },
    createdAt: new Date().toISOString()
  },
  {
    id: 'prof_renata',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Renata Lima',
    nickname: 'Renata',
    specialty: 'Bronzeamento Natural e a Jato',
    phone: '5511988880004',
    status: 'ATIVO',
    workingSchedule: createSchedule([4, 5, 6, 0]), // Quinta a Domingo
    blocks: [],
    financialRule: {
      type: 'ALUGUEL_FIXO',
      fixedRentMonthly: 800,
      rentDueDay: 10,
      effectiveFrom: '2026-01-01'
    },
    createdAt: new Date().toISOString()
  }
];

const defaultServices: ServiceItem[] = [
  {
    id: 'serv_progressiva',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Progressiva',
    category: 'Cabelo',
    price: 180,
    durationMinutes: 150, // 2h30
    description: 'Alinhamento térmico capilar de alta performance com brilho espelhado.',
    status: 'ATIVO',
    allowedProfessionalIds: ['prof_maria']
  },
  {
    id: 'serv_corte',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Corte Feminino',
    category: 'Cabelo',
    price: 60,
    durationMinutes: 60, // 1h
    description: 'Corte moderno personalizado com lavagem e finalização.',
    status: 'ATIVO',
    allowedProfessionalIds: ['prof_joana']
  },
  {
    id: 'serv_manicure',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Manicure Completa',
    category: 'Unhas',
    price: 40,
    durationMinutes: 60, // 1h
    description: 'Cutilagem e esmaltação tradicional com produtos de alta durabilidade.',
    status: 'ATIVO',
    allowedProfessionalIds: ['prof_priscila']
  },
  {
    id: 'serv_bronzeamento',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Bronzeamento',
    category: 'Estética',
    price: 100,
    durationMinutes: 90, // 1h30
    description: 'Sessão completa de bronzeamento com fitas e hidratação pós-sol.',
    status: 'ATIVO',
    allowedProfessionalIds: ['prof_renata']
  }
];

const defaultUsers: User[] = [
  {
    id: 'usr_admin',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Administradora (Proprietária)',
    email: 'admin@salao.com',
    passwordHash: bcrypt.hashSync('admin123', 8),
    role: 'ADMIN',
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_gerente',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Gerente Geral',
    email: 'gerente@salao.com',
    passwordHash: bcrypt.hashSync('gerente123', 8),
    role: 'GERENTE',
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_maria',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Maria Silva',
    email: 'maria@salao.com',
    passwordHash: bcrypt.hashSync('maria123', 8),
    role: 'PROFISSIONAL',
    professionalId: 'prof_maria',
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_priscila',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Priscila Rocha',
    email: 'priscila@salao.com',
    passwordHash: bcrypt.hashSync('priscila123', 8),
    role: 'PROFISSIONAL',
    professionalId: 'prof_priscila',
    createdAt: new Date().toISOString()
  }
];

const defaultClients: Client[] = [
  {
    id: 'cli_ana',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Ana Carolina Mendonça',
    phone: '5511991112233',
    whatsapp: '5511991112233',
    birthDate: '1995-05-12',
    totalVisits: 6,
    totalSpent: 480,
    noShowCount: 0,
    cancellationCount: 1,
    firstVisit: '2026-03-10',
    lastVisit: '2026-09-25',
    preferredProfessionalId: 'prof_priscila',
    notes: 'Prefere esmaltes tons pastéis ou nude.',
    createdAt: '2026-03-10T10:00:00Z'
  },
  {
    id: 'cli_carla',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Carla Dias',
    phone: '5511994445566',
    whatsapp: '5511994445566',
    birthDate: '1988-11-20',
    totalVisits: 4,
    totalSpent: 720,
    noShowCount: 0,
    cancellationCount: 0,
    firstVisit: '2026-04-15',
    lastVisit: '2026-09-30',
    preferredProfessionalId: 'prof_maria',
    notes: 'Faz progressiva a cada 3 meses.',
    createdAt: '2026-04-15T14:30:00Z'
  },
  {
    id: 'cli_juliana',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    name: 'Juliana Ferreira',
    phone: '5511997778899',
    whatsapp: '5511997778899',
    birthDate: '1992-08-04',
    totalVisits: 3,
    totalSpent: 180,
    noShowCount: 1,
    cancellationCount: 0,
    firstVisit: '2026-06-01',
    lastVisit: '2026-09-18',
    preferredProfessionalId: 'prof_joana',
    notes: 'Gosta de corte em camadas.',
    createdAt: '2026-06-01T09:00:00Z'
  }
];

const defaultExpenses: Expense[] = [
  {
    id: 'exp_aluguel',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    description: 'Aluguel do Imóvel Comercial',
    category: 'ALUGUEL',
    supplier: 'Imobiliária Jardins Ltda',
    amount: 4500,
    dueDate: '2026-10-10',
    status: 'A_VENCER',
    isRecurring: true,
    recurrenceDay: 10,
    createdAt: new Date().toISOString()
  },
  {
    id: 'exp_luz',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    description: 'Energia Elétrica (Enel)',
    category: 'UTILIDADES',
    supplier: 'Enel Distribuição',
    amount: 1100,
    dueDate: '2026-10-15',
    status: 'A_VENCER',
    isRecurring: true,
    recurrenceDay: 15,
    createdAt: new Date().toISOString()
  },
  {
    id: 'exp_agua',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    description: 'Água e Saneamento (Sabesp)',
    category: 'UTILIDADES',
    supplier: 'Sabesp',
    amount: 450,
    dueDate: '2026-10-18',
    status: 'A_VENCER',
    isRecurring: true,
    recurrenceDay: 18,
    createdAt: new Date().toISOString()
  },
  {
    id: 'exp_internet',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    description: 'Internet Fibra 600MB',
    category: 'UTILIDADES',
    supplier: 'Vivo Fibra',
    amount: 150,
    dueDate: '2026-10-20',
    paidDate: '2026-10-05',
    status: 'PAGA',
    isRecurring: true,
    recurrenceDay: 20,
    createdAt: new Date().toISOString()
  },
  {
    id: 'exp_produtos',
    establishmentId: PILOT_ESTABLISHMENT_ID,
    description: 'Reposição de Cosméticos e Esmaltes',
    category: 'PRODUTOS',
    supplier: 'Distribuidora Beauty Pro',
    amount: 2300,
    dueDate: '2026-10-08',
    paidDate: '2026-10-06',
    status: 'PAGA',
    isRecurring: false,
    createdAt: new Date().toISOString()
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

        // Se já contiver estabelecimentos cadastrados, mantém e garante compatibilidade
        if (parsed.establishments && parsed.establishments.length > 0) {
          const ests = parsed.establishments.map((e: any) => ({
            ...e,
            adminNotificationPhone: e.adminNotificationPhone || '',
            transferToHumanPhone: e.transferToHumanPhone || ''
          }));
          return {
            establishments: ests,
            users: parsed.users || defaultUsers,
            professionals: parsed.professionals || defaultProfessionals,
            services: parsed.services || defaultServices,
            clients: parsed.clients || defaultClients,
            appointments: parsed.appointments || [],
            reviews: parsed.reviews || [],
            expenses: parsed.expenses || defaultExpenses,
            revenues: parsed.revenues || [],
            auditLogs: parsed.auditLogs || [],
            conversations: parsed.conversations || {},
            humanInterventionFlags: parsed.humanInterventionFlags || {},
            campaigns: parsed.campaigns || [],
            demoLeads: parsed.demoLeads || [],
            globalAiPaused: parsed.globalAiPaused !== undefined ? parsed.globalAiPaused : true
          };
        }
      }
    } catch (err) {
      console.error('[Storage] Erro ao ler banco de dados existente:', err);
    }

    // Inicialização do Piloto
    const initial: DatabaseSchema = {
      establishments: [defaultEstablishment],
      users: defaultUsers,
      professionals: defaultProfessionals,
      services: defaultServices,
      clients: defaultClients,
      appointments: [],
      reviews: [],
      expenses: defaultExpenses,
      revenues: [],
      auditLogs: [],
      conversations: {},
      humanInterventionFlags: {},
      campaigns: [],
      demoLeads: [],
      globalAiPaused: true
    };

    // Cria alguns agendamentos demonstrativos
    this.seedDemoAppointmentsAndReviews(initial);
    this.saveData(initial);
    return initial;
  }

  private seedDemoAppointmentsAndReviews(schema: DatabaseSchema) {
    const today = new Date().toISOString().split('T')[0];

    // Agendamento 1: Carla com Maria (Progressiva) concluído
    const snap1: FinancialSnapshot = {
      price: 180,
      financialModel: 'PERCENTUAL',
      percentProfessional: 50,
      percentSalon: 50,
      valProfessional: 90,
      valSalon: 90
    };
    schema.appointments.push({
      id: 'AG-101',
      establishmentId: PILOT_ESTABLISHMENT_ID,
      clientId: 'cli_carla',
      clientName: 'Carla Dias',
      clientPhone: '5511994445566',
      professionalId: 'prof_maria',
      professionalName: 'Maria Silva',
      serviceId: 'serv_progressiva',
      serviceName: 'Progressiva',
      date: today,
      startTime: '09:30',
      endTime: '12:00',
      durationMinutes: 150,
      status: 'CONCLUIDO',
      priceCharged: 180,
      snapshot: snap1,
      reminderSent24h: true,
      reminderSent2h: true,
      surveySent: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    schema.revenues.push({
      id: 'REV-101',
      establishmentId: PILOT_ESTABLISHMENT_ID,
      appointmentId: 'AG-101',
      type: 'SERVICO',
      description: 'Progressiva - Carla Dias',
      professionalId: 'prof_maria',
      grossAmount: 180,
      discount: 0,
      netAmount: 180,
      paymentMethod: 'PIX',
      status: 'PAGO',
      paidAt: `${today}T12:05:00Z`,
      valProfessional: 90,
      valSalon: 90
    });
    schema.reviews.push({
      id: 'REVW-101',
      establishmentId: PILOT_ESTABLISHMENT_ID,
      appointmentId: 'AG-101',
      professionalId: 'prof_maria',
      professionalName: 'Maria Silva',
      clientId: 'cli_carla',
      clientName: 'Carla Dias',
      rating: 5,
      comment: 'Cabelo ficou perfeito, muito brilhoso e sem frizz!',
      statusAlert: 'NORMAL',
      createdAt: `${today}T12:35:00Z`
    });

    // Agendamento 2: Ana com Priscila (Manicure) concluído
    const snap2: FinancialSnapshot = {
      price: 40,
      financialModel: 'PERCENTUAL',
      percentProfessional: 70,
      percentSalon: 30,
      valProfessional: 28,
      valSalon: 12
    };
    schema.appointments.push({
      id: 'AG-102',
      establishmentId: PILOT_ESTABLISHMENT_ID,
      clientId: 'cli_ana',
      clientName: 'Ana Carolina',
      clientPhone: '5511991112233',
      professionalId: 'prof_priscila',
      professionalName: 'Priscila Rocha',
      serviceId: 'serv_manicure',
      serviceName: 'Manicure Completa',
      date: today,
      startTime: '13:00',
      endTime: '14:00',
      durationMinutes: 60,
      status: 'CONCLUIDO',
      priceCharged: 40,
      snapshot: snap2,
      reminderSent24h: true,
      reminderSent2h: true,
      surveySent: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    schema.revenues.push({
      id: 'REV-102',
      establishmentId: PILOT_ESTABLISHMENT_ID,
      appointmentId: 'AG-102',
      type: 'SERVICO',
      description: 'Manicure Completa - Ana Carolina',
      professionalId: 'prof_priscila',
      grossAmount: 40,
      discount: 0,
      netAmount: 40,
      paymentMethod: 'DEBITO',
      status: 'PAGO',
      paidAt: `${today}T14:05:00Z`,
      valProfessional: 28,
      valSalon: 12
    });
    schema.reviews.push({
      id: 'REVW-102',
      establishmentId: PILOT_ESTABLISHMENT_ID,
      appointmentId: 'AG-102',
      professionalId: 'prof_priscila',
      professionalName: 'Priscila Rocha',
      clientId: 'cli_ana',
      clientName: 'Ana Carolina',
      rating: 5,
      comment: 'A Priscila é muito caprichosa, recomendo demais!',
      statusAlert: 'NORMAL',
      createdAt: `${today}T14:35:00Z`
    });

    // Agendamento 3: Aluguel de cadeira Joana (Receita de aluguel fixo)
    schema.revenues.push({
      id: 'REV-103',
      establishmentId: PILOT_ESTABLISHMENT_ID,
      type: 'ALUGUEL_CADEIRA',
      description: 'Aluguel de Cadeira Mensal - Joana Santos',
      professionalId: 'prof_joana',
      grossAmount: 500,
      discount: 0,
      netAmount: 500,
      paymentMethod: 'PIX',
      status: 'PAGO',
      paidAt: `${today}T08:00:00Z`,
      valProfessional: 0,
      valSalon: 500
    });
  }

  private saveData(data: DatabaseSchema) {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Storage] Erro ao salvar banco de dados:', err);
    }
  }

  // --- ESTABELECIMENTO ---
  public getEstablishment(id: string = PILOT_ESTABLISHMENT_ID): Establishment {
    const est = this.db.establishments.find(e => e.id === id);
    return est || this.db.establishments[0] || defaultEstablishment;
  }

  public updateEstablishment(id: string, updates: Partial<Establishment>): Establishment {
    const idx = this.db.establishments.findIndex(e => e.id === id);
    if (idx !== -1) {
      this.db.establishments[idx] = { ...this.db.establishments[idx], ...updates };
      this.saveData(this.db);
      return this.db.establishments[idx];
    }
    return this.getEstablishment(id);
  }

  // --- USUÁRIOS & AUTH ---
  public findUserByEmail(email: string): User | undefined {
    return this.db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public getUsers(establishmentId: string = PILOT_ESTABLISHMENT_ID): Omit<User, 'passwordHash'>[] {
    return this.db.users
      .filter(u => u.establishmentId === establishmentId)
      .map(({ passwordHash, ...rest }) => rest);
  }

  public createUser(user: Omit<User, 'id' | 'createdAt'>): User {
    const newUser: User = {
      ...user,
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString()
    };
    this.db.users.push(newUser);
    this.saveData(this.db);
    return newUser;
  }

  // --- PROFISSIONAIS ---
  public getProfessionals(establishmentId: string = PILOT_ESTABLISHMENT_ID): Professional[] {
    return this.db.professionals.filter(p => p.establishmentId === establishmentId);
  }

  public getProfessionalById(id: string): Professional | undefined {
    return this.db.professionals.find(p => p.id === id);
  }

  public saveProfessional(prof: Omit<Professional, 'id' | 'createdAt'>): Professional {
    const newProf: Professional = {
      ...prof,
      id: 'prof_' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString()
    };
    this.db.professionals.push(newProf);
    this.saveData(this.db);
    return newProf;
  }

  public updateProfessional(id: string, updates: Partial<Professional>): Professional | null {
    const idx = this.db.professionals.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.db.professionals[idx] = { ...this.db.professionals[idx], ...updates };
    this.saveData(this.db);
    return this.db.professionals[idx];
  }

  public deleteProfessional(id: string): boolean {
    const initLen = this.db.professionals.length;
    this.db.professionals = this.db.professionals.filter(p => p.id !== id);
    if (this.db.professionals.length !== initLen) {
      this.saveData(this.db);
      return true;
    }
    return false;
  }

  // --- SERVIÇOS ---
  public getServices(establishmentId: string = PILOT_ESTABLISHMENT_ID): ServiceItem[] {
    return this.db.services.filter(s => s.establishmentId === establishmentId);
  }

  public getServiceById(id: string): ServiceItem | undefined {
    return this.db.services.find(s => s.id === id);
  }

  public saveService(service: Omit<ServiceItem, 'id'>): ServiceItem {
    const newService: ServiceItem = {
      ...service,
      id: 'serv_' + Math.random().toString(36).substring(2, 9)
    };
    this.db.services.push(newService);
    this.saveData(this.db);
    return newService;
  }

  public updateService(id: string, updates: Partial<ServiceItem>): ServiceItem | null {
    const idx = this.db.services.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.db.services[idx] = { ...this.db.services[idx], ...updates };
    this.saveData(this.db);
    return this.db.services[idx];
  }

  public deleteService(id: string): boolean {
    const initLen = this.db.services.length;
    this.db.services = this.db.services.filter(s => s.id !== id);
    if (this.db.services.length !== initLen) {
      this.saveData(this.db);
      return true;
    }
    return false;
  }

  // --- CLIENTES ---
  public getClients(establishmentId: string = PILOT_ESTABLISHMENT_ID): Client[] {
    return this.db.clients.filter(c => c.establishmentId === establishmentId);
  }

  public findClientByPhone(phone: string, establishmentId: string = PILOT_ESTABLISHMENT_ID): Client | undefined {
    const clean = phone.replace(/\D/g, '');
    return this.db.clients.find(
      c => c.establishmentId === establishmentId && c.phone.replace(/\D/g, '') === clean
    );
  }

  public findOrCreateClient(data: {
    establishmentId?: string;
    name: string;
    phone: string;
    whatsapp?: string;
  }): Client {
    const estId = data.establishmentId || PILOT_ESTABLISHMENT_ID;
    const cleanPhone = data.phone.replace(/\D/g, '');
    const existing = this.findClientByPhone(cleanPhone, estId);

    if (existing) {
      if (data.name && data.name !== 'Cliente' && existing.name === 'Cliente') {
        existing.name = data.name;
        this.saveData(this.db);
      }
      return existing;
    }

    const newClient: Client = {
      id: 'cli_' + Math.random().toString(36).substring(2, 9),
      establishmentId: estId,
      name: data.name || 'Cliente',
      phone: cleanPhone,
      whatsapp: data.whatsapp || cleanPhone,
      totalVisits: 0,
      totalSpent: 0,
      noShowCount: 0,
      cancellationCount: 0,
      firstVisit: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };
    this.db.clients.push(newClient);
    this.saveData(this.db);
    return newClient;
  }

  public updateClient(id: string, updates: Partial<Client>): Client | null {
    const idx = this.db.clients.findIndex(c => c.id === id);
    if (idx === -1) return null;
    this.db.clients[idx] = { ...this.db.clients[idx], ...updates };
    this.saveData(this.db);
    return this.db.clients[idx];
  }

  // --- AGENDAMENTOS ---
  public getAppointments(filters?: {
    establishmentId?: string;
    professionalId?: string;
    clientId?: string;
    date?: string;
    status?: string;
  }): Appointment[] {
    const estId = filters?.establishmentId || PILOT_ESTABLISHMENT_ID;
    return this.db.appointments
      .filter(a => {
        if (a.establishmentId !== estId) return false;
        if (filters?.professionalId && a.professionalId !== filters.professionalId) return false;
        if (filters?.clientId && a.clientId !== filters.clientId) return false;
        if (filters?.date && a.date !== filters.date) return false;
        if (filters?.status && a.status !== filters.status) return false;
        return true;
      })
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  }

  public getAppointmentById(id: string): Appointment | undefined {
    return this.db.appointments.find(a => a.id === id);
  }

  // Snapshot financeiro imutável no momento da criação/conclusão
  public calculateFinancialSnapshot(professionalId: string, servicePrice: number): FinancialSnapshot {
    const prof = this.getProfessionalById(professionalId);
    if (!prof) {
      return {
        price: servicePrice,
        financialModel: 'PERCENTUAL',
        percentProfessional: 50,
        percentSalon: 50,
        valProfessional: servicePrice * 0.5,
        valSalon: servicePrice * 0.5
      };
    }

    const rule = prof.financialRule;
    if (rule.type === 'ALUGUEL_FIXO') {
      // No aluguel fixo, o profissional recebe 100% dos serviços que atende
      return {
        price: servicePrice,
        financialModel: 'ALUGUEL_FIXO',
        valProfessional: servicePrice,
        valSalon: 0
      };
    }

    if (rule.type === 'FUNCIONARIO_FIXO') {
      return {
        price: servicePrice,
        financialModel: 'FUNCIONARIO_FIXO',
        valProfessional: 0,
        valSalon: servicePrice
      };
    }

    // Percentual
    const pProf = rule.percentProfessional ?? 50;
    const pSalon = rule.percentSalon ?? (100 - pProf);
    const valProf = (servicePrice * pProf) / 100;
    const valSal = servicePrice - valProf;

    return {
      price: servicePrice,
      financialModel: 'PERCENTUAL',
      percentProfessional: pProf,
      percentSalon: pSalon,
      valProfessional: Math.round(valProf * 100) / 100,
      valSalon: Math.round(valSal * 100) / 100
    };
  }

  // Criação atômica com validação de conflito
  public createAppointment(data: {
    establishmentId?: string;
    clientId: string;
    clientName: string;
    clientPhone: string;
    professionalId: string;
    serviceId: string;
    date: string; // YYYY-MM-DD
    startTime: string; // HH:MM
    notes?: string;
  }): { success: boolean; appointment?: Appointment; message?: string } {
    const estId = data.establishmentId || PILOT_ESTABLISHMENT_ID;
    const prof = this.getProfessionalById(data.professionalId);
    const serv = this.getServiceById(data.serviceId);

    if (!prof) return { success: false, message: 'Profissional não encontrado' };
    if (!serv) return { success: false, message: 'Serviço não encontrado' };

    // Calcula horário fim
    const [startH, startM] = data.startTime.split(':').map(Number);
    const endTotalMinutes = startH * 60 + startM + serv.durationMinutes;
    const endH = Math.floor(endTotalMinutes / 60).toString().padStart(2, '0');
    const endM = (endTotalMinutes % 60).toString().padStart(2, '0');
    const endTime = `${endH}:${endM}`;

    // Verificação rigorosa de conflito com agendamentos ativos
    const hasConflict = this.db.appointments.some(app => {
      if (app.establishmentId !== estId) return false;
      if (app.professionalId !== data.professionalId) return false;
      if (app.date !== data.date) return false;
      if (app.status === 'CANCELADO' || app.status === 'NAO_COMPARECEU') return false;

      // Intervalos colidem se (startA < endB) && (endA > startB)
      return data.startTime < app.endTime && endTime > app.startTime;
    });

    if (hasConflict) {
      return {
        success: false,
        message: `O horário das ${data.startTime} às ${endTime} no dia ${data.date} já está ocupado para ${prof.name}.`
      };
    }

    const snapshot = this.calculateFinancialSnapshot(data.professionalId, serv.price);

    const newApp: Appointment = {
      id: 'AG-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      establishmentId: estId,
      clientId: data.clientId,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      professionalId: prof.id,
      professionalName: prof.name,
      serviceId: serv.id,
      serviceName: serv.name,
      date: data.date,
      startTime: data.startTime,
      endTime,
      durationMinutes: serv.durationMinutes,
      status: 'CONFIRMADO',
      notes: data.notes || '',
      priceCharged: serv.price,
      snapshot,
      reminderSent24h: false,
      reminderSent2h: false,
      surveySent: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.db.appointments.push(newApp);

    // Atualiza estatísticas do cliente
    const client = this.db.clients.find(c => c.id === data.clientId);
    if (client) {
      client.preferredProfessionalId = prof.id;
    }

    this.saveData(this.db);
    return { success: true, appointment: newApp };
  }

  public updateAppointmentStatus(
    id: string,
    status: Appointment['status'] | string,
    opts?: { cancellationReason?: string; cancelledBy?: string }
  ): boolean {
    const app = this.db.appointments.find(a => a.id === id);
    if (!app) return false;

    app.status = status as any;
    app.updatedAt = new Date().toISOString();

    if (status === 'CANCELADO') {
      app.cancelledAt = new Date().toISOString();
      app.cancellationReason = opts?.cancellationReason || 'Cancelado pelo cliente';
      app.cancelledBy = opts?.cancelledBy || 'CLIENTE';

      const client = this.db.clients.find(c => c.id === app.clientId);
      if (client) client.cancellationCount = (client.cancellationCount || 0) + 1;
    }

    if (status === 'NAO_COMPARECEU') {
      const client = this.db.clients.find(c => c.id === app.clientId);
      if (client) client.noShowCount = (client.noShowCount || 0) + 1;
    }

    if (status === 'CONCLUIDO') {
      // Gera receita automaticamente se ainda não existir
      const existingRev = this.db.revenues.find(r => r.appointmentId === app.id);
      if (!existingRev) {
        this.db.revenues.push({
          id: 'REV-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          establishmentId: app.establishmentId,
          appointmentId: app.id,
          type: 'SERVICO',
          description: `${app.serviceName} - ${app.clientName}`,
          professionalId: app.professionalId,
          grossAmount: app.snapshot.price,
          discount: 0,
          netAmount: app.snapshot.price,
          paymentMethod: 'PIX',
          status: 'PAGO',
          paidAt: new Date().toISOString(),
          valProfessional: app.snapshot.valProfessional,
          valSalon: app.snapshot.valSalon
        });
      }

      // Atualiza cliente
      const client = this.db.clients.find(c => c.id === app.clientId);
      if (client) {
        client.totalVisits = (client.totalVisits || 0) + 1;
        client.totalSpent = (client.totalSpent || 0) + app.priceCharged;
        client.lastVisit = app.date;
      }
    }

    this.saveData(this.db);
    return true;
  }

  // --- REAGENDAMENTO ATÔMICO ---
  public rescheduleAppointment(
    id: string,
    newDate: string,
    newStartTime: string
  ): { success: boolean; appointment?: Appointment; message?: string } {
    const app = this.db.appointments.find(a => a.id === id);
    if (!app) return { success: false, message: 'Agendamento não encontrado' };

    // Calcula novo endTime
    const [startH, startM] = newStartTime.split(':').map(Number);
    const endTotalMinutes = startH * 60 + startM + app.durationMinutes;
    const endH = Math.floor(endTotalMinutes / 60).toString().padStart(2, '0');
    const endM = (endTotalMinutes % 60).toString().padStart(2, '0');
    const newEndTime = `${endH}:${endM}`;

    // Verifica conflito excluindo o próprio agendamento atual
    const hasConflict = this.db.appointments.some(other => {
      if (other.id === app.id) return false;
      if (other.establishmentId !== app.establishmentId) return false;
      if (other.professionalId !== app.professionalId) return false;
      if (other.date !== newDate) return false;
      if (other.status === 'CANCELADO' || other.status === 'NAO_COMPARECEU') return false;

      return newStartTime < other.endTime && newEndTime > other.startTime;
    });

    if (hasConflict) {
      return {
        success: false,
        message: `O horário ${newStartTime} no dia ${newDate} já está ocupado.`
      };
    }

    // Registra alteração
    app.date = newDate;
    app.startTime = newStartTime;
    app.endTime = newEndTime;
    app.status = 'CONFIRMADO';
    app.updatedAt = new Date().toISOString();

    this.saveData(this.db);
    return { success: true, appointment: app };
  }

  // --- MOTOR DE CÁLCULO DE SLOTS LIVRES ---
  public getAvailableSlots(professionalId: string, durationMinutes: number, dateString: string): string[] {
    const prof = this.getProfessionalById(professionalId);
    if (!prof || prof.status !== 'ATIVO') return [];

    const date = new Date(dateString + 'T00:00:00');
    const dayOfWeek = date.getDay(); // 0 a 6

    const schedule = prof.workingSchedule.find(s => s.dayOfWeek === dayOfWeek);
    if (!schedule || !schedule.enabled) return []; // Profissional não atende neste dia da semana

    // Checa bloqueios especiais (férias, folgas, atestados)
    const isBlocked = prof.blocks.some(b => {
      return dateString >= b.startDate && dateString <= b.endDate;
    });
    if (isBlocked) return [];

    // Converte horários para minutos a partir da meia-noite
    const parseMins = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const formatMins = (mins: number) => {
      const h = Math.floor(mins / 60).toString().padStart(2, '0');
      const m = (mins % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    };

    const workStart = parseMins(schedule.startHour);
    const workEnd = parseMins(schedule.endHour);
    const lunchStart = schedule.lunchStart ? parseMins(schedule.lunchStart) : null;
    const lunchEnd = schedule.lunchEnd ? parseMins(schedule.lunchEnd) : null;

    // Busca agendamentos ocupados no dia
    const bookedRanges = this.db.appointments
      .filter(a => {
        return (
          a.professionalId === prof.id &&
          a.date === dateString &&
          a.status !== 'CANCELADO' &&
          a.status !== 'NAO_COMPARECEU'
        );
      })
      .map(a => ({
        start: parseMins(a.startTime),
        end: parseMins(a.endTime)
      }));

    // Intervalo de passo (ex: 30 minutos)
    const step = 30;
    const availableSlots: string[] = [];

    for (let current = workStart; current + durationMinutes <= workEnd; current += step) {
      const slotEnd = current + durationMinutes;

      // Colide com almoço?
      if (lunchStart !== null && lunchEnd !== null) {
        if (current < lunchEnd && slotEnd > lunchStart) {
          continue;
        }
      }

      // Colide com agendamentos existentes?
      const collision = bookedRanges.some(booked => {
        return current < booked.end && slotEnd > booked.start;
      });

      if (!collision) {
        availableSlots.push(formatMins(current));
      }
    }

    return availableSlots;
  }

  // --- AVALIAÇÕES & SATISFAÇÃO ---
  public getReviews(establishmentId: string = PILOT_ESTABLISHMENT_ID, professionalId?: string): Review[] {
    return this.db.reviews.filter(r => {
      if (r.establishmentId !== establishmentId) return false;
      if (professionalId && r.professionalId !== professionalId) return false;
      return true;
    });
  }

  public addReview(data: {
    establishmentId?: string;
    appointmentId: string;
    rating: number;
    comment: string;
  }): Review {
    const estId = data.establishmentId || PILOT_ESTABLISHMENT_ID;
    const app = this.getAppointmentById(data.appointmentId);
    const est = this.getEstablishment(estId);

    const isLowRating = data.rating <= (est.lowRatingThreshold || 2);

    const newReview: Review = {
      id: 'REVW-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      establishmentId: estId,
      appointmentId: data.appointmentId,
      professionalId: app ? app.professionalId : 'desconhecido',
      professionalName: app ? app.professionalName : 'Profissional',
      clientId: app ? app.clientId : 'desconhecido',
      clientName: app ? app.clientName : 'Cliente',
      rating: data.rating,
      comment: data.comment,
      statusAlert: isLowRating ? 'ALERTA_BAIXA_NOTA' : 'NORMAL',
      createdAt: new Date().toISOString()
    };

    this.db.reviews.unshift(newReview);
    this.saveData(this.db);
    return newReview;
  }

  // --- DESPESAS ---
  public getExpenses(establishmentId: string = PILOT_ESTABLISHMENT_ID): Expense[] {
    return this.db.expenses
      .filter(e => e.establishmentId === establishmentId)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  public addExpense(expense: Omit<Expense, 'id' | 'createdAt'>): Expense {
    const newExp: Expense = {
      ...expense,
      id: 'EXP-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      createdAt: new Date().toISOString()
    };
    this.db.expenses.push(newExp);
    this.saveData(this.db);
    return newExp;
  }

  public updateExpense(id: string, updates: Partial<Expense>): Expense | null {
    const idx = this.db.expenses.findIndex(e => e.id === id);
    if (idx === -1) return null;
    this.db.expenses[idx] = { ...this.db.expenses[idx], ...updates };
    this.saveData(this.db);
    return this.db.expenses[idx];
  }

  public deleteExpense(id: string): boolean {
    const initLen = this.db.expenses.length;
    this.db.expenses = this.db.expenses.filter(e => e.id !== id);
    if (this.db.expenses.length !== initLen) {
      this.saveData(this.db);
      return true;
    }
    return false;
  }

  // --- RECEITAS & FINANCEIRO ---
  public getRevenues(establishmentId: string = PILOT_ESTABLISHMENT_ID): Revenue[] {
    return this.db.revenues
      .filter(r => r.establishmentId === establishmentId)
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  }

  public addRevenue(rev: Omit<Revenue, 'id'>): Revenue {
    const newRev: Revenue = {
      ...rev,
      id: 'REV-' + Math.random().toString(36).substring(2, 8).toUpperCase()
    };
    this.db.revenues.push(newRev);
    this.saveData(this.db);
    return newRev;
  }

  // --- DRE GERENCIAL SIMPLIFICADA ---
  public calculateDRE(establishmentId: string = PILOT_ESTABLISHMENT_ID, monthYear?: string) {
    // monthYear formato "YYYY-MM"
    const currentMonth = monthYear || new Date().toISOString().substring(0, 7);

    const monthRevenues = this.db.revenues.filter(r => {
      return r.establishmentId === establishmentId && r.paidAt.startsWith(currentMonth);
    });

    const monthExpenses = this.db.expenses.filter(e => {
      const matchDate = e.paidDate || e.dueDate;
      return e.establishmentId === establishmentId && matchDate.startsWith(currentMonth);
    });

    const totalServiceRevenue = monthRevenues
      .filter(r => r.type === 'SERVICO')
      .reduce((acc, r) => acc + r.grossAmount, 0);

    const totalRentChairRevenue = monthRevenues
      .filter(r => r.type === 'ALUGUEL_CADEIRA')
      .reduce((acc, r) => acc + r.grossAmount, 0);

    const totalProductRevenue = monthRevenues
      .filter(r => r.type === 'PRODUTO')
      .reduce((acc, r) => acc + r.grossAmount, 0);

    const totalProfessionalPayout = monthRevenues.reduce((acc, r) => acc + r.valProfessional, 0);

    const totalExpenses = monthExpenses.reduce((acc, e) => acc + e.amount, 0);

    const expensesByCategory: Record<string, number> = {};
    monthExpenses.forEach(e => {
      expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + e.amount;
    });

    const totalSalonRevenue = monthRevenues.reduce((acc, r) => acc + r.valSalon, 0);
    const estimatedNetResult = totalSalonRevenue - totalExpenses;

    return {
      period: currentMonth,
      totalGrossRevenue: totalServiceRevenue + totalRentChairRevenue + totalProductRevenue,
      totalServiceRevenue,
      totalRentChairRevenue,
      totalProductRevenue,
      totalProfessionalPayout,
      totalSalonGrossMargin: totalSalonRevenue,
      totalExpenses,
      expensesByCategory,
      estimatedNetResult
    };
  }

  // --- HISTÓRICO DE CONVERSAS & INTERVENÇÃO HUMANA ---
  public isHumanInterventionActive(phone: string): boolean {
    const clean = phone.replace(/\D/g, '');
    return !!this.db.humanInterventionFlags[clean];
  }

  public setHumanIntervention(phone: string, active: boolean) {
    const clean = phone.replace(/\D/g, '');
    this.db.humanInterventionFlags[clean] = active;
    this.saveData(this.db);
  }

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
    if (this.db.conversations[clean].length > 40) {
      this.db.conversations[clean] = this.db.conversations[clean].slice(-40);
    }
    this.saveData(this.db);
  }

  // --- CAMPANHAS DE PROMOÇÃO RELÂMPAGO ---
  public getCampaigns(establishmentId: string = PILOT_ESTABLISHMENT_ID): PromotionCampaign[] {
    return (this.db.campaigns || []).filter(c => c.establishmentId === establishmentId);
  }

  public getCampaignById(id: string): PromotionCampaign | undefined {
    return (this.db.campaigns || []).find(c => c.id === id);
  }

  public createCampaign(campaign: Omit<PromotionCampaign, 'id' | 'createdAt' | 'sentCount' | 'failedCount'>): PromotionCampaign {
    if (!this.db.campaigns) this.db.campaigns = [];
    const newCamp: PromotionCampaign = {
      ...campaign,
      id: 'camp_' + Math.random().toString(36).substring(2, 9),
      sentCount: 0,
      failedCount: 0,
      createdAt: new Date().toISOString()
    };
    this.db.campaigns.push(newCamp);
    this.saveData(this.db);
    return newCamp;
  }

  public updateCampaign(id: string, updates: Partial<PromotionCampaign>): PromotionCampaign | null {
    if (!this.db.campaigns) this.db.campaigns = [];
    const idx = this.db.campaigns.findIndex(c => c.id === id);
    if (idx === -1) return null;
    this.db.campaigns[idx] = { ...this.db.campaigns[idx], ...updates };
    this.saveData(this.db);
    return this.db.campaigns[idx];
  }

  // --- DEMO LEADS & VITRINE MULTI-PERSONAS ---
  public getDemoLeads(): DemoLead[] {
    return this.db.demoLeads || [];
  }

  public getDemoLeadById(id: string): DemoLead | undefined {
    return (this.db.demoLeads || []).find(l => l.id === id);
  }

  public saveDemoLead(lead: DemoLead): DemoLead {
    if (!this.db.demoLeads) this.db.demoLeads = [];
    const cleanPhone = lead.phone.replace(/\D/g, '');
    
    // Remove sessões ativas anteriores para o mesmo telefone para que o novo nicho assuma
    this.db.demoLeads = this.db.demoLeads.filter(l => {
      const p = l.phone.replace(/\D/g, '');
      const isSame = p === cleanPhone || (p.slice(-8) === cleanPhone.slice(-8) && p.length >= 8);
      return !isSame;
    });

    this.db.demoLeads.push(lead);
    this.saveData(this.db);
    return lead;
  }

  public updateDemoLead(id: string, updates: Partial<DemoLead>): DemoLead | null {
    if (!this.db.demoLeads) this.db.demoLeads = [];
    const idx = this.db.demoLeads.findIndex(l => l.id === id);
    if (idx === -1) return null;
    this.db.demoLeads[idx] = { ...this.db.demoLeads[idx], ...updates };
    this.saveData(this.db);
    return this.db.demoLeads[idx];
  }

  public getActiveDemoLeadByPhone(phone: string): DemoLead | undefined {
    if (!this.db.demoLeads || this.db.demoLeads.length === 0) return undefined;
    const clean = phone.replace(/\D/g, '');
    const now = new Date().toISOString();

    return this.db.demoLeads.find(l => {
      if (l.status !== 'ACTIVE') return false;
      if (l.expiresAt && l.expiresAt < now) return false;

      const p = l.phone.replace(/\D/g, '');
      if (p === clean) return true;
      const s1 = p.slice(-8);
      const s2 = clean.slice(-8);
      return s1.length >= 8 && s1 === s2;
    });
  }

  // --- CONTROLE DE PAUSA DA IA (GLOBAL, SALÃO E PORTAL) ---
  public isGlobalAiPaused(): boolean {
    return this.db.globalAiPaused === true;
  }

  public setGlobalAiPaused(paused: boolean): void {
    this.db.globalAiPaused = paused;
    this.saveData(this.db);
    console.log(`[Storage] 🛑 Pausa Global da IA atualizada para: ${paused ? 'PAUSADA ⏸️' : 'ATIVA ▶️'}`);
  }

  public isSalonAiPaused(): boolean {
    if (this.db.globalAiPaused === true) return true;
    return this.db.salonAiPaused === true;
  }

  public setSalonAiPaused(paused: boolean): void {
    this.db.salonAiPaused = paused;
    this.saveData(this.db);
    console.log(`[Storage] 🛑 Pausa da IA do Salão atualizada para: ${paused ? 'PAUSADA ⏸️' : 'ATIVA ▶️'}`);
  }

  public isPortalAiPaused(): boolean {
    if (this.db.globalAiPaused === true) return true;
    return this.db.portalAiPaused === true;
  }

  public setPortalAiPaused(paused: boolean): void {
    this.db.portalAiPaused = paused;
    this.saveData(this.db);
    console.log(`[Storage] 🛑 Pausa da IA do Portal atualizada para: ${paused ? 'PAUSADA ⏸️' : 'ATIVA ▶️'}`);
  }
}

export const storage = new StorageManager();

