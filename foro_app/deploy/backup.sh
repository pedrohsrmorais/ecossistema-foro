#!/usr/bin/env bash
# Backup diário do MySQL do Foro (mysqldump consistente, comprimido, com retenção).
# Agende no cron do servidor:   15 3 * * *  /root/ecossistema-foro/foro_app/deploy/backup.sh >> /var/log/foro-backup.log 2>&1
# IMPORTANTE: copie /var/backups/foro também para FORA do servidor (S3, Backblaze, outro host) — backup só no mesmo disco não protege de perda do servidor.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

DEST="${BACKUP_DIR:-/var/backups/foro}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DEST"
FILE="$DEST/foro_$(date +%Y%m%d_%H%M%S).sql.gz"

docker compose exec -T db sh -c 'exec mysqldump --single-transaction --routines --no-tablespaces -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' | gzip > "$FILE"
[ -s "$FILE" ] || { echo "backup vazio, abortando"; rm -f "$FILE"; exit 1; }
chmod 600 "$FILE"
find "$DEST" -name 'foro_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"

# Restaurar:  gunzip -c foro_YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
