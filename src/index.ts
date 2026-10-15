import { config } from './config.js';
import { createServer } from './server.js';
import { whatsappService } from './services/whatsapp.js';
import { portalWhatsAppService } from './services/portal-whatsapp.js';
import { aiService } from './services/ai.js';
import { schedulerService } from './services/scheduler.js';
import { storage } from './db/storage.js';

async function main() {
  const est = storage.getEstablishment();

  console.log('====================================================');
  console.log(`✨ PLATAFORMA DE GESTÃO PARA SALÃO DE BELEZA COM IA`);
  console.log(`🏢 Estabelecimento: ${est.name}`);
  console.log(`🤖 Recepcionista Virtual: ${est.secretaryName}`);
  console.log(`🌐 Portal RH de Agentes IA: Ativo`);
  console.log('====================================================');

  // Inicializa servidor Web API & Dashboard
  const app = createServer();
  app.listen(config.port, () => {
    console.log(`\n🌐 Painel Administrativo disponível em: http://localhost:${config.port}`);
    console.log(`🌐 Vitrine / Portal de IAs: http://localhost:${config.port}/vitrine.html`);
    console.log(`⚙️  Status do Gemini: ${aiService.hasApiKey() ? '✅ Chave configurada' : '⚠️ Chave não informada (adicione no .env ou no Painel Web)'}`);
  });

  // Inicializa worker de tarefas e automações em background
  schedulerService.start(60000);

  // Inicializa Linha 1: WhatsApp do Salão de Beleza
  console.log('\n⏳ Inicializando WhatsApp do Salão (Linha 1)...');
  try {
    await whatsappService.start();
  } catch (err) {
    console.error('❌ Erro ao iniciar WhatsApp do Salão:', err);
  }

  // Inicializa Linha 2: WhatsApp do Portal das IAs (Vitrine)
  console.log('\n⏳ Inicializando WhatsApp do Portal das IAs (Linha 2)...');
  try {
    await portalWhatsAppService.start();
  } catch (err) {
    console.error('❌ Erro ao iniciar WhatsApp do Portal das IAs:', err);
  }
}

main().catch(console.error);
