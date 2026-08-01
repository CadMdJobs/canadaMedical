"""
Lightweight health check endpoint.
Checks DB + Redis connectivity. Returns 200 or 503.
Used by Docker HEALTHCHECK, load balancers, and uptime monitors.
"""
import time

from django.db import connection, OperationalError as DbError
from django.http import JsonResponse


def health_check(request):
    checks = {}
    status = 200

    # ── Database ──────────────────────────────────────────────────────────────
    try:
        t0 = time.monotonic()
        connection.ensure_connection()
        checks["db"] = {"status": "ok", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except DbError as exc:
        checks["db"] = {"status": "error", "detail": str(exc)}
        status = 503

    # ── Redis ─────────────────────────────────────────────────────────────────
    try:
        from django.conf import settings
        import redis as redis_lib

        redis_url = getattr(settings, "CELERY_BROKER_URL", "") or ""
        if redis_url.startswith("redis"):
            t0 = time.monotonic()
            r = redis_lib.from_url(redis_url, socket_connect_timeout=2)
            r.ping()
            checks["redis"] = {"status": "ok", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
        else:
            checks["redis"] = {"status": "skipped", "detail": "in-memory broker"}
    except Exception as exc:
        checks["redis"] = {"status": "error", "detail": str(exc)}
        status = 503

    return JsonResponse(
        {"status": "ok" if status == 200 else "degraded", "checks": checks},
        status=status,
    )
