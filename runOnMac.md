# Mac-এ Project চালানোর গাইড

## যা যা লাগবে (একবারই install করতে হবে)

### ১. Docker Desktop install করো
[docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) থেকে **Mac** version নামাও → install করো → চালু করো।

Docker icon menu bar-এ দেখালে বুঝবে চালু হয়েছে।

### ২. Homebrew install করো (না থাকলে)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### ৩. Stripe CLI install করো
```bash
brew install stripe/stripe-cli/stripe
```

---

## Project Setup (প্রথমবার)

### ধাপ ১ — Project নামাও
```bash
git clone https://github.com/তোমার-username/repo-name.git
cd CanadianMedProject
```

### ধাপ ২ — Environment files তৈরি করো
```bash
cp .env.example .env
cp canadamedical-frontend/.env.example canadamedical-frontend/.env
```

এখন `.env` ফাইলটা যেকোনো text editor দিয়ে খুলো এবং এই values বসাও:

| Variable | কোথা থেকে পাবে |
|----------|----------------|
| `SECRET_KEY` | Terminal-এ চালাও: `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DB_PASSWORD` | যেকোনো password দাও (যেমন: `mypassword123`) |
| `STRIPE_SECRET_KEY` | [stripe.com](https://stripe.com) → Developers → API keys → Secret key (`sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | একই জায়গা → Publishable key (`pk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | নিচের ধাপ ৫ দেখো |
| `STRIPE_CURRENCY` | না দিলেও চলে — default `cad`। সব charge এই currency-তেই হয় |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys → Create API key (`re_...`) |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` রেখে দাও (test-এর জন্য) |

`canadamedical-frontend/.env` ফাইলটা **touch করতে হবে না** — এটা ঠিকই আছে:
```
VITE_API_URL=http://localhost:8000
```

### ধাপ ৩ — Docker দিয়ে সব চালু করো
```bash
docker compose up --build
```

প্রথমবার **৩-৫ মিনিট** লাগবে (সব download ও build হবে)। পরেরবার থেকে ৩০ সেকেন্ড।

সব ঠিকমতো চললে এরকম দেখাবে:
```
backend   | Daphne version 4.x.x, serving on 0.0.0.0:8000
frontend  | Local: http://localhost:8080/
celery    | celery@... ready.
```

Docker startup-এ automatically হবে:
- Database migration
- Subscription plans তৈরি (Basic, Professional, Enterprise)
- Stripe-এ Professional plan sync

### ধাপ ৪ — Admin account তৈরি করো (নতুন terminal-এ)
```bash
docker compose exec backend python manage.py createsuperuser
```
নাম, email, password দাও।

### ধাপ ৫ — Stripe Webhook চালু করো (আরেকটা terminal-এ)
```bash
stripe login
```
Browser খুলবে — Stripe account দিয়ে login করো।

```bash
stripe listen --forward-to localhost:8000/api/subscriptions/webhook/
```

Terminal-এ এরকম দেখাবে:
```
> Ready! Your webhook signing secret is whsec_abc123xyz...
```

ওই `whsec_...` কপি করো → `.env` ফাইলে `STRIPE_WEBHOOK_SECRET`-এ বসাও।

তারপর backend restart করো:
```bash
docker compose restart backend
```

---

## ব্যবহার করো

| সার্ভিস | URL |
|---------|-----|
| Website (Frontend) | http://localhost:8080 |
| Backend API | http://localhost:8000 |
| API Documentation | http://localhost:8000/api/schema/swagger-ui/ |
| Django Admin | http://localhost:8000/admin/ |

---

## Stripe Test Cards (real টাকা কাটবে না)

| Card Number | Result |
|-------------|--------|
| `4242 4242 4242 4242` | Payment সফল |
| `4000 0000 0000 9995` | Payment declined |

Expiry: যেকোনো future date (যেমন `12/29`) | CVV: যেকোনো 3 digit (যেমন `123`)

---

## প্রতিদিন চালানো ও বন্ধ করা

```bash
# চালু করো
docker compose up

# বন্ধ করো (Ctrl+C চাপো, তারপর)
docker compose down

# সব data মুছে fresh start
docker compose down -v
```

---

## কোনো সমস্যা হলে

```bash
# সব service-এর status দেখো
docker compose ps

# Backend-এর errors দেখো
docker compose logs backend

# Celery-র logs দেখো
docker compose logs celery

# সব logs দেখো (live)
docker compose logs -f
```

---

## Docker Hub থেকে চালানো (Code ছাড়া — সবচেয়ে সহজ পদ্ধতি)

Code নামাতে হবে না, Git লাগবে না, Python/Node install করতে হবে না।
শুধু দুটো ফাইল লাগবে যা তোমাকে পাঠানো হয়েছে:
- `docker-compose.hub.yml`
- `.env.example`

### ধাপ ১ — Docker Desktop install করো
[docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) থেকে নামাও → install করো → চালু করো।

### ধাপ ২ — একটা folder তৈরি করো
```bash
mkdir canadamed
cd canadamed
```

### ধাপ ৩ — দুটো ফাইল ওই folder-এ রাখো
তোমাকে পাঠানো `docker-compose.hub.yml` আর `.env.example` এই folder-এ রাখো।

### ধাপ ৪ — `.env` তৈরি করো
```bash
cp .env.example .env
```

তারপর `.env` ফাইল খুলে নিজের values বসাও:

| Variable | কোথা থেকে পাবে |
|----------|----------------|
| `DB_PASSWORD` | যেকোনো password (যেমন: `mypassword123`) |
| `SECRET_KEY` | যেকোনো random string (যেমন: `abc123xyz456def789`) |
| `STRIPE_SECRET_KEY` | [stripe.com](https://stripe.com) → Developers → API keys → Secret key (`sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | একই জায়গা → Publishable key (`pk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | নিচের ধাপ ৭ দেখো |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys → Create API key (`re_...`) |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` রেখে দাও (test-এর জন্য) |

### ধাপ ৫ — চালাও
```bash
docker compose -f docker-compose.hub.yml up
```

প্রথমবার Docker Hub থেকে images download হবে (~500MB), তারপর সব চালু হবে।

সব ঠিকমতো চললে এরকম দেখাবে:
```
backend   | Daphne version 4.x.x, serving on 0.0.0.0:8000
frontend  | Local: http://localhost:8080/
celery    | celery@... ready.
```

### ধাপ ৬ — Admin account তৈরি করো (নতুন terminal-এ)
```bash
docker compose -f docker-compose.hub.yml exec backend python manage.py createsuperuser
```
নাম, email, password দাও।

### ধাপ ৭ — Stripe Webhook চালু করো (আরেকটা terminal-এ)

Stripe CLI install করো:
```bash
brew install stripe/stripe-cli/stripe
```

তারপর:
```bash
stripe login
stripe listen --forward-to localhost:8000/api/subscriptions/webhook/
```

Terminal-এ এরকম দেখাবে:
```
> Ready! Your webhook signing secret is whsec_abc123xyz...
```

ওই `whsec_...` কপি করো → `.env` ফাইলে `STRIPE_WEBHOOK_SECRET`-এ বসাও।

তারপর restart করো:
```bash
docker compose -f docker-compose.hub.yml restart backend
```

### ধাপ ৮ — Browser-এ দেখো

| সার্ভিস | URL |
|---------|-----|
| Website | http://localhost:8080 |
| API | http://localhost:8000 |
| API Docs | http://localhost:8000/api/schema/swagger-ui/ |
| Admin | http://localhost:8000/admin/ |

### বন্ধ করতে
```bash
docker compose -f docker-compose.hub.yml down
```
