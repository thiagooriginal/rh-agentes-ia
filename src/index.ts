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
  const primaryPort = config.port || 3000;
  const server = app.listen(primaryPort, '0.0.0.0', () => {
    console.log(`\n🌐 Servidor Web ativo em: http://0.0.0.0:${primaryPort}`);
    console.log(`🌐 Painel Administrativo: http://0.0.0.0:${primaryPort}`);
    console.log(`🌐 Vitrine / Portal de IAs: http://0.0.0.0:${primaryPort}/vitrine.html`);
    console.log(`⚙️  Status do Gemini: ${aiService.hasApiKey() ? '✅ Chave configurada' : '⚠️ Chave não informada (adicione no .env ou no Painel Web)'}`);
  });

  server.on('error', (err: any) => {
    console.error(`[Server] Erro no servidor na porta ${primaryPort}:`, err);
  });

  // Inicializa worker de tarefas e automações em background
  schedulerService.start(60000);

  // Inicializa Linha 1 e Linha 2 simultaneamente em paralelo
  console.log('\n⏳ Inicializando Linhas do WhatsApp (Salão e Portal)...');
  Promise.allSettled([
    whatsappService.start().catch(err => console.error('❌ Erro ao iniciar WhatsApp do Salão:', err)),
    portalWhatsAppService.start().catch(err => console.error('❌ Erro ao iniciar WhatsApp do Portal das IAs:', err))
  ]);
}

main().catch(console.error);
