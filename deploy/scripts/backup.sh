#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup.sh — Production backup: PostgreSQL dump + media files
#
# Schedule via cron (as deploy user):
#   0 2 * * * /opt/canadamed/deploy/scripts/backup.sh >> /var/log/canadamed-backup.log 2>&1
#
# Backups are stored in /opt/canadamed/backups/ and optionally uploaded to S3.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/canadamed}"
BACKUP_DIR="${DEPLOY_PATH}/backups"
COMPOSE_FILE="${DEPLOY_PATH}/docker-compose.prod.yml"
ENV_FILE="${DEPLOY_PATH}/.env.production"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Load env
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

mkdir -p "$BACKUP_DIR"

# ── PostgreSQL dump ───────────────────────────────────────────────────────────
log "Starting PostgreSQL backup ..."
DB_BACKUP="${BACKUP_DIR}/postgres_${TIMESTAMP}.dump"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  exec -T db pg_dump \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --format=custom \
    --compress=9 \
  > "$DB_BACKUP"

log "PostgreSQL dump: ${DB_BACKUP} ($(du -sh "$DB_BACKUP" | cut -f1))"

# ── Media files archive ───────────────────────────────────────────────────────
log "Archiving media files ..."
MEDIA_BACKUP="${BACKUP_DIR}/media_${TIMESTAMP}.tar.gz"

docker run --rm \
  -v canadamed_media_files:/data:ro \
  -v "${BACKUP_DIR}:/backup" \
  alpine:3.19 \
  tar czf "/backup/media_${TIMESTAMP}.tar.gz" -C /data .

log "Media archive: ${MEDIA_BACKUP} ($(du -sh "$MEDIA_BACKUP" | cut -f1))"

# ── Upload to S3 (optional) ───────────────────────────────────────────────────
if [[ -n "${AWS_STORAGE_BUCKET_NAME:-}" && -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
  log "Uploading backups to S3 ..."
  S3_PREFIX="s3://${AWS_STORAGE_BUCKET_NAME}/backups/${TIMESTAMP}"

  docker run --rm \
    -e AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
    -e AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
    -e AWS_DEFAULT_REGION="${AWS_S3_REGION_NAME:-ca-central-1}" \
    -v "${BACKUP_DIR}:/backup:ro" \
    amazon/aws-cli:latest \
    s3 cp "/backup/postgres_${TIMESTAMP}.dump" "${S3_PREFIX}/postgres.dump" \
    --storage-class STANDARD_IA

  docker run --rm \
    -e AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
    -e AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
    -e AWS_DEFAULT_REGION="${AWS_S3_REGION_NAME:-ca-central-1}" \
    -v "${BACKUP_DIR}:/backup:ro" \
    amazon/aws-cli:latest \
    s3 cp "/backup/media_${TIMESTAMP}.tar.gz" "${S3_PREFIX}/media.tar.gz" \
    --storage-class STANDARD_IA

  log "S3 upload complete: ${S3_PREFIX}"
fi

# ── Prune old local backups ───────────────────────────────────────────────────
log "Pruning backups older than ${RETENTION_DAYS} days ..."
find "$BACKUP_DIR" -name "*.dump" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +"$RETENTION_DAYS" -delete

log "Backup complete. Files in ${BACKUP_DIR}:"
ls -lh "$BACKUP_DIR" | tail -10
