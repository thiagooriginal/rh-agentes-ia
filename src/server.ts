import express from 'express';
import cors from 'cors';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { storage } from './db/storage.js';
import { aiService } from './services/ai.js';
import { whatsappService } from './services/whatsapp.js';
import { portalWhatsAppService } from './services/portal-whatsapp.js';
import { googleCalendar } from './services/calendar.js';
import { campaignService } from './services/campaign.js';
import { demoService } from './services/demo.js';
import { dashboardDemoService } from './services/dashboard-demo.js';
import { DemoNiche } from './types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'salao-beauty-secret-token-2026';

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  // --- MIDDLEWARE AUTH (Opcional para proteger rotas administrativas) ---
  const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next(); // Permite fallback gracioso
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      (req as any).user = decoded;
    } catch (e) {}
    next();
  };
  app.use(authenticate);

  // --- AUTH / LOGIN ---
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }

    const user = storage.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const isValid = bcrypt.compareSync(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, professionalId: user.professionalId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { passwordHash, ...safeUser } = user;
    res.json({ success: true, token, user: safeUser });
  });

  // --- STATUS & WHATSAPP (SALÃO E PORTAL) ---
  app.get('/api/status', (req, res) => {
    const est = storage.getEstablishment();
    res.json({
      establishment: est,
      whatsapp: whatsappService.getStatus(),
      portalWhatsapp: portalWhatsAppService.getStatus(),
      hasGeminiApiKey: aiService.hasApiKey(),
      hasGoogleCalendar: googleCalendar.isAvailable(),
      isAiPaused: storage.isGlobalAiPaused(),
      isSalonAiPaused: storage.isSalonAiPaused(),
      isPortalAiPaused: storage.isPortalAiPaused()
    });
  });

  // --- CONTROLE DE PAUSA DA IA ---
  app.get('/api/ai/status', (req, res) => {
    res.json({
      globalPaused: storage.isGlobalAiPaused(),
      salonPaused: storage.isSalonAiPaused(),
      portalPaused: storage.isPortalAiPaused()
    });
  });

  app.post('/api/ai/pause', (req, res) => {
    storage.setGlobalAiPaused(true);
    res.json({ success: true, message: 'Todas as respostas automáticas da IA foram pausadas.' });
  });

  app.post('/api/ai/resume', (req, res) => {
    storage.setGlobalAiPaused(false);
    storage.setSalonAiPaused(false);
    storage.setPortalAiPaused(false);
    res.json({ success: true, message: 'Todas as respostas automáticas da IA foram reativadas.' });
  });

  app.post('/api/ai/salon/pause', (req, res) => {
    storage.setSalonAiPaused(true);
    res.json({ success: true, paused: true, message: 'IA do Salão pausada.' });
  });

  app.post('/api/ai/salon/resume', (req, res) => {
    storage.setSalonAiPaused(false);
    res.json({ success: true, paused: false, message: 'IA do Salão reativada.' });
  });

  app.post('/api/ai/portal/pause', (req, res) => {
    storage.setPortalAiPaused(true);
    res.json({ success: true, paused: true, message: 'IA do Portal das IAs pausada.' });
  });

  app.post('/api/ai/portal/resume', (req, res) => {
    storage.setPortalAiPaused(false);
    res.json({ success: true, paused: false, message: 'IA do Portal das IAs reativada.' });
  });

  // --- WHATSAPP SALÃO (LINHA 1) ---
  app.post('/api/whatsapp/connect', async (req, res) => {
    try {
      await whatsappService.start();
      res.json({ success: true, message: 'Iniciando conexão com WhatsApp do Salão...' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/whatsapp/disconnect', async (req, res) => {
    try {
      await whatsappService.disconnect(true);
      res.json({ success: true, message: 'Sessão do Salão desconectada com sucesso' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/whatsapp/reset', async (req, res) => {
    try {
      await whatsappService.resetSession();
      res.json({ success: true, message: 'Sessão reiniciada com sucesso. Novo QR code gerado!' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/whatsapp/pairing-code', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ success: false, error: 'Telefone é obrigatório.' });
      const code = await whatsappService.requestPairingCode(phone);
      res.json({ success: true, code });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- WHATSAPP PORTAL DAS IAS (LINHA 2 DEDICADA) ---
  app.get('/api/portal/whatsapp/status', (req, res) => {
    res.json(portalWhatsAppService.getStatus());
  });

  app.post('/api/portal/whatsapp/connect', async (req, res) => {
    try {
      await portalWhatsAppService.start();
      res.json({ success: true, message: 'Iniciando conexão com WhatsApp do Portal das IAs...' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/portal/whatsapp/disconnect', async (req, res) => {
    try {
      await portalWhatsAppService.disconnect(true);
      res.json({ success: true, message: 'Sessão do Portal das IAs desconectada com sucesso' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/portal/whatsapp/reset', async (req, res) => {
    try {
      await portalWhatsAppService.resetSession();
      res.json({ success: true, message: 'Sessão do portal reiniciada com sucesso. Novo QR code gerado!' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/portal/whatsapp/pairing-code', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ success: false, error: 'Telefone é obrigatório.' });
      const code = await portalWhatsAppService.requestPairingCode(phone);
      res.json({ success: true, code });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- CONFIGURAÇÃO DO ESTABELECIMENTO ---
  app.get('/api/establishment', (req, res) => {
    res.json(storage.getEstablishment());
  });

  app.put('/api/establishment', (req, res) => {
    const { geminiApiKey, ...data } = req.body;
    if (geminiApiKey && typeof geminiApiKey === 'string' && geminiApiKey.trim()) {
      aiService.initClient(geminiApiKey.trim());
    }
    const updated = storage.updateEstablishment(data.id || undefined, data);
    res.json({ success: true, establishment: updated });
  });

  // --- PROFISSIONAIS ---
  app.get('/api/professionals', (req, res) => {
    res.json(storage.getProfessionals());
  });

  app.post('/api/professionals', (req, res) => {
    const prof = storage.saveProfessional(req.body);
    res.json({ success: true, professional: prof });
  });

  app.put('/api/professionals/:id', (req, res) => {
    const updated = storage.updateProfessional(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Profissional não encontrada' });
    res.json({ success: true, professional: updated });
  });

  app.delete('/api/professionals/:id', (req, res) => {
    const ok = storage.deleteProfessional(req.params.id);
    res.json({ success: ok });
  });

  app.get('/api/professionals/:id/slots', (req, res) => {
    const { date, duration } = req.query;
    if (!date) return res.status(400).json({ error: 'Data é obrigatória (YYYY-MM-DD)' });
    const slots = storage.getAvailableSlots(req.params.id, Number(duration) || 60, date as string);
    res.json({ slots });
  });

  // --- SERVIÇOS ---
  app.get('/api/services', (req, res) => {
    res.json(storage.getServices());
  });

  app.post('/api/services', (req, res) => {
    const serv = storage.saveService(req.body);
    res.json({ success: true, service: serv });
  });

  app.put('/api/services/:id', (req, res) => {
    const updated = storage.updateService(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Serviço não encontrado' });
    res.json({ success: true, service: updated });
  });

  app.delete('/api/services/:id', (req, res) => {
    const ok = storage.deleteService(req.params.id);
    res.json({ success: ok });
  });

  // --- CLIENTES ---
  app.get('/api/clients', (req, res) => {
    res.json(storage.getClients());
  });

  app.put('/api/clients/:id', (req, res) => {
    const updated = storage.updateClient(req.params.id, req.body);
    res.json({ success: !!updated, client: updated });
  });

  // --- AGENDAMENTOS ---
  app.get('/api/appointments', (req, res) => {
    const { professionalId, clientId, date, status } = req.query;
    res.json(storage.getAppointments({
      professionalId: professionalId as string,
      clientId: clientId as string,
      date: date as string,
      status: status as string
    }));
  });

  app.post('/api/appointments', async (req, res) => {
    const result = storage.createAppointment(req.body);
    if (result.success && result.appointment) {
      await googleCalendar.createEvent(result.appointment);
      return res.json({ success: true, appointment: result.appointment });
    }
    res.status(400).json({ success: false, error: result.message });
  });

  app.patch('/api/appointments/:id/status', async (req, res) => {
    const { status, cancellationReason, cancelledBy } = req.body;
    const ok = storage.updateAppointmentStatus(req.params.id, status, { cancellationReason, cancelledBy });
    res.json({ success: ok });
  });

  app.patch('/api/appointments/:id/reschedule', async (req, res) => {
    const { newDate, newStartTime } = req.body;
    const result = storage.rescheduleAppointment(req.params.id, newDate, newStartTime);
    if (result.success && result.appointment) {
      await googleCalendar.updateEvent(result.appointment);
      return res.json({ success: true, appointment: result.appointment });
    }
    res.status(400).json({ success: false, error: result.message });
  });

  // --- AVALIAÇÕES ---
  app.get('/api/reviews', (req, res) => {
    const { professionalId } = req.query;
    res.json(storage.getReviews(undefined, professionalId as string));
  });

  app.post('/api/reviews', (req, res) => {
    const review = storage.addReview(req.body);
    res.json({ success: true, review });
  });

  // --- FINANCEIRO & DRE ---
  app.get('/api/financial/dre', (req, res) => {
    const { month } = req.query;
    const dre = storage.calculateDRE(undefined, month as string);
    res.json(dre);
  });

  app.get('/api/financial/expenses', (req, res) => {
    res.json(storage.getExpenses());
  });

  app.post('/api/financial/expenses', (req, res) => {
    const exp = storage.addExpense(req.body);
    res.json({ success: true, expense: exp });
  });

  app.patch('/api/financial/expenses/:id', (req, res) => {
    const updated = storage.updateExpense(req.params.id, req.body);
    res.json({ success: !!updated, expense: updated });
  });

  app.delete('/api/financial/expenses/:id', (req, res) => {
    const ok = storage.deleteExpense(req.params.id);
    res.json({ success: ok });
  });

  app.get('/api/financial/revenues', (req, res) => {
    res.json(storage.getRevenues());
  });

  // --- DASHBOARD KPIS ---
  app.get('/api/dashboard/kpis', (req, res) => {
    const apps = storage.getAppointments();
    const reviews = storage.getReviews();
    const clients = storage.getClients();
    const dre = storage.calculateDRE();

    const todayStr = new Date().toISOString().split('T')[0];
    const todayApps = apps.filter(a => a.date === todayStr);

    const completed = apps.filter(a => a.status === 'CONCLUIDO').length;
    const cancelled = apps.filter(a => a.status === 'CANCELADO').length;
    const noShow = apps.filter(a => a.status === 'NAO_COMPARECEU').length;
    const totalFinishedOrFailed = completed + cancelled + noShow;

    const avgRating = reviews.length > 0
      ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
      : '5.0';

    res.json({
      todayCount: todayApps.length,
      monthAppointmentsCount: apps.length,
      completedCount: completed,
      cancelledCount: cancelled,
      noShowCount: noShow,
      attendanceRate: totalFinishedOrFailed > 0 ? Math.round((completed / totalFinishedOrFailed) * 100) : 100,
      totalClients: clients.length,
      grossRevenue: dre.totalGrossRevenue,
      totalExpenses: dre.totalExpenses,
      estimatedProfit: dre.estimatedNetResult,
      averageRating: avgRating,
      reviewsCount: reviews.length,
      dre
    });
  });

  // --- SIMULADOR DE CHAT ---
  app.post('/api/chat/simulate', async (req, res) => {
    const { message, clientPhone, clientName } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem vazia' });

    const phone = clientPhone || '5511999990000';
    const name = clientName || 'Carla (Cliente)';

    try {
      const reply = await aiService.processMessage(phone, message, name);
      res.json({
        success: true,
        reply,
        history: storage.getConversationHistory(phone)
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/chat/history/:phone', (req, res) => {
    res.json(storage.getConversationHistory(req.params.phone));
  });

  // --- PROMOÇÕES RELÂMPAGO & CAMPANHAS ---
  app.get('/api/campaigns', (req, res) => {
    res.json(storage.getCampaigns());
  });

  app.post('/api/campaigns/prepare', (req, res) => {
    const { title, rawDescription, minDelay, maxDelay } = req.body;
    if (!rawDescription) return res.status(400).json({ error: 'Descrição da promoção é obrigatória.' });
    const est = storage.getEstablishment();
    const result = campaignService.prepareCampaign(
      est.id,
      title || 'Promoção Relâmpago',
      rawDescription,
      minDelay || 25,
      maxDelay || 55
    );
    res.json({ success: true, ...result });
  });

  app.post('/api/campaigns/:id/start', async (req, res) => {
    const ok = await campaignService.startCampaign(req.params.id);
    res.json({ success: ok });
  });

  app.post('/api/campaigns/:id/cancel', (req, res) => {
    const ok = campaignService.cancelCampaign(req.params.id);
    res.json({ success: ok });
  });

  app.get('/api/campaigns/:id/status', (req, res) => {
    const status = campaignService.getCampaignStatus(req.params.id);
    res.json(status || { error: 'Campanha não encontrada' });
  });

  // --- VITRINE DE SOLUÇÕES & DEMO INTERATIVA AO VIVO ---
  app.get('/api/demo/niches', (req, res) => {
    res.json({
      niches: demoService.getNiches(),
      whatsappStatus: portalWhatsAppService.getStatus().state,
      portalWhatsApp: portalWhatsAppService.getStatus()
    });
  });

  app.post('/api/demo/start', async (req, res) => {
    const { name, phone, niche } = req.body;
    if (!phone || !niche) {
      return res.status(400).json({ success: false, error: 'Telefone e nicho de solução são obrigatórios.' });
    }

    try {
      const result = await demoService.startDemoSession(name, phone, niche);
      
      // Envia a mensagem de abertura automaticamente no WhatsApp do lead via linha conectada (Linha 2 ou Linha 1)
      let whatsappSent = false;
      let portalPhone = '5511958527119';

      if (portalWhatsAppService.isConnected()) {
        whatsappSent = await portalWhatsAppService.sendMessageToClient(result.lead.phone, result.openerMessage);
        portalPhone = portalWhatsAppService.getStatus().phoneNumber || portalPhone;
      } else if (whatsappService.isConnected()) {
        whatsappSent = await whatsappService.sendMessageToClient(result.lead.phone, result.openerMessage);
        portalPhone = whatsappService.getStatus().phoneNumber || portalPhone;
      } else {
        throw new Error('Nenhuma linha do WhatsApp está conectada no momento. Por favor, acesse /qr e escaneie o QR Code para ativar seu robô.');
      }

      if (!whatsappSent) {
        throw new Error('Não foi possível disparar a mensagem no WhatsApp. Verifique se o número informado está correto e possui WhatsApp.');
      }

      const deliveryNote = 'Mensagem de boas-vindas enviada para o seu WhatsApp! Responda por lá com texto ou áudio.';

      res.json({
        success: true,
        whatsappSent,
        deliveryNote,
        portalPhone,
        lead: result.lead,
        persona: result.persona,
        openerMessage: result.openerMessage
      });
    } catch (err: any) {
      console.error('[API Demo] Erro ao iniciar demo:', err);
      res.status(400).json({ success: false, error: err.message || 'Erro ao registrar teste da demonstração.' });
    }
  });

  app.get('/api/demo/leads', (req, res) => {
    res.json({ leads: demoService.getAllLeads() });
  });

  app.post('/api/demo/simulate-chat', async (req, res) => {
    const { phone, message, niche, name } = req.body;
    if (!message || !niche) {
      return res.status(400).json({ error: 'Mensagem e nicho são obrigatórios' });
    }

    try {
      const cleanPhone = demoService.normalizePhone(phone || '5511999999999');
      const reply = await aiService.processDemoMessage(cleanPhone, message, name || 'Visitante', niche);
      res.json({ success: true, reply });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- DASHBOARD DEMO PERSONALIZADO POR NICHO ---
  app.get('/api/demo/dashboard/:niche', (req, res) => {
    const niche = (req.params.niche || 'pizzaria') as DemoNiche;
    const data = dashboardDemoService.getDashboard(niche);
    res.json(data);
  });

  app.post('/api/demo/dashboard/:niche/expense', (req, res) => {
    const niche = (req.params.niche || 'pizzaria') as DemoNiche;
    const exp = dashboardDemoService.addExpense(niche, req.body);
    res.json({ success: true, expense: exp });
  });

  app.post('/api/demo/dashboard/:niche/client', (req, res) => {
    const niche = (req.params.niche || 'pizzaria') as DemoNiche;
    const cli = dashboardDemoService.addClient(niche, req.body);
    res.json({ success: true, client: cli });
  });

  app.post('/api/demo/dashboard/:niche/staff', (req, res) => {
    const niche = (req.params.niche || 'pizzaria') as DemoNiche;
    const stf = dashboardDemoService.addStaff(niche, req.body);
    res.json({ success: true, staff: stf });
  });

  app.post('/api/demo/dashboard/:niche/campaign', (req, res) => {
    const niche = (req.params.niche || 'pizzaria') as DemoNiche;
    const cmp = dashboardDemoService.addCampaign(niche, {
      title: req.body.title || 'Promoção Relâmpago WhatsApp',
      message: req.body.message || 'Olá {nome}!',
      targetCount: Number(req.body.targetCount) || 150,
      status: 'CONCLUIDA',
      date: new Date().toLocaleDateString('pt-BR'),
      conversionRate: '32.5%'
    });
    res.json({ success: true, campaign: cmp, message: 'Campanha registrada e disparada com sucesso em segundo plano!' });
  });

  // --- ROTA DEDICADA PARA LEITURA DE QR CODE EM ALTA RESOLUÇÃO ---
  app.get('/qr', (req, res) => {
    res.sendFile(path.resolve(process.cwd(), 'public', 'qr.html'));
  });
  app.get('/qrcode', (req, res) => {
    res.sendFile(path.resolve(process.cwd(), 'public', 'qr.html'));
  });

  return app;
}
