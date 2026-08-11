from django.core.management.base import BaseCommand


# Seed values for a fresh database only. Prices and features are edited through
# the admin panel once the site is running (Admin → Pricing Plans), so this
# command uses create-only semantics — re-running it must not overwrite a price
# the client has since changed.
PLANS = [
    {
        'name': 'Basic',
        'plan_type': 'employer',
        'price_monthly': 0,
        'is_free': True,
        'is_enterprise': False,
        'is_popular': False,
        'job_post_limit': 1,
        'order': 1,
        'features': [
            # Worded as a total, not a slot: the free tier is metered by posts
            # ever made, so deleting the job does not hand it back.
            '1 Job Posting (one-time)',
            'Standard listing placement',
            'Application management',
            'Email notifications',
        ],
    },
    {
        'name': 'Professional',
        'plan_type': 'employer',
        'price_monthly': 399,
        'annual_discount_percent': 20,
        'is_free': False,
        'is_enterprise': False,
        'is_popular': True,
        'job_post_limit': 5,
        'order': 2,
        'features': [
            '5 Active Job Postings',
            'Featured listing highlights',
            'Priority in search results',
            'Candidate database access',
            'Applicant tracking tools',
            'Email + SMS notifications',
            'Dedicated account manager',
        ],
    },
    {
        'name': 'Enterprise',
        'plan_type': 'employer',
        'price_monthly': 0,
        'is_free': False,
        'is_enterprise': True,
        'is_popular': False,
        'job_post_limit': None,
        'order': 3,
        'features': [
            'Unlimited Job Postings',
            'Homepage featured placement',
            'Top priority in search results',
            'Full candidate database access',
            'Advanced analytics & reporting',
            'Dedicated account manager',
            'Custom branding options',
        ],
    },
]


class Command(BaseCommand):
    help = 'Seed the default subscription plans (existing plans are left untouched)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Overwrite existing plans with the seed values, discarding admin edits.',
        )

    def handle(self, *args, **options):
        from subscriptions.models import SubscriptionPlan

        for plan_data in PLANS:
            if options['reset']:
                plan, created = SubscriptionPlan.objects.update_or_create(
                    name=plan_data['name'], defaults=plan_data,
                )
                verb = 'Created' if created else 'Reset'
            else:
                plan, created = SubscriptionPlan.objects.get_or_create(
                    name=plan_data['name'], defaults=plan_data,
                )
                verb = 'Created' if created else 'Kept existing'

            self.stdout.write(f'{verb}: {plan.name} (${plan.price_monthly}/mo)')

        self.stdout.write(self.style.SUCCESS(
            '\nDone. Edit prices in Admin → Pricing Plans, then press Sync to Stripe.'
        ))
