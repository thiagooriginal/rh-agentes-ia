export type UserRole = 'ADMIN' | 'GERENTE' | 'PROFISSIONAL';

export interface WorkingDaySchedule {
  dayOfWeek: number; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  enabled: boolean;
  startHour: string; // "09:00"
  endHour: string;   // "18:00"
  lunchStart?: string; // "12:00"
  lunchEnd?: string;   // "13:00"
}

export interface ScheduleBlock {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  reason: string;    // "Férias", "Consulta médica", "Folga"
}

export type FinancialModelType = 'PERCENTUAL' | 'ALUGUEL_FIXO' | 'FUNCIONARIO_FIXO';

export interface FinancialRule {
  type: FinancialModelType;
  percentProfessional?: number; // Ex: 60 (para 60%)
  percentSalon?: number;        // Ex: 40 (para 40%)
  fixedRentMonthly?: number;    // Ex: 500 (R$ 500/mês)
  rentDueDay?: number;          // Ex: 10 (todo dia 10)
  effectiveFrom: string;        // YYYY-MM-DD
  effectiveUntil?: string;      // YYYY-MM-DD
}

export interface Establishment {
  id: string;
  name: string;
  document: string; // CNPJ / CPF
  phone: string;
  whatsapp: string;
  address: string;
  timezone: string; // "America/Sao_Paulo"
  logoUrl?: string;
  workingDays: number[]; // [1, 2, 3, 4, 5, 6]
  openTime: string;      // "08:00"
  closeTime: string;     // "19:00"
  slotIntervalMinutes: number; // 30
  autoCompleteMinutes: number; // 30
  completionMode: 'AUTO' | 'MANUAL' | 'AUTO_WITH_REVIEW';
  satisfactionSurveyDelayMinutes: number; // 30
  lowRatingThreshold: number; // 2
  adminNotificationPhone: string;
  transferToHumanPhone: string;
  secretaryName: string;
  aiPromptCustomization?: string;
}

export interface User {
  id: string;
  establishmentId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  professionalId?: string; // Se for role 'PROFISSIONAL'
  createdAt: string;
}

export interface Professional {
  id: string;
  establishmentId: string;
  name: string;
  nickname: string;
  specialty: string;
  phone: string;
  photoUrl?: string;
  status: 'ATIVO' | 'INATIVO';
  googleCalendarId?: string;
  workingSchedule: WorkingDaySchedule[];
  blocks: ScheduleBlock[];
  financialRule: FinancialRule;
  createdAt: string;
}

export interface ServiceItem {
  id: string;
  establishmentId: string;
  name: string;
  category: string;
  price: number;
  durationMinutes: number;
  description: string;
  status: 'ATIVO' | 'INATIVO';
  allowedProfessionalIds: string[];
}

export interface Client {
  id: string;
  establishmentId: string;
  name: string;
  phone: string;
  whatsapp: string;
  birthDate?: string;
  totalVisits: number;
  totalSpent: number;
  noShowCount: number;
  cancellationCount: number;
  firstVisit: string;
  lastVisit?: string;
  preferredProfessionalId?: string;
  notes?: string;
  createdAt: string;
}

export type AppointmentStatus =
  | 'AGUARDANDO_CONFIRMACAO'
  | 'CONFIRMADO'
  | 'EM_ATENDIMENTO'
  | 'CONCLUIDO'
  | 'CANCELADO'
  | 'NAO_COMPARECEU'
  | 'REAGENDADO';

export interface FinancialSnapshot {
  price: number;
  financialModel: FinancialModelType;
  percentProfessional?: number;
  percentSalon?: number;
  valProfessional: number;
  valSalon: number;
}

export interface Appointment {
  id: string;
  establishmentId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  serviceName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  durationMinutes: number;
  status: AppointmentStatus;
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  notes?: string;
  priceCharged: number;
  snapshot: FinancialSnapshot;
  googleEventId?: string;
  reminderSent24h: boolean;
  reminderSent2h: boolean;
  surveySent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  establishmentId: string;
  appointmentId: string;
  professionalId: string;
  professionalName: string;
  clientId: string;
  clientName: string;
  rating: number; // 1 a 5
  comment: string;
  statusAlert: 'NORMAL' | 'ALERTA_BAIXA_NOTA';
  createdAt: string;
}

export type ExpenseCategory =
  | 'ALUGUEL'
  | 'UTILIDADES'
  | 'PRODUTOS'
  | 'MARKETING'
  | 'IMPOSTOS'
  | 'SALARIOS'
  | 'OUTROS';

export type ExpenseStatus = 'A_VENCER' | 'VENCIDA' | 'PAGA' | 'CANCELADA';

export interface Expense {
  id: string;
  establishmentId: string;
  description: string;
  category: ExpenseCategory;
  supplier?: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  paidDate?: string;
  status: ExpenseStatus;
  isRecurring: boolean;
  recurrenceDay?: number;
  notes?: string;
  createdAt: string;
}

export type PaymentMethod = 'PIX' | 'DINHEIRO' | 'DEBITO' | 'CREDITO' | 'OUTROS';

export interface Revenue {
  id: string;
  establishmentId: string;
  appointmentId?: string;
  type: 'SERVICO' | 'ALUGUEL_CADEIRA' | 'PRODUTO' | 'OUTRO';
  description: string;
  professionalId?: string;
  grossAmount: number;
  discount: number;
  netAmount: number;
  paymentMethod: PaymentMethod;
  status: 'PAGO' | 'PENDENTE';
  paidAt: string;
  valProfessional: number;
  valSalon: number;
}

export interface AuditLog {
  id: string;
  establishmentId: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  recordId: string;
  details?: any;
  timestamp: string;
}

export interface ChatMessage {
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface CampaignRecipient {
  clientId: string;
  clientName: string;
  phone: string;
  status: 'PENDENTE' | 'ENVIADO' | 'ERRO';
  sentMessage?: string;
  sentAt?: string;
  error?: string;
}

export interface PromotionCampaign {
  id: string;
  establishmentId: string;
  title: string;
  rawDescription: string;
  messageTemplate: string;
  status: 'RASCUNHO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  recipients: CampaignRecipient[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DatabaseSchema {
  establishments: Establishment[];
  users: User[];
  professionals: Professional[];
  services: ServiceItem[];
  clients: Client[];
  appointments: Appointment[];
  reviews: Review[];
  expenses: Expense[];
  revenues: Revenue[];
  auditLogs: AuditLog[];
  conversations: Record<string, ChatMessage[]>;
  humanInterventionFlags: Record<string, boolean>; // telefone -> true se humano assumiu
  campaigns?: PromotionCampaign[];
}

export interface WhatsAppState {
  state: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  qrCodeDataUrl?: string;
  phoneNumber?: string;
  lastUpdated: string;
}
