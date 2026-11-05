#!/usr/bin/env bash
# Backup 2 database (portfolio + keycloak) ra ~/backups, giữ 14 bản gần nhất.
# Chạy tay:   bash scripts/backup_db.sh
# Tự động 2h sáng mỗi ngày (crontab -e):
#   0 2 * * * cd ~/personal-web-platform && bash scripts/backup_db.sh >> ~/backups/backup.log 2>&1
#
# Khôi phục ví dụ:
#   gunzip -c ~/backups/portfolio_2026-11-05_0200.sql.gz | \
#     docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres psql -U postgres -d portfolio
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP="${KEEP:-14}"
STAMP="$(date +%F_%H%M)"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)

mkdir -p "$BACKUP_DIR"
for db in portfolio keycloak; do
  out="$BACKUP_DIR/${db}_${STAMP}.sql.gz"
  "${COMPOSE[@]}" exec -T postgres pg_dump -U postgres --clean --if-exists "$db" | gzip > "$out"
  echo "$(date '+%F %T') OK $out ($(du -h "$out" | cut -f1))"
  # Xóa bản cũ, chỉ giữ $KEEP bản mới nhất
  ls -1t "$BACKUP_DIR/${db}_"*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm -f
done
