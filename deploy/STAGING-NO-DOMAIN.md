# Staging Deploy — VPS IP, No Domain Yet

For getting the platform running on a bare VPS while waiting on the client's
domain. Everything runs on the VPS over plain HTTP:

```
http://148.230.92.247        → frontend (React)
http://148.230.92.247:8001   → backend  (Django API + WebSocket)
```

**Two Coolify resources, one per repository:**

| Resource | Repository | Compose file |
| -------- | ---------- | ------------ |
| backend  | `CadMdJobs/canadaMedical` | `/docker-compose.staging.yml` |
| frontend | `CadMdJobs/canadaMedicalFrontend` | `/docker-compose.staging.yml` |

They are split so a UI change redeploys the SPA alone, without restarting the
API, Celery workers and the database. The backend compose in this repo contains
no `frontend` service for that reason.

When the domain arrives, switch to `docker-compose.coolify.yml` — see
`deploy/COOLIFY.md` and the migration notes at the bottom of this file.

---

## Why not Vercel yet

Vercel serves over HTTPS. A page loaded over HTTPS cannot call an `http://`
API — browsers block it as mixed content, and there is no way to opt out from
the page's side. The same applies to the notification WebSocket: `wss://`
cannot fall back to `ws://`.

So Vercel needs the backend on HTTPS first, and HTTPS needs a domain (Let's
Encrypt does not issue certificates for bare IPs). Until then, both halves stay
on the VPS speaking HTTP to each other, which is consistent and works.

---

## 1. Create the resources in Coolify

Two resources, created the same way — Coolify → Project → **New Resource →
Public Repository**, then set **Build Pack: Docker Compose**:

**Backend**
- Repository: `https://github.com/CadMdJobs/canadaMedical`
- Compose file path: `/docker-compose.staging.yml`

**Frontend**
- Repository: `https://github.com/CadMdJobs/canadaMedicalFrontend`
- Compose file path: `/docker-compose.staging.yml`

For both: branch `main`, build server `localhost`, and **leave every Domain
field blank**. There is no hostname to route, so the containers publish ports
directly rather than going through Traefik. Generating a domain would give the
service an HTTPS URL, which then cannot call the plain-HTTP API.

The frontend repo must be **public** for this to work. A private one needs a
GitHub App configured under Coolify → Sources first.

---

## 2. Open the firewall

Coolify's own dashboard already occupies port 8000 on this VPS, so the API is
published on **8001** instead. That port is closed by default, so open it:

```bash
sudo ufw allow 8001/tcp comment "Django API (staging)"
sudo ufw status
```

Close it again after moving to a domain — at that point Traefik serves
everything on 443 and nothing should reach 8001 directly.

---

## 3. Environment variables

Generate the secrets first:

```bash
# SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(64))"

# DB_PASSWORD and REDIS_PASSWORD — run twice
openssl rand -base64 32 | tr -d '/+=' | head -c 40
```

> Keep `/`, `+` and `=` out of the passwords. They end up inside a Redis URL
> and a pgBouncer md5 hash, where unescaped characters cause connection errors
> that are annoying to trace back.

Paste into Coolify, replacing the IP if yours differs:

```ini
# ── Django core ──────────────────────────────────────────────────────────────
SECRET_KEY=<generated>
DEBUG=False
ALLOWED_HOSTS=148.230.92.247,localhost
FRONTEND_URL=http://148.230.92.247
CORS_EXTRA_ORIGIN=
LOG_LEVEL=INFO

# Note: SECURE_SSL is forced to False inside the staging compose file. With no
# TLS in front, SECURE_SSL_REDIRECT would redirect every request to an https://
# URL that nothing is listening on, and the whole site would appear dead.

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

# ── Stripe — use TEST keys here, never live ones ─────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=

# ── Resend ───────────────────────────────────────────────────────────────────
# Leave RESEND_API_KEY empty to print emails to the container log instead of
# sending them. Useful before a sending domain is verified.
RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_TEST_EMAIL=
```

