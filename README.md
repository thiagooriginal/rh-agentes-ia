# 💇‍♀️ Studio Bella — Plataforma de Gestão para Salão de Beleza com IA + WhatsApp

Plataforma completa, modular e pronta para produção para gestão de **salões de beleza, barbearias, manicures, bronzeamento e estética**, integrando **recepcionista virtual inteligente 24/7 (WhatsApp + Google Gemini)**, **agenda com prevenção estrita de conflitos**, **Google Calendar**, **pesquisa de satisfação pós-atendimento**, **gestão financeira com DRE gerencial simplificada**, **controle de comissões e aluguel de cadeira**, e **deploy via Docker em VPS Hostinger**.

---

## 🌟 Visão Geral das Funcionalidades

### 1. 🤖 Recepcionista Virtual com IA (WhatsApp)
- Atendimento humanizado, natural, acolhedor e ágil (estilo WhatsApp, com emojis moderados).
- **Function Calling Rigoroso (Google Gemini)**: a IA **nunca** inventa dados. Todas as consultas de serviços, preços, horários disponíveis, confirmações, reagendamentos e cancelamentos são executadas pelo backend.
- Compreende mensagens complexas com múltiplas entidades (ex: *"Quero fazer manicure com a Priscila sexta às 14"*).
- Prevenção de conflitos e concorrência: só confirma após aprovação explícita da cliente e verificação atômica de disponibilidade.
- Transferência imediata para atendimento humano caso solicitado.

### 2. 📅 Agenda Inteligente & Concorrência
- Cálculo em tempo real de horários livres considerando:
  - Dias da semana trabalhados por cada profissional.
  - Intervalos de almoço e pausas.
  - Bloqueios, férias e folgas.
  - Duração total de cada serviço.
- Sincronização bidirecional preparada com **Google Calendar**.
- Prevenção total de double-booking (dupla reserva).

### 3. 👥 Profissionais do Piloto & Modelos Financeiros
- **Maria**: Progressiva e Tratamentos Capilares (R$ 180, 2h30) — *Modelo Percentual: 50% Profissional / 50% Salão*.
- **Joana**: Corte Feminino (R$ 60, 1h) — *Modelo Aluguel Fixo: R$ 500/mês*.
- **Priscila**: Manicure Completa (R$ 40, 1h) — *Modelo Percentual: 70% Profissional / 30% Salão*.
- **Renata**: Bronzeamento (R$ 100, 1h30) — *Modelo Aluguel Fixo: R$ 800/mês*.
- **Snapshot Financeiro Imutável**: no momento da conclusão do atendimento, a comissão é congelada, impedindo que alterações futuras mudem o histórico financeiro passado.

### 4. ⏰ Automações em Background (Worker/Scheduler)
- **Lembrete 24h antes**: aviso automático no WhatsApp.
- **Conclusão Automática**: após o término previsto do serviço (+30 minutos).
- **Pesquisa de Satisfação Pós-Atendimento**: disparo automático 30 minutos após o término solicitando nota de 1 a 5 estrelas e comentário.
- **Alerta de Avaliação Baixa**: sinalização destacada no painel caso uma cliente dê nota 1 ou 2 estrelas.
- **Despesas Recorrentes**: geração automática de contas no dia de vencimento todo mês.

### 5. 💰 Financeiro & DRE Gerencial
- Controle de **Contas a Pagar** (A Vencer, Vencidas, Pagas, Recorrentes).
- Registro de **Receitas** automáticas provenientes de atendimentos concluídos e aluguel de cadeiras.
- **DRE Gerencial Simplificada**:
  - (+) Receitas de Serviços
  - (+) Aluguel de Cadeiras
  - (-) Repasse aos Profissionais
  - (-) Despesas Operacionais (Aluguel, Água, Luz, Internet, Produtos)
  - **(=) Resultado Líquido Estimado**

### 6. 📊 Painel Web Administrativo Moderno
- Dashboard com KPIs em tempo real e gráficos interativos (Chart.js).
- Agenda visual com filtros combinados (Data, Profissional, Status).
- Simulador de Atendimento embutido para testar a IA diretamente pelo navegador.
- Gestão completa de Profissionais, Serviços, Clientes e Avaliações.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- **Node.js v20+** instalado.

### 1. Iniciar o projeto
No terminal, execute:
```powershell
npm.cmd run dev
```
ou em produção:
```powershell
npm.cmd start
```

### 2. Acessar o Painel Web
Abra seu navegador em:
👉 **[http://localhost:3000](http://localhost:3000)**

### 3. Configurar a Chave do Gemini
1. Obtenha uma chave gratuita no [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Cole a chave na aba **Configurações** do Painel Web (ou no arquivo `.env` no campo `GEMINI_API_KEY=`).

### 4. Conectar o WhatsApp
1. Na aba **Conexão WhatsApp** do painel (ou no terminal), aponte a câmera do WhatsApp para escanear o QR Code.

---

## 🐳 Deploy na VPS Hostinger (Docker & Docker Compose)

A aplicação já inclui `Dockerfile`, `docker-compose.yml`, `nginx.conf`, script de deploy e rotina de backup.

### 1. Conectar via SSH na sua VPS Hostinger:
```bash
ssh root@IP_DA_SUA_VPS
```

### 2. Clonar o projeto ou transferir os arquivos para a VPS:
```bash
cd /var/www/
git clone <URL_DO_REPOSITORIO> salao-app
cd salao-app
```

### 3. Configurar as variáveis de ambiente:
```bash
cp .env.example .env
nano .env # Insira sua GEMINI_API_KEY e configurações
```

### 4. Executar o script de deploy automatizado:
```bash
chmod +x deploy.sh backup.sh
./deploy.sh
```

### 5. Acessar em produção:
- `http://IP_DA_SUA_VPS:3000` ou configure seu domínio/subdomínio apontando para a porta 3000 via Nginx (`nginx.conf`).

### 6. Backups automáticos:
Para agendar o backup diário às 03:00 da manhã no Linux crontab:
```bash
crontab -e
# Adicione:
0 3 * * * /var/www/salao-app/backup.sh >> /var/www/salao-app/backups/backup.log 2>&1
```

---

## 📂 Arquitetura dos Arquivos

```
├── data/
│   └── database.json          # Banco de dados relacional multi-tenant estruturado
├── public/                    # Painel Web moderno (Mobile-first Tailwind + Chart.js)
│   ├── index.html
│   └── app.js
├── src/
│   ├── config.ts              # Configurações de ambiente
│   ├── index.ts               # Ponto de entrada do sistema
│   ├── server.ts              # Gateway de API REST Express + Auth JWT + Rotas
│   ├── types.ts               # Schema de tipos multi-tenant enterprise
│   ├── db/
│   │   └── storage.ts         # Motor de persistência, cálculo de slots e DRE
│   └── services/
│       ├── ai.ts              # Atendente IA com Function Calling determinístico
│       ├── calendar.ts        # Integração e abstração Google Calendar
│       ├── scheduler.ts       # Worker de tarefas em background (lembretes, pesquisa)
│       └── whatsapp.ts        # Adaptador WhatsApp Baileys com reconexão
├── Dockerfile                 # Multi-stage Docker para produção enxuta
├── docker-compose.yml         # Orquestração de containers com volumes persistentes
├── nginx.conf                 # Configuração de Proxy Reverso Nginx SSL
├── deploy.sh                  # Script de instalação 1-clique para VPS Hostinger
├── backup.sh                  # Script de backup diário com retenção
└── package.json
```
