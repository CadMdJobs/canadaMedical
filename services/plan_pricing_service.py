"""Keeps a SubscriptionPlan's price in Stripe in step with the database.

Checkout charges whatever `plan.stripe_price_id` points at, not the
`price_monthly` column, so editing the price in an admin screen without
touching Stripe changes the advertised figure and leaves the amount actually
billed untouched. This module closes that gap.

Stripe prices are immutable by design — you cannot edit an amount, you create a
new Price and point at it. Existing subscribers keep billing at the price they
signed up on until they are migrated, which is the behaviour we want: a price
change should never silently re-bill current customers.
"""

import logging
from decimal import Decimal

import stripe
from django.conf import settings

logger = logging.getLogger(__name__)


class StripeSyncError(Exception):
    """Raised when Stripe rejects a product or price operation."""


def stripe_configured():
    return bool(getattr(settings, 'STRIPE_SECRET_KEY', ''))


def _client():
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def _exists(resource, object_id):
    """Retrieve a Stripe object, or None if this account has never seen it.

    Switching STRIPE_SECRET_KEY from a test key to a live one leaves the IDs
    saved on the plan pointing into the old account, where a plain retrieve
    raises. Treating "unknown" as "absent" lets the caller rebuild the product
    and price in the new account instead of failing the whole sync.

    Only the not-found case is swallowed; auth failures, rate limits and
    outages still propagate, because those must not be mistaken for a missing
    object and silently trigger a duplicate.
    """
    try:
        return resource.retrieve(object_id)
    except stripe.InvalidRequestError as exc:
        if getattr(exc, 'http_status', None) == 404:
            return None
        raise


def to_minor_units(amount):
    """Decimal dollars -> integer cents, rounded half-up.

    Stripe rejects fractional cents, and float arithmetic on money loses the
    cent this rounding is meant to preserve, so the conversion goes through
    Decimal.
    """
    cents = (Decimal(str(amount)) * 100).quantize(Decimal('1'))
    return int(cents)


def _retire(s, price_id):
    """Deactivate a superseded price, tolerating failure.

    Never fatal: the replacement is already live and saved. Worth a log line
    because a price left active stays visible in the Stripe dashboard.
    """
    try:
        s.Price.modify(price_id, active=False)
    except stripe.StripeError as exc:
        logger.warning('Could not deactivate old Stripe price %s: %s', price_id, exc)


def _sync_interval(s, plan, product_id, amount, interval, field, currency):
    """Reconcile one recurring price on `plan`, saving its id to `field`.

    Returns True when a new price was created. Shared by the monthly and
    annual paths so both get identical drift detection and retirement, rather
    than one growing a subtle difference from the other.
    """
    current_id = getattr(plan, field)

    # An existing price that already matches means there is nothing to do —
    # creating a duplicate would leave dead prices accumulating in Stripe. A
    # price this account has never heard of falls through to Price.create
    # below, which is what rebuilds the catalogue after a test->live switch.
    if current_id:
        existing = _exists(s.Price, current_id)
        if (
            existing
            and existing.unit_amount == amount
            and existing.currency == currency
            and existing.product == product_id
            and getattr(existing.recurring, 'interval', None) == interval
        ):
            return False

    price = s.Price.create(
        product=product_id,
        unit_amount=amount,
        currency=currency,
        recurring={'interval': interval},
        metadata={'plan_id': str(plan.pk)},
    )

    setattr(plan, field, price.id)
    if current_id and current_id != price.id:
        _retire(s, current_id)

    logger.info(
        'Plan %s synced to Stripe %sly price %s (%s %s)',
        plan.pk, interval, price.id, amount, currency,
    )
    return True


def sync_plan_to_stripe(plan, currency=None):
    """Point `plan` at Stripe prices matching its current rates.

    Creates the product on first sync and a new recurring price whenever an
    amount has drifted. A plan with `annual_discount_percent` above zero also
    gets a yearly price, so the discount the site advertises is the one the
    customer is actually charged. Returns a short status string suitable for
    showing back to an admin.

    `currency` defaults to `settings.STRIPE_CURRENCY`, the single code every
    charge in the system is created in; the argument exists for tests and for
    a deliberate one-off, not for routine use. Changing that setting is
    detected here as drift like any other, so the next sync builds a fresh
    catalogue in the new currency and retires the old prices.

    Free and enterprise plans never reach Stripe: the first is not billed and
    the second is quoted per customer through CustomSubscriptionPlan.
    """
    if plan.is_free or plan.is_enterprise:
        return 'skipped: plan is not billed through Stripe checkout'

    if not stripe_configured():
        return 'skipped: STRIPE_SECRET_KEY is not set'

    currency = (currency or settings.STRIPE_CURRENCY).lower()
    s = _client()
    amount = to_minor_units(plan.price_monthly)

    if amount <= 0:
        return 'skipped: price must be above zero to bill through Stripe'

    try:
        product_id = plan.stripe_product_id
        if product_id and not _exists(s.Product, product_id):
            # Almost always means the key now points at a different Stripe
            # account (test -> live), where our stored IDs do not exist.
            logger.warning(
                'Stripe product %s is unknown to this account; recreating for plan %s',
                product_id, plan.pk,
            )
            product_id = ''

        if not product_id:
            product = s.Product.create(
                name=f'CanadianMdJobs - {plan.name} Plan',
                description=f'{plan.name} subscription for employers',
                metadata={'plan_id': str(plan.pk)},
            )
            product_id = product.id
            logger.info('Created Stripe product %s for plan %s', product_id, plan.pk)

        plan.stripe_product_id = product_id

        changed = []
        if _sync_interval(s, plan, product_id, amount, 'month', 'stripe_price_id', currency):
            changed.append(f'monthly at {amount / 100:.2f}')

        if plan.offers_annual:
            annual = to_minor_units(plan.price_annual_total)
            if _sync_interval(
                s, plan, product_id, annual, 'year', 'stripe_price_id_annual', currency,
            ):
                changed.append(
                    f'annual at {annual / 100:.2f} '
                    f'({plan.annual_discount_percent}% off)'
                )
        elif plan.stripe_price_id_annual:
            # The discount was switched off. Retire the yearly price so nobody
            # can reach it, and clear the id so checkout stops offering it.
            _retire(s, plan.stripe_price_id_annual)
            plan.stripe_price_id_annual = ''
            changed.append('annual billing withdrawn')

        plan.save(update_fields=[
            'stripe_product_id', 'stripe_price_id', 'stripe_price_id_annual',
        ])

        if not changed:
            return 'unchanged: Stripe already matches this price'
        return f'synced: {", ".join(changed)} {currency.upper()}'

    except stripe.StripeError as exc:
        logger.error('Stripe sync failed for plan %s: %s', plan.pk, exc)
        raise StripeSyncError(str(exc)) from exc
