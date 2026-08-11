"""
Subscription & job-posting-limit business logic.
Extracted from jobs/views.py so it can be tested and reused independently.
"""
import datetime
import logging

from django.db.models import F

logger = logging.getLogger(__name__)


def check_job_posting_limit(user, employer, for_new_post=True):
    """
    Returns (allowed: bool, error_message: str | None).

    `for_new_post` is False when reopening an existing listing rather than
    creating one. It only changes the free plan, which meters total posts
    made; paid plans meter live listings, and a reopened job is live either
    way, so their check is the same in both cases.

    Priority order:
    1. Active CustomSubscriptionPlan (enterprise) — checked first.
    2. Standard UserSubscription — fallback.
    3. No subscription — deny posting.

    MUST be called inside a transaction.atomic() block in the caller.
    The select_for_update() on the employer row prevents two concurrent
    requests from both passing the quota check before either commits.
    """
    from subscriptions.models import UserSubscription, CustomSubscriptionPlan
    from jobs.models import Job
    from accounts.models import EmployerProfile

    today = datetime.date.today()

    # Acquire a row-level lock on the employer so concurrent job-create
    # requests queue up here instead of both passing the quota check.
    EmployerProfile.objects.select_for_update().get(pk=employer.pk)

    # ── 1. Enterprise custom plan ────────────────────────────────────────────
    try:
        custom_plan = user.custom_plan
        if custom_plan.is_active and (
            custom_plan.valid_until is None or custom_plan.valid_until >= today
        ):
            if custom_plan.job_post_limit is not None:
                active_jobs = Job.objects.filter(employer=employer, is_active=True).count()
                if active_jobs >= custom_plan.job_post_limit:
                    return False, (
                        f'Job posting limit reached ({custom_plan.job_post_limit} active jobs). '
                        'Please contact your account manager to adjust your enterprise plan.'
                    )
            return True, None
    except CustomSubscriptionPlan.DoesNotExist:
        pass

    # ── 2. Standard subscription ─────────────────────────────────────────────
    try:
        sub = UserSubscription.objects.select_related('plan').get(user=user)
        if sub.status != 'active':
            return False, 'Your subscription is not active. Please subscribe to post jobs.'

        if sub.plan.job_post_limit is None:
            return True, None

        # Free and paid plans meter differently on purpose.
        #
        # A paid plan sells slots: N listings live at once, and closing one to
        # advertise a different role is ordinary use of what was bought.
        #
        # A free plan sells posts: N in total, ever. Metering the free tier by
        # live listings would let an employer recruit indefinitely without
        # paying, simply by deleting each job before posting the next — which
        # is why the count comes from a counter that never goes down rather
        # than from the jobs table.
        if sub.plan.is_free:
            # Reopening spends nothing — that post was already paid for out of
            # the allowance when it was created. Only a genuinely new listing
            # draws down the count, or a free employer could never put their
            # one job back up after closing it.
            if not for_new_post:
                return True, None
            if employer.jobs_posted_count >= sub.plan.job_post_limit:
                return False, (
                    f'Your free plan includes {sub.plan.job_post_limit} job post(s) in total, '
                    'and you have used them all. Upgrade to Professional to keep posting.'
                )
            return True, None

        active_jobs = Job.objects.filter(
            employer=employer, is_active=True, archived_at__isnull=True,
        ).count()
        if active_jobs >= sub.plan.job_post_limit:
            return False, (
                f'Job posting limit reached ({sub.plan.job_post_limit} active jobs). '
                'Please upgrade your plan to post more.'
            )
        return True, None
    except UserSubscription.DoesNotExist:
        return False, 'No active subscription found. Please select a plan to post jobs.'


def record_job_posted(employer):
    """Charge one post against the employer's lifetime count.

    An F() update rather than a read-modify-write so two job creations racing
    each other cannot both read the same number and write the same increment.
    Callers already hold the employer row lock from check_job_posting_limit,
    but this keeps the counter correct even if that ever changes.
    """
    from accounts.models import EmployerProfile

    EmployerProfile.objects.filter(pk=employer.pk).update(
        jobs_posted_count=F('jobs_posted_count') + 1
    )


def jobs_counted_against_plan(employer, plan):
    """How much of `plan`'s allowance this employer has spent.

    Free plans count posts ever made, paid plans count listings currently
    live. The dashboard has to read the same number the posting check reads,
    or a free employer who deleted their job would be shown a spare slot and
    then be refused when they tried to use it.
    """
    from jobs.models import Job

    if plan is not None and plan.is_free:
        return employer.jobs_posted_count
    return Job.objects.filter(
        employer=employer, is_active=True, archived_at__isnull=True,
    ).count()


def get_employer_subscription_summary(user):
    """
    Returns a dict describing the employer's current plan state.
    Used by MySubscriptionView to build the frontend payload.
    """
    from subscriptions.models import UserSubscription, CustomSubscriptionPlan, SubscriptionPlan
    from jobs.models import Job

    today = datetime.date.today()

    # Active enterprise custom plan
    try:
        custom_plan = user.custom_plan
        if custom_plan.is_active and (
            custom_plan.valid_until is None or custom_plan.valid_until >= today
        ):
            return {'type': 'enterprise', 'custom_plan': custom_plan}
    except CustomSubscriptionPlan.DoesNotExist:
        pass

    # Pending custom plan (awaiting payment)
    try:
        pending = CustomSubscriptionPlan.objects.get(user=user, is_active=False)
        if pending.payment_status == 'pending_payment':
            return {'type': 'pending_custom', 'custom_plan': pending}
    except CustomSubscriptionPlan.DoesNotExist:
        pass

    # Standard subscription
    try:
        sub = UserSubscription.objects.select_related('plan').get(user=user)
        return {'type': 'standard', 'subscription': sub}
    except UserSubscription.DoesNotExist:
        pass

    # Free (no subscription row)
    free_plan = SubscriptionPlan.objects.filter(is_free=True, plan_type='employer').first()
    return {'type': 'free', 'free_plan': free_plan}
