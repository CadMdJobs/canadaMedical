from pathlib import Path
from datetime import timedelta
from decouple import config, Csv
import logging

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = config('DEBUG', default=False, cast=bool)
SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-me-in-production-use-a-long-random-string')
if not DEBUG and SECRET_KEY.startswith('django-insecure'):
    raise ValueError('SECRET_KEY must be set to a secure value in production.')
ALLOWED_HOSTS = list(set(config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())) | {'localhost', '127.0.0.1'})

INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'drf_spectacular',
    'storages',
    'channels',
    # Third-party (task queue)
    'django_celery_results',
    'django_celery_beat',
    # Local apps
    'accounts',
    'jobs',
    'assessments',
    'testimonials',
    'contact',
    'faq',
    'stats',
    'admin_panel',
    'notifications',
    'subscriptions',
    'emails',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'core.middleware.RequestIDMiddleware',       # attach X-Request-ID to every request/response
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'core.middleware.AdminIPRestrictionMiddleware',  # restrict /admin/ by IP in production
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'
ASGI_APPLICATION = 'core.asgi.application'

REDIS_URL = config('REDIS_URL', default='')

# ── Django cache (Redis when available, LocMemCache fallback) ─────────────────
if REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
            'KEY_PREFIX': 'canadamed',
            'OPTIONS': {
                'socket_connect_timeout': 5,
                'socket_timeout': 5,
            },
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'canadamed-default',
        }
    }

if REDIS_URL:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {'hosts': [REDIS_URL]},
        }
    }
else:
    # Development fallback — no Redis needed, but WebSocket messages stay in-process.
    # Set REDIS_URL in .env (or production env) to enable real-time cross-worker delivery.
    CHANNEL_LAYERS = {
        'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'},
    }

# ── Celery ────────────────────────────────────────────────────────────────────
# Without Redis: uses in-memory broker (tasks run but don't survive crashes/restarts).
# Set REDIS_URL in .env for production-grade async email delivery.
CELERY_BROKER_URL = config('REDIS_URL', default='memory://')
CELERY_RESULT_BACKEND = 'django-db'          # stores results in DB via django-celery-results
CELERY_CACHE_BACKEND = 'default'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 60          # kill task if it runs >60s
CELERY_TASK_SOFT_TIME_LIMIT = 30     # raise SoftTimeLimitExceeded at 30s
CELERY_TASK_ACKS_LATE = True         # re-queue if worker dies mid-task
CELERY_WORKER_PREFETCH_MULTIPLIER = 1  # one task at a time per worker thread
# In development: run tasks synchronously so emails fire without a running worker.
if DEBUG:
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True

# ── Celery Beat periodic tasks ────────────────────────────────────────────────
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    # Clean up expired JWT blacklisted tokens (SimpleJWT built-in)
    'flush-expired-tokens': {
        'task': 'core.tasks.flush_expired_tokens',
        'schedule': crontab(hour=3, minute=0),     # 3 AM UTC daily
    },
    # Update platform stats cache
    'refresh-platform-stats': {
        'task': 'stats.tasks.refresh_platform_stats',
        'schedule': crontab(minute='*/15'),         # every 15 min
    },
    # Cancel subscriptions past their end date
    'expire-subscriptions': {
        'task': 'subscriptions.tasks.expire_past_due_subscriptions',
        'schedule': crontab(hour=1, minute=0),     # 1 AM UTC daily
    },
}

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='canadian_med_db'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default='postgres'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
        'CONN_MAX_AGE': config('DB_CONN_MAX_AGE', default=60, cast=int),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'America/Toronto'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'accounts.CustomUser'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.StandardResultsPagination',
    'PAGE_SIZE': 12,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'EXCEPTION_HANDLER': 'core.exceptions.custom_exception_handler',
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/minute',
        'user': '300/minute',
        'contact_form': '5/minute',
        'assessment_form': '5/minute',
        'registration': '10/minute',
        'password_reset': '5/minute',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'TOKEN_OBTAIN_SERIALIZER': 'accounts.serializers.CustomTokenObtainPairSerializer',
}

_frontend_url = config('FRONTEND_URL', default='http://localhost:5173')

if DEBUG:
    CORS_ALLOWED_ORIGINS = list({
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        _frontend_url,
    })
else:
    # Production: only exact origins — no localhost wildcards
    _extra_origin = config('CORS_EXTRA_ORIGIN', default='')
    CORS_ALLOWED_ORIGINS = list({
        _frontend_url,
        _extra_origin,
    } - {''})
    # Also allow www subdomain of the frontend URL automatically
    import re as _re
    _domain = _re.sub(r'^https?://(www\.)?', '', _frontend_url).rstrip('/')
    CORS_ALLOWED_ORIGIN_REGEXES = [
        rf'^https?://(www\.)?{_re.escape(_domain)}$',
    ]

CORS_ALLOW_CREDENTIALS = True
CORS_EXPOSE_HEADERS = ['Content-Disposition', 'X-Request-ID']

# Allow the custom X-Request-ID header the frontend sends for log correlation
from corsheaders.defaults import default_headers
CORS_ALLOW_HEADERS = list(default_headers) + [
    'x-request-id',
]

