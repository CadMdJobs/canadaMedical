import stripe
from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create Stripe product & price for the Professional plan and save IDs to DB'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Overwrite existing Stripe product and price IDs for the Professional plan.',
        )

    def handle(self, *args, **options):
        from subscriptions.models import SubscriptionPlan

        stripe.api_key = settings.STRIPE_SECRET_KEY

        try:
            plan = SubscriptionPlan.objects.get(name='Professional')
        except SubscriptionPlan.DoesNotExist:
            self.stderr.write(self.style.ERROR(
                'Professional plan not found. Run: python manage.py setup_plans first.'
            ))
            return

        if plan.stripe_price_id:
            self.stdout.write(self.style.WARNING(
                f'Professional plan already has stripe_price_id: {plan.stripe_price_id}'
            ))
            self.stdout.write('Pass --force to overwrite.')
            if not options['force']:
                return

        self.stdout.write('Creating Stripe product...')
        product = stripe.Product.create(
            name='CanadianMdJobs - Professional Plan',
            description='For healthcare organizations with regular recruitment needs',
        )
        self.stdout.write(f'  Product ID: {product.id}')

        self.stdout.write('Creating Stripe price ($499/month)...')
        price = stripe.Price.create(
            product=product.id,
            unit_amount=49900,
            currency='usd',
            recurring={'interval': 'month'},
        )
        self.stdout.write(f'  Price ID:   {price.id}')

        plan.stripe_price_id = price.id
        plan.stripe_product_id = product.id
        plan.save(update_fields=['stripe_price_id', 'stripe_product_id'])

        self.stdout.write(self.style.SUCCESS(
            f'\nStripe plans created and saved to Professional plan (id={plan.pk}).'
        ))
        self.stdout.write('\nAdd these to your .env if needed:')
        self.stdout.write(f'  STRIPE_PRODUCT_ID={product.id}')
        self.stdout.write(f'  STRIPE_PRICE_ID={price.id}')
