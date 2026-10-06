#!/bin/bash
# ========================================================
# Script de Backup Diário Automático
# ========================================================

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_salao_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "💾 Gerando backup dos dados em $BACKUP_FILE..."
tar -czf "$BACKUP_FILE" data auth_info_baileys .env 2>/dev/null || true

# Mantém apenas os últimos 15 backups para economizar espaço em disco
find "$BACKUP_DIR" -type f -name "backup_salao_*.tar.gz" -mtime +15 -delete

echo "✅ Backup finalizado com sucesso: $BACKUP_FILE"
