"""Local-only test settings: swap Postgres for in-memory SQLite.

CI runs the suite against a real Postgres service (see .github/workflows/ci.yml).
This module exists so the same tests can be run on a dev machine that has no
Postgres, with:

    python manage.py test --settings=core.test_settings_local

It is not used by any deployment.
"""

from core.settings import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# Run Celery tasks inline so tests do not need a broker.
CELERY_TASK_ALWAYS_EAGER = True

# Fast, insecure hashing — acceptable because this file never leaves dev.
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
