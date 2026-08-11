# CanadianMDjobs — Physician Recruitment Platform

Canada's dedicated physician recruitment platform connecting physicians with hospitals, clinics and health authorities.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 6, Django REST Framework, Daphne (ASGI) |
| Frontend | React 19, Vite, TanStack Router, Tailwind CSS |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 + Celery |
| Payments | Stripe |
| Email | Resend |
| Storage | AWS S3 (optional) |

---

## Run with Docker (Recommended)

The easiest way to run the entire project — no Python, Node, or PostgreSQL installation needed. Docker handles everything.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — that's it

### Step 1 — Clone the repository

```bash
git clone <repo-url>
cd CanadianMedProject
```

### Step 2 — Set up environment variables

```bash
# Backend
cp .env.example .env

# Frontend
cp canadamedical-frontend/.env.example canadamedical-frontend/.env
```

Open `.env` and fill in your values:

| Variable | Where to get it |
|----------|----------------|
| `SECRET_KEY` | Generate: `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DB_PASSWORD` | Any password you choose |
| `STRIPE_SECRET_KEY` | [stripe.com](https://stripe.com) → Developers → API keys |
| `STRIPE_PUBLISHABLE_KEY` | Same as above |
| `STRIPE_WEBHOOK_SECRET` | See Stripe Webhook section below |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys (free tier available) |

The frontend `.env` only needs one line — leave it as-is:
```
VITE_API_URL=http://localhost:8000
```

### Step 3 — Start everything

```bash
docker compose up --build
```

First build takes ~3-5 minutes. After that:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8080 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/api/schema/swagger-ui/ |
| Django Admin | http://localhost:8000/admin/ |

### Step 4 — Create admin account (first time only)

```bash
docker compose exec backend python manage.py createsuperuser
```

### Step 5 — Set up Stripe Webhook (for payments to work)

Install [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Windows
winget install Stripe.StripeCLI
```

In a separate terminal (while Docker is running):

```bash
stripe login
stripe listen --forward-to localhost:8000/api/subscriptions/webhook/
```

Copy the `whsec_...` key it shows and paste it into `.env` as `STRIPE_WEBHOOK_SECRET`, then restart:

```bash
docker compose restart backend
```

### Stop / Reset

```bash
# Stop all services
docker compose down

# Stop and delete all data (fresh start)
docker compose down -v
```

---

## Stripe Test Cards

Use these card numbers when testing payments (no real money charged):

| Card Number | Result |
|-------------|--------|
| `4242 4242 4242 4242` | Payment succeeds |
| `4000 0000 0000 9995` | Payment declined |
| `4000 0025 0000 3155` | Requires 3D Secure |

Use any future expiry date and any 3-digit CVV.

---

## Run Locally Without Docker

### Prerequisites

- Python 3.11+
- Node.js 20+ and [Bun](https://bun.sh)
- PostgreSQL 16
- Redis (optional — only for async email/tasks)

### Backend

```bash
# 1. Create virtual environment
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment
cp .env.example .env
# Edit .env with your values

# 4. Create database
psql -U postgres -c "CREATE DATABASE canadian_med_db;"

# 5. Run migrations
python manage.py migrate

# 6. Create admin account
python manage.py createsuperuser

# 7. Start server
python -m daphne -p 8000 core.asgi:application
```

### Frontend

```bash
cd canadamedical-frontend

bun install

cp .env.example .env

bun dev
```

### Celery (optional — needed for async email)

```bash
# In a separate terminal (with venv active)
celery -A core worker -l info
```

---

## Docker Commands Reference

```bash
# View logs from all services
docker compose logs -f

# View logs from one service only
docker compose logs -f backend
docker compose logs -f celery
docker compose logs -f frontend

# Run a Django management command
docker compose exec backend python manage.py <command>

# Open Django shell
docker compose exec backend python manage.py shell

# Run migrations manually
docker compose exec backend python manage.py migrate

# Check Redis is working
docker compose exec redis redis-cli ping

# Check all service status
docker compose ps

# Rebuild after changing requirements.txt or package.json
docker compose up --build
```

---

## Project Structure

```
CanadianMedProject/
├── accounts/               # User auth & profiles (physician + employer)
├── jobs/                   # Job listings, applications, saved jobs
├── subscriptions/          # Stripe subscription plans
├── notifications/          # Real-time WebSocket notifications
├── assessments/            # Career assessment form submissions
├── contact/                # Contact form
├── faq/                    # FAQ management
├── testimonials/           # Physician testimonials
├── emails/                 # Email templates & Resend integration
├── admin_panel/            # Custom admin API endpoints
├── stats/                  # Platform statistics
├── core/                   # Django settings, URLs, ASGI, Celery
├── canadamedical-frontend/ # React 19 frontend
│   ├── src/
│   │   ├── routes/         # All pages (TanStack Router)
│   │   ├── components/     # Shared UI components
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/            # API client, utilities
│   ├── Dockerfile
│   └── .env.example
├── Dockerfile              # Backend Dockerfile
├── docker-compose.yml      # All 5 services together
├── requirements.txt        # Python dependencies
├── .env.example            # Copy this to .env and fill in values
└── README.md
```

---

## API Documentation

| URL | Description |
|-----|-------------|
| `/api/schema/swagger-ui/` | Swagger UI (interactive, try endpoints) |
| `/api/schema/redoc/` | ReDoc documentation |
| `/api/schema/` | Raw OpenAPI schema (JSON) |

---

## Authentication

JWT Bearer tokens in every protected request:

```
Authorization: Bearer <access_token>
```

- Access token lifetime: 60 minutes
- Refresh token lifetime: 7 days
- Refresh via: `POST /api/auth/token/refresh/`
- JWT claims include: `user_type`, `full_name`, `email`

---

## Environment Variables Reference

### Backend (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Django cryptographic key — generate a unique one |
| `DEBUG` | Yes | `True` for dev, `False` for production |
| `ALLOWED_HOSTS` | Yes | Comma-separated: `localhost,127.0.0.1` |
| `DB_NAME` | Yes | PostgreSQL database name |
| `DB_USER` | Yes | PostgreSQL username |
| `DB_PASSWORD` | Yes | PostgreSQL password |
| `DB_HOST` | Yes | `localhost` locally, `db` in Docker (auto-set) |
| `STRIPE_SECRET_KEY` | Yes | From Stripe dashboard |
| `STRIPE_PUBLISHABLE_KEY` | Yes | From Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | Yes | From `stripe listen` CLI output |
| `STRIPE_CURRENCY` | No | ISO 4217 code every charge is created in. Default `cad` |
| `RESEND_API_KEY` | Yes | From resend.com |
| `REDIS_URL` | No | Enables Celery async tasks and WebSockets |
| `AWS_ACCESS_KEY_ID` | No | AWS S3 for file storage in production |
| `SECURE_SSL` | No | Set `True` only in production with real HTTPS |

### Frontend (`canadamedical-frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend URL — `http://localhost:8000` for local/Docker |
