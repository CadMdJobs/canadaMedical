# Coolify Deployment Guide

Deploy target: a fresh VPS running Coolify, building images on the server from
this repo. Coolify handles TLS, routing and auto-deploy, so the host-Nginx and
Certbot steps in the GitHub-Actions flow do not apply here.

Compose file: `docker-compose.coolify.yml`

---

## 1. DNS

Point two records at the new VPS IP **before** creating the resource, so
Coolify can issue certificates on the first deploy.

| Type | Name  | Value        |
| ---- | ----- | ------------ |
| A    | `@`   | new VPS IP   |
| A    | `www` | new VPS IP   |
| A    | `api` | new VPS IP   |

If the domain sits behind Cloudflare, keep the proxy (orange cloud) **off**
until certificates are issued, then turn it back on with SSL mode "Full
(strict)".

---

## 2. Create the resource

Coolify → Project → **New Resource → Docker Compose**

- Source: this Git repository, branch `main`
- Compose file path: `docker-compose.coolify.yml`
- Build server: the VPS itself

---

## 3. Domains

Coolify lists every service in the compose file. Set a domain on exactly two
of them — the rest stay internal:

| Service    | Domain                     | Port |
| ---------- | -------------------------- | ---- |
| `frontend` | `https://canadianmdjobs.com`      | 80   |
| `backend`  | `https://api.canadianmdjobs.com`  | 8000 |

Leave `db`, `redis`, `pgbouncer`, `celery-worker` and `celery-beat` with no
domain. They must not be reachable from the internet.

---

## 4. Environment variables

Paste into Coolify's environment editor. Generate the secrets first:

```bash
# SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(64))"

# DB_PASSWORD and REDIS_PASSWORD (run twice)
openssl rand -base64 32 | tr -d '/+=' | head -c 40
```

> Avoid `/`, `+` and `=` in the passwords. They travel through a Redis URL and
> a pgBouncer md5 hash, where unescaped special characters cause connection
> failures that are tedious to diagnose.

```ini
# ── Django core ──────────────────────────────────────────────────────────────
SECRET_KEY=<generated>
DEBUG=False
ALLOWED_HOSTS=api.canadianmdjobs.com,canadianmdjobs.com,www.canadianmdjobs.com
FRONTEND_URL=https://canadianmdjobs.com
CORS_EXTRA_ORIGIN=
SECURE_SSL=True
LOG_LEVEL=WARNING

# Obfuscates the Django admin path. Optional but recommended in production.
DJANGO_ADMIN_URL=admin

# ── Database ─────────────────────────────────────────────────────────────────
DB_NAME=canadian_med_db
DB_USER=canadamed
DB_PASSWORD=<generated>
DB_CONN_MAX_AGE=0

# ── Redis ────────────────────────────────────────────────────────────────────
REDIS_PASSWORD=<generated>

# ── Celery ───────────────────────────────────────────────────────────────────
CELERY_CONCURRENCY=2

# ── Stripe ───────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...     # fill in after step 7

# ── Resend (transactional email) ─────────────────────────────────────────────
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@canadianmdjobs.com
RESEND_TEST_EMAIL=

# ── AWS S3 (optional — omit entirely to store uploads on the local volume) ───
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_STORAGE_BUCKET_NAME=
AWS_S3_REGION_NAME=ca-central-1
```

`DB_HOST`, `DB_PORT` and `REDIS_URL` are **not** listed above on purpose — the
compose file sets them to the internal service names. Do not override them.

### Build variables (this one bites)

These two must be marked **Build Variable** in Coolify, not ordinary
environment variables:

```ini
VITE_API_URL=https://api.canadianmdjobs.com
VITE_WS_URL=wss://api.canadianmdjobs.com
```

Vite inlines them into the JS bundle at build time. As plain runtime env vars
they never reach the build, and `src/lib/api.ts` throws on boot in production
when `VITE_API_URL` is missing — the site loads to a blank page.

Changing either value later requires a rebuild, not just a restart.

---

## 5. Deploy

Hit **Deploy**. First run takes roughly 5–10 minutes: it builds both images,
then `entrypoint.sh` waits for Postgres and Redis, runs migrations, collects
static files and seeds the subscription plans.

Watch the `backend` logs for `Starting Daphne ASGI server` — that means startup
finished cleanly.

Verify:

```bash
curl https://api.canadianmdjobs.com/api/health/
# {"status":"ok","checks":{"db":{...},"redis":{...}}}
```

---

## 6. Create the admin user

The database starts empty, so there is no admin account yet. In Coolify open a
terminal on the `backend` container (or SSH to the VPS and `docker exec` into
it):

```bash
python manage.py createsuperuser
```

Then log in at `https://api.canadianmdjobs.com/admin/` — or at whatever path
`DJANGO_ADMIN_URL` is set to.

---

## 7. External services

A new domain means these three need updating, or payments and email break
silently.

**Stripe webhook** — Dashboard → Developers → Webhooks → add endpoint:

```
https://api.canadianmdjobs.com/api/v1/subscriptions/webhook/
```

Copy the new signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy the
backend.

**Resend** — verify the new sending domain and add the SPF/DKIM records it
gives you. Until that is done every outbound email fails, including password
resets and the welcome mail.

**AWS S3** — if used, add the new domain to the bucket's CORS policy.

---

## Notes

### WebSockets

In-app notifications run over Django Channels at `/ws/`. Coolify's Traefik
forwards WebSocket upgrades without extra configuration, but it is worth
confirming after the first deploy: open the site, log in, and check the browser
console for a successful `wss://api.canadianmdjobs.com/ws/notifications/` connection.

### Celery Beat must stay at one replica

`celery-beat` is the scheduler. Running two of them means every periodic task
(stats refresh, token flush, subscription expiry) fires twice. Never scale this
service above 1 replica in Coolify.

### Persistent data

Uploaded resumes and logos live in the `media_files` volume, and the database
in `postgres_data`. Both survive redeploys. They do **not** survive deleting the
resource in Coolify — set up backups before the platform carries real data.

### The other compose files

`docker-compose.prod.yml` targets the host-Nginx + GitHub Actions setup and is
kept for reference. Deploying both against the same VPS would collide on ports
and volumes — pick one.

### CI

`.github/workflows/ci.yml` runs checks only — Django migrations plus a frontend
production build — and requires no secrets. It does not deploy; Coolify does
that on its own when main changes. The old `ci-cd.yml`, which built images to
GHCR and deployed over SSH, was removed when the platform moved to Coolify: two
systems deploying to the same VPS would fight, and the GHCR images were never
pulled by anything.

The frontend job runs `bun run build` but not `bun run lint` — see the comment
in the workflow for why.
