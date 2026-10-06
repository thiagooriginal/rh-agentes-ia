import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config.js';
import { storage } from './db/storage.js';
import { aiService } from './services/ai.js';
import { whatsappService } from './services/whatsapp.js';

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  // --- API STATUS & WHATSAPP ---
  app.get('/api/status', (req, res) => {
    res.json({
      whatsapp: whatsappService.getStatus(),
      hasGeminiApiKey: aiService.hasApiKey(),
      companyName: storage.getSettings().companyName,
      secretaryName: storage.getSettings().secretaryName
    });
  });

  app.post('/api/whatsapp/connect', async (req, res) => {
    try {
      await whatsappService.start();
      res.json({ success: true, message: 'Tentando conectar ao WhatsApp...' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/whatsapp/disconnect', async (req, res) => {
    try {
      await whatsappService.disconnect();
      res.json({ success: true, message: 'Desconectado com sucesso' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- API CONFIGURAÇÕES ---
  app.get('/api/settings', (req, res) => {
    const settings = storage.getSettings();
    res.json({
      ...settings,
      hasGeminiApiKey: aiService.hasApiKey()
    });
  });

  app.put('/api/settings', (req, res) => {
    const { geminiApiKey, ...otherSettings } = req.body;
    
    if (geminiApiKey && typeof geminiApiKey === 'string' && geminiApiKey.trim().length > 0) {
      aiService.initClient(geminiApiKey.trim());
    }

    const updated = storage.updateSettings(otherSettings);
    res.json({
      success: true,
      settings: updated,
      hasGeminiApiKey: aiService.hasApiKey()
    });
  });

  // --- API SERVIÇOS ---
  app.get('/api/services', (req, res) => {
    res.json(storage.getServices());
  });

  app.post('/api/services', (req, res) => {
    const { name, description, durationMinutes, price } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
    }
    const created = storage.addService({
      name,
      description: description || '',
      durationMinutes: Number(durationMinutes) || 30,
      price: Number(price) || 0
    });
    res.json({ success: true, service: created });
  });

  app.put('/api/services/:id', (req, res) => {
    const updated = storage.updateService(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }
    res.json({ success: true, service: updated });
  });

  app.delete('/api/services/:id', (req, res) => {
    const ok = storage.deleteService(req.params.id);
    res.json({ success: ok });
  });

  // --- API AGENDAMENTOS ---
  app.get('/api/appointments', (req, res) => {
    const { date } = req.query;
    res.json(storage.getAppointments(date as string));
  });

  app.post('/api/appointments', (req, res) => {
    const { clientName, clientPhone, date, time, service, notes } = req.body;
    if (!clientName || !clientPhone || !date || !time || !service) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const app = storage.addAppointment({
      clientName,
      clientPhone,
      date,
      time,
      service,
      notes
    });
    res.json({ success: true, appointment: app });
  });

  app.patch('/api/appointments/:id/status', (req, res) => {
    const { status } = req.body;
    const ok = storage.updateAppointmentStatus(req.params.id, status);
    res.json({ success: ok });
  });

  // --- SIMULADOR DE CHAT WEB ---
  app.post('/api/chat/simulate', async (req, res) => {
    const { message, clientPhone, clientName } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Mensagem não informada' });
    }
    const phone = clientPhone || 'simulador_web_5511999990000';
    const name = clientName || 'Visitante Web';

    try {
      const reply = await aiService.processMessage(phone, message, name);
      res.json({
        success: true,
        reply,
        history: storage.getConversationHistory(phone)
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/chat/history/:phone', (req, res) => {
    res.json(storage.getConversationHistory(req.params.phone));
  });

  return app;
}
