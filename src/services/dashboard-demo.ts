import fs from 'fs';
import path from 'path';
import { DemoNiche } from '../types.js';
import { storage } from '../db/storage.js';
import { NICHE_PERSONAS } from './demo.js';

export interface DemoStaff {
  id: string;
  name: string;
  role: string;
  phone: string;
  model: 'COMISSAO' | 'FIXO' | 'DIARIA';
  commissionRate?: number; // Ex: 40 para 40%
  fixedSalary?: number;    // Ex: 2500 para R$ 2.500/mês
  status: 'ATIVO' | 'FOLGA' | 'FERIAS';
  monthlyProduction: number;
}

export interface DemoExpense {
  id: string;
  description: string;
  category: string;
  type: 'FIXA' | 'VARIAVEL';
  recurrence: 'MENSAL' | 'PONTUAL' | 'SEMANAL';
  amount: number;
  dueDay?: number;
  status: 'PAGO' | 'PENDENTE';
  supplier?: string;
}

export interface DemoClient {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string;
  favoriteItem: string;
  status: 'ATIVO' | 'NOVO' | 'INATIVO';
}

export interface DemoCampaign {
  id: string;
  title: string;
  message: string;
  targetCount: number;
  status: 'CONCLUIDA' | 'EM_ANDAMENTO' | 'RASCUNHO';
  date: string;
  conversionRate?: string;
}

export interface DemoFinancialSummary {
  monthlyRevenue: number;
  monthlyFixedCosts: number;
  monthlyVariableCosts: number;
  totalCosts: number;
  netProfit: number;
  profitMarginPercent: number;
  totalOrders: number;
  averageTicket: number;
  aiConversionRate: number;
  dailyChart: { dayName: string; revenue: number; costs: number }[];
}

export interface DemoDashboardData {
  niche: DemoNiche;
  businessName: string;
  businessCategory: string;
  agentName: string;
  agentIcon: string;
  themeColor: string;
  badge: string;
  financial: DemoFinancialSummary;
  clients: DemoClient[];
  staff: DemoStaff[];
  expenses: DemoExpense[];
  campaigns: DemoCampaign[];
}

export class DashboardDemoService {
  private dataFilePath = path.resolve(process.cwd(), 'data', 'demo_dashboards.json');
  private store: Record<DemoNiche, DemoDashboardData>;

  constructor() {
    this.store = this.loadInitialStore();
  }

  public getPublicUrl(): string {
    return (
      process.env.PUBLIC_URL ||
      'http://rh.82.29.153.163.sslip.io'
    );
  }

  public getDashboardLink(niche: DemoNiche, phone?: string): string {
    const base = this.getPublicUrl();
    const query = new URLSearchParams({ niche });
    if (phone) query.set('phone', phone.replace(/\D/g, ''));
    return `${base}/painel-demo.html?${query.toString()}`;
  }

  public getDashboard(niche: DemoNiche): DemoDashboardData {
    const current = this.store[niche] || this.store.pizzaria;

    // Sincroniza leads reais captados no WhatsApp para o nicho atual
    const leads = (storage.getDemoLeads() || []).filter(l => l.niche === niche);
    const existingPhones = new Set(current.clients.map(c => c.phone.replace(/\D/g, '')));

    for (const lead of leads) {
      const clean = lead.phone.replace(/\D/g, '');
      if (!existingPhones.has(clean)) {
        current.clients.unshift({
          id: `lead_${lead.id}`,
          name: lead.name || 'Visitante WhatsApp',
          phone: lead.phone,
          whatsapp: lead.phone,
          totalOrders: Math.max(1, lead.messageCount),
          totalSpent: current.financial.averageTicket * Math.max(1, Math.min(lead.messageCount, 3)),
          lastOrderDate: 'Hoje',
          favoriteItem: 'Atendido via WhatsApp IA',
          status: 'NOVO'
        });
        existingPhones.add(clean);
      }
    }

    return current;
  }

  public addExpense(niche: DemoNiche, expense: Omit<DemoExpense, 'id'>): DemoExpense {
    const dash = this.store[niche] || this.store.pizzaria;
    const newExp: DemoExpense = {
      ...expense,
      id: `exp_${Date.now()}`
    };
    dash.expenses.unshift(newExp);
    this.recalculateFinancials(dash);
    this.saveStore();
    return newExp;
  }