# Django 4+ rejects POSTs whose Origin is not listed here, which otherwise makes
# the admin login fail with "CSRF verification failed" as soon as the site is
# served from anything other than localhost. Derived from the hosts we already
# trust, plus each ALLOWED_HOSTS entry under both schemes so a bare-IP or
# staging deployment works without extra configuration.
CSRF_TRUSTED_ORIGINS = list({
    origin for origin in (
        [_frontend_url, config('CORS_EXTRA_ORIGIN', default='')]
        # Both schemes: staging runs on plain HTTP behind no proxy, production
        # on HTTPS behind Coolify's, and the same list has to satisfy both.
        + [
            f'{scheme}://{host}'
            for host in ALLOWED_HOSTS
            if host not in ('*', 'localhost', '127.0.0.1')
            for scheme in ('https', 'http')
        ]
    ) if origin
})

USE_S3 = config('AWS_STORAGE_BUCKET_NAME', default='') != ''

if USE_S3:
    AWS_ACCESS_KEY_ID = config('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = config('AWS_SECRET_ACCESS_KEY')
    AWS_STORAGE_BUCKET_NAME = config('AWS_STORAGE_BUCKET_NAME')
    AWS_S3_REGION_NAME = config('AWS_S3_REGION_NAME', default='ca-central-1')
    AWS_S3_CUSTOM_DOMAIN = f'{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com'
    AWS_S3_OBJECT_PARAMETERS = {'CacheControl': 'max-age=86400'}
    AWS_DEFAULT_ACL = 'private'
    AWS_S3_FILE_OVERWRITE = False
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'

EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')

if EMAIL_HOST_USER:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
    EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
    EMAIL_USE_TLS = True
    DEFAULT_FROM_EMAIL = config('EMAIL_FROM', default=EMAIL_HOST_USER)
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
    DEFAULT_FROM_EMAIL = 'noreply@canadianphysicianrecruitment.com'

FRONTEND_URL = config('FRONTEND_URL', default='http://localhost:3000')

RESEND_API_KEY = config('RESEND_API_KEY', default='')
RESEND_FROM_EMAIL = config('RESEND_FROM_EMAIL', default='onboarding@resend.dev')
RESEND_TEST_EMAIL = config('RESEND_TEST_EMAIL', default='')

STRIPE_SECRET_KEY = config('STRIPE_SECRET_KEY', default='')
STRIPE_PUBLISHABLE_KEY = config('STRIPE_PUBLISHABLE_KEY', default='')
STRIPE_WEBHOOK_SECRET = config('STRIPE_WEBHOOK_SECRET', default='')

SPECTACULAR_SETTINGS = {
    'TITLE': 'Canadian Physician Recruitment API',
    'DESCRIPTION': (
        'REST API for the Canadian Physician Recruitment Platform — connecting physicians '
        'with healthcare employers across Canada.\n\n'
        '## Authentication\n'
        'All protected endpoints require a Bearer JWT token in the `Authorization` header:\n'
        '```\nAuthorization: Bearer <access_token>\n```\n'
        'Obtain tokens via `POST /api/auth/login/`. Refresh via `POST /api/auth/token/refresh/`.\n\n'
        '## User Roles\n'
        '- **Physician** — can apply, save jobs, manage profile\n'
        '- **Employer** — can post jobs, manage applications\n'
        '- **Admin** — full access to `/api/admin/` endpoints (requires `is_staff=True`)'
    ),
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
    'SORT_OPERATIONS': False,
    'TAGS': [
        {'name': 'Auth', 'description': 'Registration, login, logout, password reset, token refresh'},
        {'name': 'Profile', 'description': 'Physician and employer profile management'},
        {'name': 'Jobs', 'description': 'Job listings — browse, apply, save'},
        {'name': 'Assessments', 'description': 'Career assessment form submissions'},
        {'name': 'Contact', 'description': 'Contact form submissions'},
        {'name': 'Testimonials', 'description': 'Public physician testimonials'},
        {'name': 'FAQ', 'description': 'Frequently asked questions'},
        {'name': 'Stats', 'description': 'Public platform statistics'},
        {'name': 'Admin - Dashboard', 'description': 'Admin overview dashboard'},
        {'name': 'Admin - Jobs', 'description': 'Admin job management — approve, reject, delete'},
        {'name': 'Admin - Users', 'description': 'Admin user management — activate, deactivate, delete'},
        {'name': 'Admin - Assessments', 'description': 'Admin career assessment management'},
        {'name': 'Admin - Contacts', 'description': 'Admin contact submission management'},
        {'name': 'Admin - Testimonials', 'description': 'Admin testimonial management'},
        {'name': 'Admin - FAQs', 'description': 'Admin FAQ management'},
        {'name': 'Admin - Stats', 'description': 'Admin platform stats management'},
        {'name': 'Admin - Notifications', 'description': 'Admin notification centre'},
        {'name': 'Admin - Search', 'description': 'Admin global search'},
        {'name': 'Admin - Export', 'description': 'Admin CSV data export'},
        {'name': 'Admin - Profile', 'description': 'Admin account profile and password'},
    ],
    'SERVE_PUBLIC': True,
    'SWAGGER_UI_SETTINGS': {
        'deepLinking': True,
        'persistAuthorization': True,
        'displayOperationId': False,
        'filter': True,
        'docExpansion': 'list',
        'tagsSorter': 'alpha',
    },
    'SWAGGER_UI_FAVICON_HREF': None,
    'SECURITY': [{'jwtAuth': []}],
    'POSTPROCESSING_HOOKS': [
        'drf_spectacular.hooks.postprocess_schema_enums',
    ],
}

DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

LOG_LEVEL = config('LOG_LEVEL', default='WARNING' if not DEBUG else 'INFO')
LOG_DIR = BASE_DIR / 'logs'
LOG_DIR.mkdir(exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'json': {
            '()': 'django.utils.log.ServerFormatter',
            'format': '%(asctime)s %(levelname)s %(name)s %(message)s',
        },
    },
    'filters': {
        'require_debug_false': {'()': 'django.utils.log.RequireDebugFalse'},
        'require_debug_true':  {'()': 'django.utils.log.RequireDebugTrue'},
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'rotating_file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': LOG_DIR / 'django.log',
            'maxBytes': 20 * 1024 * 1024,   # 20 MB
            'backupCount': 5,
            'formatter': 'verbose',
        },
        'error_file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': LOG_DIR / 'errors.log',
            'maxBytes': 10 * 1024 * 1024,
            'backupCount': 5,
            'formatter': 'verbose',
            'level': 'ERROR',
        },
    },
    'root': {
        'handlers': ['console', 'rotating_file'],
        'level': LOG_LEVEL,
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'rotating_file', 'error_file'],
            'level': LOG_LEVEL,
            'propagate': False,
        },
        'django.security': {
            'handlers': ['console', 'error_file'],
            'level': 'WARNING',
            'propagate': False,
        },
        'celery': {
            'handlers': ['console', 'rotating_file'],
            'level': LOG_LEVEL,
            'propagate': False,
        },
        'accounts': {
            'handlers': ['console', 'rotating_file'],
            'level': LOG_LEVEL,
            'propagate': False,
        },
        'stats': {
            'handlers': ['console', 'rotating_file'],
            'level': LOG_LEVEL,
            'propagate': False,
        },
    },
}

