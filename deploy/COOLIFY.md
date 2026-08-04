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

### CI and auto-deploy

`.github/workflows/ci.yml` runs two check jobs — Django migrations plus a
frontend production build — and then a `deploy` job that calls Coolify's API.
The deploy job runs only on pushes to `main` and only if both checks pass, so a
failing test stops the release.

Coolify's *own* GitHub webhook is deliberately disabled (repo → Settings →
Webhooks, Active unticked). Re-enabling it makes pushes deploy directly and the
CI gate becomes decorative.

The old `ci-cd.yml`, which built images to GHCR and deployed over SSH, was
removed when the platform moved to Coolify: two systems deploying to the same
VPS would fight, and the GHCR images were never pulled by anything.

The frontend job runs `bun run build` but not `bun run lint` — see the comment
in the workflow for why.

**Setup the deploy job needs:**

- Coolify → Settings → Advanced → **API Access** enabled, **Allowed IPs empty**.
  GitHub runners have no fixed IP — GitHub publishes over 5,600 IPv4 ranges for
  Actions, so an allowlist is not maintainable. The token is the access control.
- Coolify → Keys & Tokens → API token scoped to **`deploy`** only, never
  `root`/`write`, with a long expiry. A 30-day default silently stops deploys.
- Token stored as the GitHub secret `COOLIFY_TOKEN`.

**The workflow reaches Coolify at `https://deploy.canadianmdjobs.com`, not at
`http://IP:8000`.** The bare-IP form timed out from GitHub's runners
(`curl (28)`, ~132s) even with UFW inactive and Coolify's allowlist empty — the
same URL worked fine from a home connection and had worked from Actions days
earlier. Something between GitHub's network and the host filters port 8000;
Hostinger's network-level firewall, which is separate from UFW, is the likely
culprit. Port 443 is not subject to that, and it keeps the dashboard off the
open internet.

For this to work, the Coolify instance itself needs that hostname: Settings →
General → **URL** (the field whose placeholder reads
`https://coolify.yourdomain.com`) = `https://deploy.canadianmdjobs.com`, plus
the matching A record. Done 2026-08-04; Traefik issued the certificate within a
minute and the dashboard moved off plain HTTP at the same time — it is no longer
reachable at `http://IP:8000`.

### A 504 after switching compose files means Traefik, not the app

After the staging → coolify compose switch, `frontend` returned 504 for half an
hour while `backend` on the same network served fine. Everything internal
checked out: container healthy, nginx serving, correct router labels, and
`docker exec coolify-proxy wget -O- http://<frontend-container>/healthz`
returned `ok`.

The cause was a stale route in Traefik — the container had been recreated with
a new IP and the proxy was still holding the old one. The fix is one command:

```bash
docker restart coolify-proxy
```

Try this first whenever routing misbehaves after a redeploy. It reloads the
proxy only; application containers are untouched, and the brief interruption
covers every domain for a few seconds.

### Firewall

UFW is currently **inactive** on this VPS, so nothing is filtered at the host.
If it is ever enabled, only SSH, HTTP and HTTPS should be open:

```bash
sudo ufw allow 22/tcp   comment "SSH"
sudo ufw allow 80/tcp   comment "HTTP (redirects to HTTPS)"
sudo ufw allow 443/tcp  comment "HTTPS"
sudo ufw enable
```

Add the SSH rule *before* `enable`, and keep Coolify's browser terminal open as
a second way in — an incomplete ruleset locks you out of the server.

Note that the staging ports (8001 for the API, 3000 for the frontend) are gone
on their own: `docker-compose.coolify.yml` uses `expose` rather than `ports`, so
those services are reachable only through Traefik.