  public addClient(niche: DemoNiche, client: Omit<DemoClient, 'id'>): DemoClient {
    const dash = this.store[niche] || this.store.pizzaria;
    const newCli: DemoClient = {
      ...client,
      id: `cli_${Date.now()}`
    };
    dash.clients.unshift(newCli);
    this.saveStore();
    return newCli;
  }

  public addStaff(niche: DemoNiche, staff: Omit<DemoStaff, 'id'>): DemoStaff {
    const dash = this.store[niche] || this.store.pizzaria;
    const newStaff: DemoStaff = {
      ...staff,
      id: `stf_${Date.now()}`
    };
    dash.staff.unshift(newStaff);
    this.saveStore();
    return newStaff;
  }

  public addCampaign(niche: DemoNiche, campaign: Omit<DemoCampaign, 'id'>): DemoCampaign {
    const dash = this.store[niche] || this.store.pizzaria;
    const newCamp: DemoCampaign = {
      ...campaign,
      id: `cmp_${Date.now()}`
    };
    dash.campaigns.unshift(newCamp);
    this.saveStore();
    return newCamp;
  }

  private recalculateFinancials(dash: DemoDashboardData) {
    let fixed = 0;
    let variable = 0;
    for (const exp of dash.expenses) {
      if (exp.type === 'FIXA') {
        fixed += exp.amount;
      } else {
        variable += exp.amount;
      }
    }
    dash.financial.monthlyFixedCosts = fixed;
    dash.financial.monthlyVariableCosts = variable;
    dash.financial.totalCosts = fixed + variable;
    dash.financial.netProfit = dash.financial.monthlyRevenue - dash.financial.totalCosts;
    dash.financial.profitMarginPercent = Math.round((dash.financial.netProfit / dash.financial.monthlyRevenue) * 1000) / 10;
  }

