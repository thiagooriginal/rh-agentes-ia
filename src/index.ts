import { config } from './config.js';
import { createServer } from './server.js';
import { whatsappService } from './services/whatsapp.js';
import { aiService } from './services/ai.js';

async function main() {
  console.log('====================================================');
  console.log(`🤖 SECRETÁRIA VIRTUAL - ${config.secretaryName.toUpperCase()}`);
  console.log(`🏢 Empresa: ${config.companyName}`);
  console.log('====================================================');

  // Inicializa servidor Web
  const app = createServer();
  app.listen(config.port, () => {
    console.log(`\n🌐 Painel de Gestão aberto em: http://localhost:${config.port}`);
    console.log(`⚙️  Status do Gemini: ${aiService.hasApiKey() ? '✅ Chave configurada' : '⚠️ Chave não informada (adicione no .env ou no Painel Web)'}`);
  });

  // Inicia conexão do WhatsApp
  console.log('\n⏳ Inicializando cliente do WhatsApp...');
  try {
    await whatsappService.start();
  } catch (err) {
    console.error('❌ Erro ao iniciar WhatsApp:', err);
  }
}

main().catch(console.error);
