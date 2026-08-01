"""
Core-level Celery tasks — housekeeping jobs that don't belong to a single app.
"""
from celery import shared_task


@shared_task(name='core.tasks.flush_expired_tokens', bind=True, max_retries=3)
def flush_expired_tokens(self):
    """Remove expired JWT blacklist entries (keeps the table lean)."""
    from django.utils import timezone
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

    deleted, _ = OutstandingToken.objects.filter(expires_at__lt=timezone.now()).delete()
    return {'deleted_tokens': deleted}