  private saveStore() {
    try {
      const dir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dataFilePath, JSON.stringify(this.store, null, 2), 'utf-8');
    } catch (e) {
      console.error('[DashboardDemoService] Erro ao salvar store em arquivo:', e);
    }
  }

  private loadInitialStore(): Record<DemoNiche, DemoDashboardData> {
    if (fs.existsSync(this.dataFilePath)) {
      try {
        const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
        return JSON.parse(raw);
      } catch (e) {
        console.warn('[DashboardDemoService] Falha ao carregar demo_dashboards.json, usando padrão.');
      }
    }
    return this.createDefaultStore();
  }

  private createDefaultStore(): Record<DemoNiche, DemoDashboardData> {
    return {
      pizzaria: {
        niche: 'pizzaria',
        businessName: 'Forno & Sabor Pizzaria Artesanal',
        businessCategory: 'Gastronomia & Delivery de Pizzas',
        agentName: 'Luigi',
        agentIcon: '🍕',
        themeColor: '#f97316',
        badge: 'Pizzaria & Delivery',
        financial: {
          monthlyRevenue: 48650,
          monthlyFixedCosts: 5398.9,
          monthlyVariableCosts: 16840,
          totalCosts: 22238.9,
          netProfit: 26411.1,
          profitMarginPercent: 54.3,
          totalOrders: 684,
          averageTicket: 71.12,
          aiConversionRate: 96.4,
          dailyChart: [
            { dayName: 'Segunda', revenue: 4120, costs: 1850 },
            { dayName: 'Terça', revenue: 4890, costs: 2100 },
            { dayName: 'Quarta', revenue: 5640, costs: 2300 },
            { dayName: 'Quinta', revenue: 6780, costs: 2800 },
            { dayName: 'Sexta', revenue: 10450, costs: 4200 },
            { dayName: 'Sábado', revenue: 11200, costs: 4600 },
            { dayName: 'Domingo', revenue: 5570, costs: 2380 }
          ]
        },
        staff: [
          { id: 'p_1', name: 'Giovanni Rossi', role: 'Pizzaiolo Chefe', phone: '(11) 98111-2233', model: 'FIXO', fixedSalary: 3400, status: 'ATIVO', monthlyProduction: 18500 },
          { id: 'p_2', name: 'Marcos Vinicius', role: 'Forneiro de Lenha', phone: '(11) 98222-3344', model: 'FIXO', fixedSalary: 2400, status: 'ATIVO', monthlyProduction: 14200 },
          { id: 'p_3', name: 'Lucas Motoboy', role: 'Entregador Parceiro', phone: '(11) 98333-4455', model: 'DIARIA', fixedSalary: 1980, status: 'ATIVO', monthlyProduction: 6800 },
          { id: 'p_4', name: 'Rafael Motoboy', role: 'Entregador Parceiro', phone: '(11) 98444-5566', model: 'DIARIA', fixedSalary: 1840, status: 'ATIVO', monthlyProduction: 6200 },
          { id: 'p_5', name: 'Luigi (IA 24h)', role: 'Atendente Virtual WhatsApp', phone: '(11) 96557-4389', model: 'FIXO', fixedSalary: 0, status: 'ATIVO', monthlyProduction: 48650 }
        ],
        expenses: [
          { id: 'e_1', description: 'Aluguel do Salão & Cozinha Forneira', category: 'Imóvel & Ponto', type: 'FIXA', recurrence: 'MENSAL', amount: 3800, dueDay: 10, status: 'PAGO', supplier: 'Imobiliária Jardins' },
          { id: 'e_2', description: 'Energia Comercial (Força Trifásica)', category: 'Utilidades', type: 'FIXA', recurrence: 'MENSAL', amount: 1250, dueDay: 15, status: 'PENDENTE', supplier: 'Enel SP' },
          { id: 'e_3', description: 'Internet Fibra Óptica 600MB', category: 'Telecom', type: 'FIXA', recurrence: 'MENSAL', amount: 149.9, dueDay: 20, status: 'PAGO', supplier: 'Vivo Fibra' },
          { id: 'e_4', description: 'Sistema PDV & Emissor Fiscal SAT', category: 'Software', type: 'FIXA', recurrence: 'MENSAL', amount: 199, dueDay: 5, status: 'PAGO', supplier: 'FoodTech Sistemas' },
          { id: 'e_5', description: 'Queijos Muçarela & Catupiry Original', category: 'Insumos & Alimentos', type: 'VARIAVEL', recurrence: 'SEMANAL', amount: 6200, status: 'PAGO', supplier: 'Laticínios Scala' },
          { id: 'e_6', description: 'Farinha Italiana 00 & Fermentação', category: 'Insumos & Alimentos', type: 'VARIAVEL', recurrence: 'SEMANAL', amount: 2850, status: 'PAGO', supplier: 'Moinho Caputo' },
          { id: 'e_7', description: 'Caixas de Pizza Oitavadas & Lacre', category: 'Embalagens', type: 'VARIAVEL', recurrence: 'MENSAL', amount: 1240, status: 'PAGO', supplier: 'Embalagens Express' },
          { id: 'e_8', description: 'Lenha Ecológica de Eucalipto Tratado', category: 'Combustível do Forno', type: 'VARIAVEL', recurrence: 'MENSAL', amount: 980, status: 'PAGO', supplier: 'BioLenha Paulista' },
          { id: 'e_9', description: 'Diárias e Repasses de Motoboy', category: 'Logística de Entrega', type: 'VARIAVEL', recurrence: 'SEMANAL', amount: 5570, status: 'PAGO', supplier: 'Equipe de Entregas' }
        ],
        clients: [
          { id: 'c_1', name: 'Mateus Silva', phone: '(11) 98877-6655', whatsapp: '5511988776655', totalOrders: 7, totalSpent: 512, lastOrderDate: 'Hoje', favoriteItem: 'Grande Meia Calabresa / Meia 4 Queijos', status: 'ATIVO' },
          { id: 'c_2', name: 'Raphaela Oliveira', phone: '(11) 97766-5544', whatsapp: '5511977665544', totalOrders: 5, totalSpent: 388, lastOrderDate: 'Ontem', favoriteItem: 'Combo Família Feliz + Borda Catupiry', status: 'ATIVO' },
          { id: 'c_3', name: 'Carlos Eduardo Santos', phone: '(11) 96655-4433', whatsapp: '5511966554433', totalOrders: 9, totalSpent: 740, lastOrderDate: '3 dias atrás', favoriteItem: 'Pizza Gigante Frango com Catupiry', status: 'ATIVO' },
          { id: 'c_4', name: 'Fernanda Souza', phone: '(11) 95544-3322', whatsapp: '5511955443322', totalOrders: 3, totalSpent: 220, lastOrderDate: '5 dias atrás', favoriteItem: 'Broto Nutella com Morangos', status: 'ATIVO' },
          { id: 'c_5', name: 'Lucas Mendes', phone: '(11) 94433-2211', whatsapp: '5511944332211', totalOrders: 1, totalSpent: 78, lastOrderDate: '19 dias atrás', favoriteItem: 'Marguerita Especial', status: 'INATIVO' }
        ],
        campaigns: [
          { id: 'cmp_1', title: 'Sexta da Borda Grátis no WhatsApp', message: 'Oi {nome}! Sextou na Forno & Sabor! Peça qualquer pizza grande hoje e ganhe borda de Catupiry ou Nutella grátis! Digite EU QUERO!', targetCount: 482, status: 'CONCLUIDA', date: '10/10/2026', conversionRate: '31.4%' },
          { id: 'cmp_2', title: 'Domingo com Refrigerante 2L Cortesia', message: 'Domingo pede pizza quentinha em família, {nome}! No Combo Família o Guaraná 2L é por nossa conta. Vamos pedir?', targetCount: 395, status: 'CONCLUIDA', date: '05/10/2026', conversionRate: '28.7%' }
        ]
      },

      petshop: {
        niche: 'petshop',
        businessName: 'Pet & Cia Centro Veterinário',
        businessCategory: 'Saúde Animal, Banho, Tosa & Vet',
        agentName: 'Bob',
        agentIcon: '🐾',
        themeColor: '#10b981',
        badge: 'Pet Shop & Clínica Vet',
        financial: {
          monthlyRevenue: 34200,
          monthlyFixedCosts: 4800,
          monthlyVariableCosts: 11200,
          totalCosts: 16000,
          netProfit: 18200,
          profitMarginPercent: 53.2,
          totalOrders: 380,
          averageTicket: 90.0,
          aiConversionRate: 95.1,
          dailyChart: [
            { dayName: 'Segunda', revenue: 3200, costs: 1400 },
            { dayName: 'Terça', revenue: 3900, costs: 1600 },
            { dayName: 'Quarta', revenue: 4800, costs: 2100 },
            { dayName: 'Quinta', revenue: 5400, costs: 2300 },
            { dayName: 'Sexta', revenue: 7800, costs: 3200 },
            { dayName: 'Sábado', revenue: 8400, costs: 3600 },
            { dayName: 'Domingo', revenue: 700, costs: 300 }
          ]
        },
        staff: [
          { id: 'vet_1', name: 'Dra. Carla Medeiros', role: 'Médica Veterinária CRMV', phone: '(11) 98711-1122', model: 'COMISSAO', commissionRate: 50, status: 'ATIVO', monthlyProduction: 14500 },
          { id: 'tosa_1', name: 'Lucas Groomer', role: 'Tosador Especialista', phone: '(11) 98722-2233', model: 'COMISSAO', commissionRate: 40, status: 'ATIVO', monthlyProduction: 11200 },
          { id: 'banho_1', name: 'Mariana Banhista', role: 'Banhista e Finalizadora', phone: '(11) 98733-3344', model: 'FIXO', fixedSalary: 2100, status: 'ATIVO', monthlyProduction: 8500 },
          { id: 'taxi_1', name: 'Pedro Táxi Dog', role: 'Motorista Leva & Traz', phone: '(11) 98744-4455', model: 'DIARIA', fixedSalary: 1800, status: 'ATIVO', monthlyProduction: 4200 }
        ],
        expenses: [
          { id: 'pe_1', description: 'Aluguel do Centro Veterinário & Estética', category: 'Imóvel', type: 'FIXA', recurrence: 'MENSAL', amount: 3500, dueDay: 10, status: 'PAGO' },
          { id: 'pe_2', description: 'Energia (Secadores & Sopradores)', category: 'Utilidades', type: 'FIXA', recurrence: 'MENSAL', amount: 980, dueDay: 15, status: 'PENDENTE' },
          { id: 'pe_3', description: 'Shampoos Hipoalergênicos & Condicionadores', category: 'Insumos', type: 'VARIAVEL', recurrence: 'MENSAL', amount: 2400, status: 'PAGO' },
          { id: 'pe_4', description: 'Vacinas V10 & Antirrábica Pfizer', category: 'Medicamentos', type: 'VARIAVEL', recurrence: 'MENSAL', amount: 3800, status: 'PAGO' },
          { id: 'pe_5', description: 'Combustível Táxi Dog', category: 'Logística', type: 'VARIAVEL', recurrence: 'SEMANAL', amount: 1100, status: 'PAGO' }
        ],
        clients: [
          { id: 'pc_1', name: 'Juliana Paiva (Tutor do Thor - Golden)', phone: '(11) 99111-0011', whatsapp: '5511991110011', totalOrders: 6, totalSpent: 720, lastOrderDate: 'Ontem', favoriteItem: 'Banho Porte Grande + Tosa + Táxi Dog', status: 'ATIVO' },
          { id: 'pc_2', name: 'Rodrigo Faro (Tutor da Mel - Shih Tzu)', phone: '(11) 99222-0022', whatsapp: '5511992220022', totalOrders: 8, totalSpent: 640, lastOrderDate: '3 dias atrás', favoriteItem: 'Combo Banho e Tosa Higiênica', status: 'ATIVO' }
        ],
        campaigns: [
          { id: 'pcmp_1', title: 'Quarta da Hidratação Pet Grátis', message: 'Olá {nome}! Na quarta do Pet & Cia seu bichinho ganha hidratação de argan gratuita no banho. Vamos agendar?', targetCount: 320, status: 'CONCLUIDA', date: '08/10/2026', conversionRate: '34%' }
        ]
      },

      estetica: {
        niche: 'estetica',
        businessName: 'Clínica Lumière Estética Avançada',
        businessCategory: 'Biomedicina Estética & Harmonização',
        agentName: 'Camila',
        agentIcon: '✨',
        themeColor: '#ec4899',
        badge: 'Clínica de Estética & Beleza',
        financial: {
          monthlyRevenue: 62400,
          monthlyFixedCosts: 6200,
          monthlyVariableCosts: 18400,
          totalCosts: 24600,
          netProfit: 37800,
          profitMarginPercent: 60.5,
          totalOrders: 142,
          averageTicket: 439.43,
          aiConversionRate: 94.8,
          dailyChart: [
            { dayName: 'Terça', revenue: 9800, costs: 3800 },
            { dayName: 'Quarta', revenue: 11200, costs: 4200 },
            { dayName: 'Quinta', revenue: 13500, costs: 5100 },
            { dayName: 'Sexta', revenue: 16400, costs: 6200 },
            { dayName: 'Sábado', revenue: 11500, costs: 4100 }
          ]
        },
        staff: [
          { id: 'est_1', name: 'Dra. Fernanda Lins', role: 'Biomédica Esteta Responsável', phone: '(11) 97123-4567', model: 'COMISSAO', commissionRate: 50, status: 'ATIVO', monthlyProduction: 42000 },
          { id: 'est_2', name: 'Patrícia Rocha', role: 'Esteticista & Massoterapeuta', phone: '(11) 97234-5678', model: 'COMISSAO', commissionRate: 40, status: 'ATIVO', monthlyProduction: 20400 }
        ],
        expenses: [
          { id: 'ee_1', description: 'Aluguel do Consultório Clínico Jardins', category: 'Imóvel', type: 'FIXA', recurrence: 'MENSAL', amount: 4800, dueDay: 10, status: 'PAGO' },
          { id: 'ee_2', description: 'Toxina Botulínica (Botox) Allergan', category: 'Insumos Médicos', type: 'VARIAVEL', recurrence: 'MENSAL', amount: 9800, status: 'PAGO' },
          { id: 'ee_3', description: 'Ácido Hialurônico Juvederm Ultra', category: 'Insumos Médicos', type: 'VARIAVEL', recurrence: 'MENSAL', amount: 6400, status: 'PAGO' }
        ],
        clients: [
          { id: 'ec_1', name: 'Beatriz Vasconcelos', phone: '(11) 98122-3344', whatsapp: '5511981223344', totalOrders: 4, totalSpent: 3100, lastOrderDate: 'Ontem', favoriteItem: 'Botox 3 Regiões + Drenagem', status: 'ATIVO' }
        ],
        campaigns: [
          { id: 'ecmp_1', title: 'Semana do Retoque de Botox Cortesia', message: 'Olá {nome}! Reserve seu botox nesta semana e ganhe o retoque após 15 dias sem custo adicional. Restam 4 vagas!', targetCount: 180, status: 'CONCLUIDA', date: '01/10/2026', conversionRate: '41%' }
        ]
      },

      dentista: {
        niche: 'dentista',
        businessName: 'Oral Excellence Odontologia',
        businessCategory: 'Consultório Odontológico & Implantes',
        agentName: 'Dra. Mariana',
        agentIcon: '🦷',
        themeColor: '#0ea5e9',
        badge: 'Consultório Odontológico',
        financial: {
          monthlyRevenue: 51800,
          monthlyFixedCosts: 5400,
          monthlyVariableCosts: 14200,
          totalCosts: 19600,
          netProfit: 32200,
          profitMarginPercent: 62.1,
          totalOrders: 198,
          averageTicket: 261.61,
          aiConversionRate: 95.8,
          dailyChart: [
            { dayName: 'Segunda', revenue: 7800, costs: 2900 },
            { dayName: 'Terça', revenue: 9200, costs: 3400 },
            { dayName: 'Quarta', revenue: 10400, costs: 3900 },
            { dayName: 'Quinta', revenue: 11100, costs: 4100 },
            { dayName: 'Sexta', revenue: 9800, costs: 3600 },
            { dayName: 'Sábado', revenue: 3500, costs: 1300 }
          ]
        },
        staff: [
          { id: 'den_1', name: 'Dr. Carlos Alberto', role: 'Ortodontista e Implantodontista', phone: '(11) 96234-5678', model: 'COMISSAO', commissionRate: 50, status: 'ATIVO', monthlyProduction: 31000 },
          { id: 'den_2', name: 'Dra. Mariana (IA)', role: 'Triagem e Secretária Odonto', phone: '(11) 96557-4389', model: 'FIXO', fixedSalary: 0, status: 'ATIVO', monthlyProduction: 51800 }
        ],
        expenses: [
          { id: 'de_1', description: 'Aluguel do Consultório Odontológico', category: 'Imóvel', type: 'FIXA', recurrence: 'MENSAL', amount: 4200, dueDay: 10, status: 'PAGO' },
          { id: 'de_2', description: 'Laboratório de Prótese & Moldes 3D', category: 'Laboratório', type: 'VARIAVEL', recurrence: 'MENSAL', amount: 5600, status: 'PAGO' }
        ],
        clients: [
          { id: 'dc_1', name: 'Gabriel Pires', phone: '(11) 98344-5566', whatsapp: '5511983445566', totalOrders: 5, totalSpent: 1850, lastOrderDate: 'Hoje', favoriteItem: 'Clareamento Dental a Laser', status: 'ATIVO' }
        ],
        campaigns: [
          { id: 'dcmp_1', title: 'Mês da Profilaxia & Clareamento', message: 'Olá {nome}! Agende sua limpeza preventiva nesta semana e garanta 25% de desconto no clareamento a laser!', targetCount: 220, status: 'CONCLUIDA', date: '04/10/2026', conversionRate: '37%' }
        ]
      },

      medico: {
        niche: 'medico',
        businessName: 'Centro Médico Vida & Saúde Integrada',
        businessCategory: 'Policlínica & Telemedicina',
        agentName: 'Helena',
        agentIcon: '🩺',
        themeColor: '#06b6d4',
        badge: 'Clínica Médica & Exames',
        financial: {
          monthlyRevenue: 78500,
          monthlyFixedCosts: 8900,
          monthlyVariableCosts: 24500,
          totalCosts: 33400,
          netProfit: 45100,
          profitMarginPercent: 57.4,
          totalOrders: 340,
          averageTicket: 230.88,
          aiConversionRate: 97.2,
          dailyChart: [
            { dayName: 'Segunda', revenue: 14200, costs: 5900 },
            { dayName: 'Terça', revenue: 15400, costs: 6400 },
            { dayName: 'Quarta', revenue: 16100, costs: 6800 },
            { dayName: 'Quinta', revenue: 17200, costs: 7300 },
            { dayName: 'Sexta', revenue: 15600, costs: 6600 }
          ]
        },
        staff: [
          { id: 'med_1', name: 'Dr. Roberto Meireles', role: 'Cardiologista CRM/SP', phone: '(11) 97345-6789', model: 'COMISSAO', commissionRate: 60, status: 'ATIVO', monthlyProduction: 38000 },
          { id: 'med_2', name: 'Dra. Camila Toledo', role: 'Pediatra Geral', phone: '(11) 97456-7890', model: 'COMISSAO', commissionRate: 60, status: 'ATIVO', monthlyProduction: 28500 }
        ],
        expenses: [
          { id: 'me_1', description: 'Aluguel da Policlínica & Recepção', category: 'Imóvel', type: 'FIXA', recurrence: 'MENSAL', amount: 6800, dueDay: 10, status: 'PAGO' },
          { id: 'me_2', description: 'Plataforma de Prontuário & Assinatura ICP', category: 'Software', type: 'FIXA', recurrence: 'MENSAL', amount: 590, dueDay: 5, status: 'PAGO' }
        ],
        clients: [
          { id: 'mc_1', name: 'Marcelo Rezende', phone: '(11) 98455-6677', whatsapp: '5511984556677', totalOrders: 3, totalSpent: 840, lastOrderDate: 'Ontem', favoriteItem: 'Consulta Cardiologia + Eletro', status: 'ATIVO' }
        ],
        campaigns: [
          { id: 'mcmp_1', title: 'Campanha de Prevenção Cardiovascular', message: 'Olá {nome}! Cuidar do coração é prioridade. Temos horários especiais para check-up cardiológico com eletro incluso esta semana!', targetCount: 310, status: 'CONCLUIDA', date: '02/10/2026', conversionRate: '35%' }
        ]
      },

      cabeleireiro: {
        niche: 'cabeleireiro',
        businessName: 'Studio Bella & Barba Vip',
        businessCategory: 'Cabelo, Barbearia & Manicure',
        agentName: 'Sofia',
        agentIcon: '✂️',
        themeColor: '#8b5cf6',
        badge: 'Salão de Beleza & Barba',
        financial: {
          monthlyRevenue: 38900,
          monthlyFixedCosts: 4600,
          monthlyVariableCosts: 12400,
          totalCosts: 17000,
          netProfit: 21900,
          profitMarginPercent: 56.2,
          totalOrders: 420,
          averageTicket: 92.61,
          aiConversionRate: 95.9,
          dailyChart: [
            { dayName: 'Segunda', revenue: 3100, costs: 1300 },
            { dayName: 'Terça', revenue: 4200, costs: 1800 },
            { dayName: 'Quarta', revenue: 5100, costs: 2200 },
            { dayName: 'Quinta', revenue: 7400, costs: 3200 },
            { dayName: 'Sexta', revenue: 9800, costs: 4200 },
            { dayName: 'Sábado', revenue: 9300, costs: 4300 }
          ]
        },
        staff: [
          { id: 'cab_1', name: 'Joana Silva', role: 'Hairstylist & Colorista', phone: '(11) 99123-1122', model: 'COMISSAO', commissionRate: 50, status: 'ATIVO', monthlyProduction: 16800 },
          { id: 'cab_2', name: 'Maria Alisamentos', role: 'Especialista em Progressivas', phone: '(11) 99234-2233', model: 'COMISSAO', commissionRate: 50, status: 'ATIVO', monthlyProduction: 12500 },
          { id: 'cab_3', name: 'Priscila Nail Designer', role: 'Manicure & Alongamento', phone: '(11) 99345-3344', model: 'COMISSAO', commissionRate: 50, status: 'ATIVO', monthlyProduction: 5800 },
          { id: 'cab_4', name: 'Renata Barbeira', role: 'Barbearia & Cortes Masculinos', phone: '(11) 99456-4455', model: 'COMISSAO', commissionRate: 50, status: 'ATIVO', monthlyProduction: 3800 }
        ],
        expenses: [
          { id: 'ce_1', description: 'Aluguel do Salão Comercial', category: 'Imóvel', type: 'FIXA', recurrence: 'MENSAL', amount: 3600, dueDay: 10, status: 'PAGO' },
          { id: 'ce_2', description: 'Progressivas sem Formol & Botox Capilar', category: 'Insumos', type: 'VARIAVEL', recurrence: 'MENSAL', amount: 3200, status: 'PAGO' }
        ],
        clients: [
          { id: 'cc_1', name: 'Camila Duarte', phone: '(11) 98566-7788', whatsapp: '5511985667788', totalOrders: 6, totalSpent: 890, lastOrderDate: 'Ontem', favoriteItem: 'Progressiva sem Formol + Escova', status: 'ATIVO' }
        ],
        campaigns: [
          { id: 'ccmp_1', title: 'Quinta das Mechas Iluminadas', message: 'Olá {nome}! Quinta-feira especial de Morena Iluminada com corte e hidratação inclusos. Garanta sua vaga com a Joana!', targetCount: 290, status: 'CONCLUIDA', date: '07/10/2026', conversionRate: '33%' }
        ]
      },

      pessoal: {
        niche: 'pessoal',
        businessName: 'Jarvis • Gestão Executiva & Finanças',
        businessCategory: 'Produtividade & Finanças Pessoais/PME',
        agentName: 'Jarvis',
        agentIcon: '👔',
        themeColor: '#f59e0b',
        badge: 'Gestão Executiva & Finanças',
        financial: {
          monthlyRevenue: 28400,
          monthlyFixedCosts: 3100,
          monthlyVariableCosts: 6800,
          totalCosts: 9900,
          netProfit: 18500,
          profitMarginPercent: 65.1,
          totalOrders: 112,
          averageTicket: 253.57,
          aiConversionRate: 98.4,
          dailyChart: [
            { dayName: 'Segunda', revenue: 4500, costs: 1200 },
            { dayName: 'Terça', revenue: 4800, costs: 1500 },
            { dayName: 'Quarta', revenue: 5200, costs: 1800 },
            { dayName: 'Quinta', revenue: 6100, costs: 2100 },
            { dayName: 'Sexta', revenue: 7800, costs: 3300 }
          ]
        },
        staff: [
          { id: 'jar_1', name: 'Consultor Financeiro Parceiro', role: 'Planejamento Tributário', phone: '(11) 96555-1122', model: 'FIXO', fixedSalary: 2500, status: 'ATIVO', monthlyProduction: 18000 },
          { id: 'jar_2', name: 'Jarvis (IA Executiva)', role: 'Braço Direito 24h WhatsApp', phone: '(11) 96557-4389', model: 'FIXO', fixedSalary: 0, status: 'ATIVO', monthlyProduction: 28400 }
        ],
        expenses: [
          { id: 'je_1', description: 'Assinaturas de Softwares & APIs de Nuvem', category: 'Tecnologia', type: 'FIXA', recurrence: 'MENSAL', amount: 890, dueDay: 5, status: 'PAGO' },
          { id: 'je_2', description: 'Escritório Virtual & Coworking', category: 'Infraestrutura', type: 'FIXA', recurrence: 'MENSAL', amount: 1200, dueDay: 10, status: 'PAGO' },
          { id: 'je_3', description: 'Honorários Contábeis & DAS Simples', category: 'Tributos', type: 'FIXA', recurrence: 'MENSAL', amount: 1010, dueDay: 20, status: 'PAGO' }
        ],
        clients: [
          { id: 'jc_1', name: 'Rodrigo Medeiros (Empresário)', phone: '(11) 98677-8899', whatsapp: '5511986778899', totalOrders: 14, totalSpent: 3500, lastOrderDate: 'Hoje', favoriteItem: 'Relatório Executivo & Controle de Fluxo', status: 'ATIVO' }
        ],
        campaigns: [
          { id: 'jcmp_1', title: 'Fechamento Financeiro Trimestral', message: 'Prezado(a) {nome}, seu relatório de performance e metas já está consolidado no radar!', targetCount: 85, status: 'CONCLUIDA', date: '01/10/2026', conversionRate: '52%' }
        ]
      }
    };
  }
}

export const dashboardDemoService = new DashboardDemoService();
