export interface Appointment {
  id: string;
  clientName: string;
  clientPhone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  service: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  notes?: string;
  createdAt: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
}

export interface CompanySettings {
  companyName: string;
  secretaryName: string;
  companyDescription: string;
  workingHours: string;
  address: string;
  adminPhone: string;
  welcomeMessage: string;
}

export interface ChatMessage {
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface DatabaseSchema {
  appointments: Appointment[];
  services: ServiceItem[];
  settings: CompanySettings;
  conversations: Record<string, ChatMessage[]>;
}

export interface WhatsAppState {
  state: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  qrCodeDataUrl?: string;
  phoneNumber?: string;
  lastUpdated: string;
}
