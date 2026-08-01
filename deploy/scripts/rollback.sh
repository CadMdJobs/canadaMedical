#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rollback.sh — Roll back to the previous Docker image tag
#
# Usage:
#   ./rollback.sh                        # roll back to 'previous' tag
#   ./rollback.sh --tag abc1234          # roll back to a specific git SHA tag
#   ./rollback.sh --list                 # list available image tags
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/canadamed}"
COMPOSE_FILE="${DEPLOY_PATH}/docker-compose.prod.yml"
ENV_FILE="${DEPLOY_PATH}/.env.production"
REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_REPO="${IMAGE_REPO:-}"
TARGET_TAG=""
LIST_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)  TARGET_TAG="$2"; shift 2 ;;
    --list) LIST_ONLY=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Load env
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

[[ -z "$IMAGE_REPO" ]] && { echo "ERROR: IMAGE_REPO not set in ${ENV_FILE}"; exit 1; }

if [[ "$LIST_ONLY" == "true" ]]; then
  log "Available backend image tags:"
  docker images "${REGISTRY}/${IMAGE_REPO}/canadamed-backend" \
    --format "{{.Tag}}\t{{.CreatedSince}}\t{{.Size}}" | head -20
  exit 0
fi

# If no tag specified, find the second-most-recent image (i.e. before latest)
if [[ -z "$TARGET_TAG" ]]; then
  TARGET_TAG=$(docker images "${REGISTRY}/${IMAGE_REPO}/canadamed-backend" \
    --format "{{.Tag}}" | grep -v "latest" | head -2 | tail -1)
  [[ -z "$TARGET_TAG" ]] && { log "ERROR: No previous tag found. Specify --tag explicitly."; exit 1; }
fi

log "Rolling back to tag: ${TARGET_TAG}"
echo ""
read -r -p "Confirm rollback to ${TARGET_TAG}? (yes/no): " CONFIRM
[[ "$CONFIRM" != "yes" ]] && { echo "Aborted."; exit 0; }

# ── Deploy the target tag ─────────────────────────────────────────────────────
log "Deploying ${TARGET_TAG} ..."
IMAGE_TAG="$TARGET_TAG" \
REGISTRY="$REGISTRY" \
IMAGE_REPO="$IMAGE_REPO" \
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    up -d --no-build --remove-orphans

# ── Wait for health ───────────────────────────────────────────────────────────
log "Waiting for backend healthcheck ..."
timeout 120 bash -c \
  "until docker compose -f ${COMPOSE_FILE} ps backend | grep -q 'healthy'; do sleep 5; done"

log "Rollback to ${TARGET_TAG} complete and services healthy."
