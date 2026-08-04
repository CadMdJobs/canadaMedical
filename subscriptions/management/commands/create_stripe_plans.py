from django.core.management.base import BaseCommand

from services.plan_pricing_service import StripeSyncError, stripe_configured, sync_plan_to_stripe


class Command(BaseCommand):
    help = 'Create or refresh Stripe prices so they match price_monthly in the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--plan',
            help='Sync only this plan by name. Default: every paid plan.',
        )

    def handle(self, *args, **options):
        from subscriptions.models import SubscriptionPlan

        if not stripe_configured():
            self.stderr.write(self.style.ERROR(
                'STRIPE_SECRET_KEY is not set — nothing to sync.'
            ))
            return

        plans = SubscriptionPlan.objects.filter(is_free=False, is_enterprise=False)
        if options['plan']:
            plans = plans.filter(name=options['plan'])
            if not plans.exists():
                self.stderr.write(self.style.ERROR(
                    f'No billable plan named "{options["plan"]}". '
                    f'Run: python manage.py setup_plans first.'
                ))
                return

        for plan in plans:
            try:
                result = sync_plan_to_stripe(plan)
            except StripeSyncError as exc:
                self.stderr.write(self.style.ERROR(f'{plan.name}: {exc}'))
            else:
                self.stdout.write(f'{plan.name} (${plan.price_monthly}/mo): {result}')

        self.stdout.write(self.style.SUCCESS('\nDone.'))