### Frontend variables

These two go on the **frontend** resource, not the backend one, and must be
marked **Available at Buildtime** in Coolify:

```ini
VITE_API_URL=http://148.230.92.247:8001
VITE_WS_URL=ws://148.230.92.247:8001
```

Both are `http`/`ws`, not `https`/`wss` — the page itself is served over HTTP,
so the API calls must match.

Vite inlines these into the JS bundle at build time. As plain runtime variables
they never reach the build, and `src/lib/api.ts` throws on boot in production
when `VITE_API_URL` is missing, leaving a blank page. Changing them later needs
a rebuild, not a restart.

---

## 4. Deploy

Hit **Deploy**. The first run takes roughly 5–10 minutes: it builds both images,
then `entrypoint.sh` waits for Postgres and Redis, runs migrations, collects
static files and seeds the subscription plans.

Watch the `backend` logs for `Starting Daphne ASGI server`.

Verify:

```bash
curl http://148.230.92.247:8001/api/health/
# {"status":"ok","checks":{"db":{...},"redis":{...}}}
```

Then open `http://148.230.92.247` in a browser.

---

## 5. Create the admin user

The database starts empty. Open a terminal on the `backend` container in
Coolify:

```bash
python manage.py createsuperuser
```

Admin panel: `http://148.230.92.247:8001/admin/`

---

## What works and what does not

**Works:** browsing, registration, login, job posting and approval, the admin
back-office, career assessments, in-app notifications over WebSocket.

**Does not work yet:**

- **Stripe webhooks.** Stripe cannot deliver to a bare IP over HTTP, so
  subscriptions will not activate automatically. Checkout redirects still work;
  test the webhook path locally with `stripe listen --forward-to`.
- **Outbound email**, until a domain is verified with Resend. With
  `RESEND_API_KEY` empty, Django writes emails to the container log — enough to
  confirm the flow fires and to copy password-reset links out by hand.

Both are domain-dependent and resolve themselves in the move to production.

---

## ⚠️ HTTP means unencrypted

Traffic to this deployment is in the clear: passwords, JWTs and any uploaded
CV can be read by anything on the network path. Treat it as a demo:

- Use **Stripe test keys**, never live ones.
- Do not enter real physician data or real client data.
- Plan to wipe the database when moving to the real domain, rather than
  carrying staging accounts into production.

---

## Migrating to the real domain later

1. Point DNS at the VPS: `@`, `www` and `api` as A records (see
   `deploy/COOLIFY.md` step 1).
2. In Coolify, change the compose file to `docker-compose.coolify.yml` and set
   the domains on `frontend` and `backend`.
3. Update the environment:
   - `ALLOWED_HOSTS=api.YOUR_DOMAIN,YOUR_DOMAIN,www.YOUR_DOMAIN`
   - `FRONTEND_URL=https://YOUR_DOMAIN`
   - `SECURE_SSL=True`
   - `VITE_API_URL=https://api.YOUR_DOMAIN` and
     `VITE_WS_URL=wss://api.YOUR_DOMAIN` (rebuild required)
4. Close port 8001: `sudo ufw delete allow 8001/tcp`
5. Add the Stripe webhook and verify the Resend domain — see step 7 of
   `deploy/COOLIFY.md`.

`CSRF_TRUSTED_ORIGINS` is derived from `ALLOWED_HOSTS` and `FRONTEND_URL`
automatically, so it needs no separate change.

### If you still want the frontend on Vercel

Once the API is on HTTPS, moving the frontend to Vercel is a small job:

- Import the repo on Vercel with root directory `canadamedical-frontend`
- Set `VITE_API_URL=https://api.YOUR_DOMAIN` and `VITE_WS_URL=wss://...`
- Add the Vercel URL to `CORS_EXTRA_ORIGIN` on the backend so the API accepts
  requests from that origin
- Drop the `frontend` service from the compose file

Nothing in the backend needs to change beyond that one CORS entry.
