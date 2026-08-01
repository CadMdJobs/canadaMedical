#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# entrypoint.sh — Production container entrypoint for the Django/Daphne backend
#
# Responsibilities:
#   - Wait for PostgreSQL to accept connections before proceeding
#   - Wait for Redis to be reachable
#   - Run migrations idempotently
#   - Collect static files
#   - Seed subscription plans (idempotent management commands)
#   - Hand off to either Daphne (web) or Celery (worker/beat)
#
# CMD variants:
#   CMD ["daphne"]        → web server (default)
#   CMD ["worker"]        → celery worker
#   CMD ["beat"]          → celery beat scheduler
#   CMD ["shell"]         → django shell (debug/maintenance)
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ── Colour helpers (safe for non-TTY) ────────────────────────────────────────
log()  { printf '[entrypoint] %s\n' "$*"; }
die()  { printf '[entrypoint] FATAL: %s\n' "$*" >&2; exit 1; }

# ── Wait for PostgreSQL ───────────────────────────────────────────────────────
wait_for_postgres() {
    log "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT:-5432} ..."
    MAX=60
    i=0
    until python -c "
import sys, psycopg2, os
try:
    psycopg2.connect(
        dbname=os.environ['DB_NAME'],
        user=os.environ['DB_USER'],
        password=os.environ['DB_PASSWORD'],
        host=os.environ['DB_HOST'],
        port=os.environ.get('DB_PORT', '5432'),
        connect_timeout=3,
    )
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
        i=$((i+1))
        if [ "$i" -ge "$MAX" ]; then
            # Print why, rather than just that it timed out. The connection
            # error is swallowed above so the loop stays quiet while retrying,
            # which otherwise leaves "did not become available" as the only
            # clue — and that points at the wrong container when the real
            # fault is, say, an auth mismatch inside pgBouncer.
            log "Last connection error was:"
            python -c "
import psycopg2, os
try:
    psycopg2.connect(
        dbname=os.environ['DB_NAME'], user=os.environ['DB_USER'],
        password=os.environ['DB_PASSWORD'], host=os.environ['DB_HOST'],
        port=os.environ.get('DB_PORT', '5432'), connect_timeout=3,
    )
except Exception as exc:
    print(f'  {type(exc).__name__}: {exc}')
" || true
            die "PostgreSQL did not become available after ${MAX} seconds."
        fi
        sleep 1
    done
    log "PostgreSQL is ready."
}

# ── Wait for Redis ────────────────────────────────────────────────────────────
wait_for_redis() {
    if [ -z "${REDIS_URL:-}" ]; then
        log "REDIS_URL not set — skipping Redis readiness check."
        return
    fi
    log "Waiting for Redis at ${REDIS_URL} ..."
    MAX=30
    i=0
    until python -c "
import sys, redis, os
try:
    r = redis.from_url(os.environ['REDIS_URL'], socket_connect_timeout=2)
    r.ping()
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
        i=$((i+1))
        if [ "$i" -ge "$MAX" ]; then
            die "Redis did not become available after ${MAX} seconds."
        fi
        sleep 1
    done
    log "Redis is ready."
}

# ── Django startup tasks (web process only, not workers) ─────────────────────
run_web_startup() {
    log "Running database migrations ..."
    python manage.py migrate --noinput

    # No --clear: wiping and rewriting every file on each boot is slow and buys
    # nothing here, since the volume is only ever written by this step.
    log "Collecting static files ..."
    python manage.py collectstatic --noinput

    log "Seeding subscription plans ..."
    timeout 60 python manage.py setup_plans || log "setup_plans failed (non-fatal, may already exist)"

    # Skipped entirely without a key: the command would otherwise reach out to
    # the Stripe API and can hang there rather than failing, and a hang here
    # blocks the server from ever starting — `||` only catches a non-zero exit.
    # The timeout is a second line of defence for the same reason.
    if [ -n "${STRIPE_SECRET_KEY:-}" ]; then
        log "Syncing Stripe plans ..."
        timeout 120 python manage.py create_stripe_plans \
            || log "create_stripe_plans failed (non-fatal — check STRIPE_SECRET_KEY)"
    else
        log "STRIPE_SECRET_KEY not set — skipping Stripe plan sync."
    fi
}

# ── Celery healthcheck file (used by Docker HEALTHCHECK for workers) ──────────
touch_celery_heartbeat() {
    # Celery will write a heartbeat file every 10s via --heartbeat-interval
    # The Docker healthcheck reads this file's mtime.
    mkdir -p /tmp/celery
}

# ─────────────────────────────────────────────────────────────────────────────
# Main dispatch
# ─────────────────────────────────────────────────────────────────────────────
CMD="${1:-daphne}"

case "$CMD" in
    daphne)
        wait_for_postgres
        wait_for_redis
        run_web_startup
        log "Starting Daphne ASGI server ..."
        exec python -m daphne \
            -b 0.0.0.0 \
            -p 8000 \
            --access-log - \
            --proxy-headers \
            core.asgi:application
        ;;

    worker)
        wait_for_postgres
        wait_for_redis
        touch_celery_heartbeat
        log "Starting Celery worker ..."
        exec celery -A core worker \
            --loglevel=info \
            --concurrency="${CELERY_CONCURRENCY:-2}" \
            --max-tasks-per-child=100 \
            --heartbeat-interval=10 \
            -E
        ;;

    beat)
        wait_for_postgres
        wait_for_redis
        log "Starting Celery beat scheduler ..."
        exec celery -A core beat \
            --loglevel=info \
            --scheduler django_celery_beat.schedulers:DatabaseScheduler
        ;;

    shell)
        wait_for_postgres
        exec python manage.py shell
        ;;

    *)
        log "Unknown CMD '${CMD}'. Executing as raw command ..."
        exec "$@"
        ;;
esac
