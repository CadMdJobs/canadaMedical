#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# restore.sh — Restore PostgreSQL dump + media files
#
# Usage:
#   ./restore.sh --db backups/postgres_20240101_020000.dump
#   ./restore.sh --db backups/postgres_20240101_020000.dump \
#                --media backups/media_20240101_020000.tar.gz
#   ./restore.sh --db backups/postgres_20240101_020000.dump --yes  # skip confirm
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/canadamed}"
COMPOSE_FILE="${DEPLOY_PATH}/docker-compose.prod.yml"
ENV_FILE="${DEPLOY_PATH}/.env.production"
DB_DUMP=""
MEDIA_ARCHIVE=""
SKIP_CONFIRM=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)    DB_DUMP="$2"; shift 2 ;;
    --media) MEDIA_ARCHIVE="$2"; shift 2 ;;
    --yes)   SKIP_CONFIRM=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

[[ -z "$DB_DUMP" ]] && { echo "ERROR: --db <dump_file> is required"; exit 1; }
[[ ! -f "$DB_DUMP" ]] && { echo "ERROR: Dump file not found: ${DB_DUMP}"; exit 1; }

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ── Confirm ───────────────────────────────────────────────────────────────────
if [[ "$SKIP_CONFIRM" != "true" ]]; then
  echo ""
  echo "  ⚠️  WARNING: This will DESTROY all data in '${DB_NAME}' and replace it."
  echo "  DB dump  : ${DB_DUMP}"
  [[ -n "$MEDIA_ARCHIVE" ]] && echo "  Media    : ${MEDIA_ARCHIVE}"
  echo ""
  read -r -p "  Type 'yes' to continue: " CONFIRM
  [[ "$CONFIRM" != "yes" ]] && { echo "Aborted."; exit 0; }
fi

# ── Stop backend (prevent DB writes during restore) ───────────────────────────
log "Stopping backend + celery services ..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  stop backend celery-worker celery-beat

# ── Restore PostgreSQL ────────────────────────────────────────────────────────
log "Restoring PostgreSQL from ${DB_DUMP} ..."

# Drop & recreate database
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  exec -T db psql -U "${DB_USER}" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  exec -T db psql -U "${DB_USER}" -c "DROP DATABASE IF EXISTS ${DB_NAME};"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  exec -T db psql -U "${DB_USER}" -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

# Restore from pg_dump custom format
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  exec -T db pg_restore \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
  < "$DB_DUMP"

log "PostgreSQL restore complete."

# ── Restore media files (optional) ───────────────────────────────────────────
if [[ -n "$MEDIA_ARCHIVE" ]]; then
  [[ ! -f "$MEDIA_ARCHIVE" ]] && { log "ERROR: Media archive not found: ${MEDIA_ARCHIVE}"; exit 1; }
  log "Restoring media files from ${MEDIA_ARCHIVE} ..."

  docker run --rm \
    -v canadamed_media_files:/data \
    -v "$(realpath "$MEDIA_ARCHIVE"):/restore.tar.gz:ro" \
    alpine:3.19 \
    sh -c "rm -rf /data/* && tar xzf /restore.tar.gz -C /data"

  log "Media restore complete."
fi

# ── Restart services ──────────────────────────────────────────────────────────
log "Restarting backend services ..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  start backend celery-worker celery-beat

log "Waiting for backend health ..."
timeout 120 bash -c \
  "until docker compose -f ${COMPOSE_FILE} ps backend | grep -q 'healthy'; do sleep 5; done"

log "Restore complete and services healthy."
