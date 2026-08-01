"""
Periodic Celery tasks for the subscriptions app.
Scheduled via CELERY_BEAT_SCHEDULE in core/settings.py.
"""
import logging
from celery import shared_task
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


@shared_task(
    name='subscriptions.tasks.expire_past_due_subscriptions',
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def expire_past_due_subscriptions(self):
    """
    Mark subscriptions whose current_period_end has passed as 'inactive'.
    Runs nightly at 1 AM UTC via Celery Beat.
    """
    try:
        from django.utils import timezone
        from .models import UserSubscription

        now = timezone.now()
        expired_qs = UserSubscription.objects.filter(
            status='active',
            cancel_at_period_end=True,
            current_period_end__lt=now,
        )
        count = expired_qs.update(status='inactive')
        logger.info('expire_past_due_subscriptions: deactivated %d subscriptions', count)
        return {'deactivated': count}

    except Exception as exc:
        logger.exception('expire_past_due_subscriptions failed: %s', exc)
        raise self.retry(exc=exc)