# ── Sentry ────────────────────────────────────────────────────────────────────
SENTRY_DSN = config('SENTRY_DSN', default='')
if SENTRY_DSN and not DEBUG:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.redis import RedisIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[
            DjangoIntegration(transaction_style='url'),
            CeleryIntegration(monitor_beat_tasks=True),
            RedisIntegration(),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        traces_sample_rate=config('SENTRY_TRACES_RATE', default=0.1, cast=float),
        profiles_sample_rate=config('SENTRY_PROFILES_RATE', default=0.05, cast=float),
        environment=config('SENTRY_ENVIRONMENT', default='production'),
        send_default_pii=False,
    )

# ── Django admin URL hardening ────────────────────────────────────────────────
# Change DJANGO_ADMIN_URL in .env.production to something unguessable.
# e.g. DJANGO_ADMIN_URL=mgt-a7f3d291
DJANGO_ADMIN_URL = config('DJANGO_ADMIN_URL', default='admin')

# ── Security hardening (always-on, even in DEBUG) ─────────────────────────────
SESSION_COOKIE_HTTPONLY = True      # JS cannot access session cookie
CSRF_COOKIE_HTTPONLY = True         # JS cannot access CSRF cookie
CSRF_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SAMESITE = 'Lax'
SECURE_BROWSER_XSS_FILTER = True    # X-XSS-Protection header
SECURE_CONTENT_TYPE_NOSNIFF = True  # X-Content-Type-Options: nosniff
X_FRAME_OPTIONS = 'DENY'

# ── Production-only SSL / HSTS ────────────────────────────────────────────────
if not DEBUG and config('SECURE_SSL', default=False, cast=bool):
    # Traefik terminates TLS and forwards to the container over plain HTTP, so
    # request.is_secure() is False without this and SECURE_SSL_REDIRECT sends
    # the browser into an endless https -> proxy -> http -> https loop.
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# ── Django admin hardening ────────────────────────────────────────────────────
# Restrict Django admin to staff-only IPs in production (set via env).
# Format: comma-separated CIDR or IP list, e.g. "1.2.3.4,10.0.0.0/8"
ADMIN_ALLOWED_IPS_RAW = config('ADMIN_ALLOWED_IPS', default='')
ADMIN_ALLOWED_IPS = [ip.strip() for ip in ADMIN_ALLOWED_IPS_RAW.split(',') if ip.strip()]

# ── Django REST Framework: disable Browsable API in production ────────────────
if not DEBUG:
    REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = [
        'rest_framework.renderers.JSONRenderer',
    ]

# ── Request ID middleware (optional — add to MIDDLEWARE if using structured logging) ──
# Uncomment to enable per-request trace IDs in logs:
# MIDDLEWARE += ['core.middleware.RequestIDMiddleware']
