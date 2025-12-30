#!/bin/bash
# Backup automático de PostgreSQL
# Ejecutar diariamente a las 2 AM: crontab -e
# 0 2 * * * /path/to/backup.sh

set -e

# Configuración
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.sql"
RETENTION_DAYS=30

# Crear directorio si no existe
mkdir -p $BACKUP_DIR

# Realizar backup
echo "🔄 Iniciando backup de base de datos..."
pg_dump $DATABASE_URL > $BACKUP_FILE

# Comprimir
gzip $BACKUP_FILE
echo "✅ Backup completado: ${BACKUP_FILE}.gz"

# Limpiar backups antiguos
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "🧹 Backups antiguos eliminados (>$RETENTION_DAYS días)"

# Verificar tamaño
SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
echo "📦 Tamaño del backup: $SIZE"
