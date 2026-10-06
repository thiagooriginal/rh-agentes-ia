# 🤖 Secretária Virtual para WhatsApp com Google Gemini

Uma assistente executiva e secretária virtual inteligente para **WhatsApp**, equipada com **Google Gemini** para atendimento humanizado, resposta a dúvidas frequentes, consulta de serviços e **agendamento automático de horários**.

---

## ✨ Principais Funcionalidades

- **Atendimento Humanizado no WhatsApp**: Responde clientes 24/7 com tom profissional e simpático.
- **Integração com Google Gemini**: Compreensão de linguagem natural e raciocínio avançado com Function Calling.
- **Agendamento Inteligente**:
  - Consulta serviços disponíveis e preços.
  - Verifica disponibilidade de horários vagos.
  - Registra o agendamento no sistema com nome, data, hora e serviço.
  - Permite ao cliente listar e cancelar agendamentos.
- **Painel de Controle Web Completo (`http://localhost:3000`)**:
  - 📲 **Conexão WhatsApp**: Exibição do QR Code em tempo real no navegador ou terminal.
  - 📅 **Gestão de Agendamentos**: Visualização de status (confirmado, concluído, cancelado).
  - 💼 **Catálogo de Serviços**: Adicione, altere ou remova serviços e valores.
  - 💬 **Simulador de Conversa**: Teste as respostas e agendamentos direto pelo navegador sem gastar mensagens.
  - ⚙️ **Configurações**: Altere o nome da secretária, da clínica/empresa, horários e chave da API Gemini.

---

## 🚀 Como Iniciar o Projeto

### 1. Pré-requisitos
- **Node.js** (versão 18 ou superior) instalado.

### 2. Configurar a chave do Google Gemini (Gratuita)
Obtenha uma chave gratuita de API no [Google AI Studio](https://aistudio.google.com/app/apikey).

Você pode adicionar a chave diretamente no arquivo `.env`:
```env
GEMINI_API_KEY=sua_chave_do_gemini_aqui
PORT=3000
SECRETARY_NAME=Sofia
COMPANY_NAME=Consultoria & Atendimento
```
*(Ou também poderá colar a chave diretamente na aba de **Configurações** do Painel Web).*

### 3. Executar o Projeto
No terminal do projeto, execute:
```bash
npm run dev
```
ou no Windows PowerShell:
```powershell
npm.cmd run dev
```

### 4. Conectar o WhatsApp
1. Acesse o painel em **`http://localhost:3000`**.
2. Abra o WhatsApp no celular:
   - Toque em **Aparelhos Conectados** > **Conectar um aparelho**.
   - Aponte a câmera para o **QR Code** exibido no navegador ou no terminal.
3. Pronto! A secretária virtual estará conectada e pronta para atender seus clientes.

---

## 📂 Estrutura do Código

```
├── data/
│   └── database.json          # Persistência de agendamentos, serviços e histórico
├── public/                    # Painel Web administrativo
│   ├── index.html
│   └── app.js
├── src/
│   ├── config.ts              # Variáveis de ambiente e parâmetros
│   ├── index.ts               # Ponto de entrada do sistema
│   ├── server.ts              # API REST Express e rotas do painel
│   ├── types.ts               # Definições de tipos TypeScript
│   ├── db/
│   │   └── storage.ts         # Gerenciamento de banco de dados e horários
│   └── services/
│       ├── ai.ts              # Integração Gemini + Function Calling (tools)
│       └── whatsapp.ts        # Conexão Baileys WhatsApp com QR Code
├── .env                       # Arquivo de credenciais locais
└── package.json
```
