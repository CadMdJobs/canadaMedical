"""
Periodic Celery task: refresh the PlatformStats singleton from live DB counts.
Runs every 15 minutes via CELERY_BEAT_SCHEDULE.
"""
from celery import shared_task
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


@shared_task(
    name='stats.tasks.refresh_platform_stats',
    bind=True,
    max_retries=2,
    default_retry_delay=60,
)
def refresh_platform_stats(self):
    """Recompute PlatformStats from live DB counts and bust the cache."""
    try:
        from django.core.cache import cache
        from jobs.models import Job
        from accounts.models import CustomUser
        from .models import PlatformStats

        from django.utils import timezone
        from datetime import timedelta

        thirty_days_ago = timezone.now() - timedelta(days=30)

        total_active_jobs = Job.objects.filter(is_active=True, is_approved=True).count()
        new_opportunities = Job.objects.filter(
            is_active=True, is_approved=True, created_at__gte=thirty_days_ago
        ).count()
        total_active_candidates = CustomUser.objects.filter(
            user_type='physician', is_active=True
        ).count()
        new_candidates = CustomUser.objects.filter(
            user_type='physician', is_active=True, date_joined__gte=thirty_days_ago
        ).count()

        stats = PlatformStats.get_stats()
        stats.total_active_jobs = total_active_jobs
        stats.new_opportunities = new_opportunities
        stats.total_active_candidates = total_active_candidates
        stats.new_candidates = new_candidates
        stats.save(update_fields=[
            'total_active_jobs', 'new_opportunities',
            'total_active_candidates', 'new_candidates', 'last_updated',
        ])

        # Bust the cached stats view
        cache.delete_pattern('canadamed:stats:*')

        logger.info(
            'refresh_platform_stats: jobs=%d, new_jobs=%d, physicians=%d, new_physicians=%d',
            total_active_jobs, new_opportunities, total_active_candidates, new_candidates,
        )
        return {
            'total_active_jobs': total_active_jobs,
            'new_opportunities': new_opportunities,
            'total_active_candidates': total_active_candidates,
            'new_candidates': new_candidates,
        }

    except Exception as exc:
        logger.exception('refresh_platform_stats failed: %s', exc)
        raise self.retry(exc=exc)
