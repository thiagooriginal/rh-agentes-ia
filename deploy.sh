#!/bin/bash
# ========================================================
# Script de Deploy Automático na VPS Hostinger (Ubuntu/Debian)
# ========================================================

set -e

echo "🚀 Iniciando deploy da Plataforma de Gestão com IA para Salões..."

# 1. Garante que o Docker e Docker Compose estão instalados
if ! command -v docker &> /dev/null; then
    echo "📦 Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
fi

# 2. Cria diretórios de persistência se não existirem
mkdir -p data auth_info_baileys auth_info_portal backups

# 3. Sobe os containers
echo "🐳 Construindo e iniciando containers com Docker Compose..."
docker compose down || true
docker compose up -d --build

echo ""
echo "✅ Deploy concluído com sucesso!"
echo "🌐 Acesse: http://IP_DA_SUA_VPS:3000"
echo "Para verificar os logs do WhatsApp/IA: docker compose logs -f salao-app"
