# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Builder: compile C extensions, install wheels into a prefix
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

# Build-time system deps (gcc, headers) — NOT carried into final image
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY requirements.txt .

# Install everything into /install — clean prefix, no system pollution
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Runtime: minimal image, no compiler toolchain
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Runtime-only native libs (libpq for psycopg2, libjpeg/zlib for Pillow)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libjpeg62-turbo \
    zlib1g \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user — never run app code as root
RUN groupadd --gid 1001 appgroup \
    && useradd --uid 1001 --gid appgroup --no-create-home --shell /sbin/nologin appuser

WORKDIR /app

# Pull the compiled packages from builder
COPY --from=builder /install /usr/local

# Copy source — owned by root so the non-root user cannot modify it (read-only code)
COPY --chown=root:root . .

# Directories the app writes to must be writable by appuser
RUN mkdir -p /app/media /app/staticfiles /app/logs \
    && chown -R appuser:appgroup /app/media /app/staticfiles /app/logs \
    && chmod -R 750 /app/media /app/staticfiles /app/logs

# entrypoint must be executable
RUN chmod +x /app/entrypoint.sh

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["daphne"]
