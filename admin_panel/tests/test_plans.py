from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import EmployerProfile
from services.plan_pricing_service import StripeSyncError, sync_plan_to_stripe, to_minor_units
from subscriptions.models import SubscriptionPlan, UserSubscription

User = get_user_model()


def make_admin(email='admin@test.com'):
    return User.objects.create_user(
        email=email, password='StrongPass1', first_name='Ad', last_name='Min',
        user_type='admin', is_staff=True,
    )


def make_paid_plan(**kwargs):
    defaults = dict(
        name='Professional', plan_type='employer', price_monthly=Decimal('399'),
        job_post_limit=5, features=['5 Active Job Postings'], order=2,
    )
    defaults.update(kwargs)
    return SubscriptionPlan.objects.create(**defaults)


def _price(amount, product, interval='month', currency='usd'):
    """Stand-in for a retrieved Stripe Price."""
    return MagicMock(
        unit_amount=amount, currency=currency, product=product,
        recurring=MagicMock(interval=interval),
    )


class PlanCrudTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(make_admin())
        self.plan = make_paid_plan()

    def test_non_admin_is_refused(self):
        client = APIClient()
        user = User.objects.create_user(
            email='emp@test.com', password='StrongPass1',
            first_name='E', last_name='M', user_type='employer',
        )
        client.force_authenticate(user)
        self.assertEqual(client.get('/api/v1/admin/plans/').status_code, 403)

    def test_list_reports_subscriber_count_and_stripe_state(self):
        res = self.client.get('/api/v1/admin/plans/')
        self.assertEqual(res.status_code, 200)
        row = res.json()['data'][0]
        self.assertEqual(row['subscriber_count'], 0)
        self.assertFalse(row['stripe_in_sync'])

    def test_price_and_features_can_be_edited(self):
        res = self.client.put(
            f'/api/v1/admin/plans/{self.plan.pk}/',
            {'price_monthly': '499', 'features': ['A', 'B']},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.price_monthly, Decimal('499'))
        self.assertEqual(self.plan.features, ['A', 'B'])

    def test_price_change_warns_that_stripe_is_stale(self):
        res = self.client.put(
            f'/api/v1/admin/plans/{self.plan.pk}/', {'price_monthly': '499'}, format='json',
        )
        self.assertIn('Sync to Stripe', res.json()['message'])

    def test_stripe_ids_cannot_be_set_by_hand(self):
        """Typing a price ID in would bill an arbitrary amount."""
        self.client.put(
            f'/api/v1/admin/plans/{self.plan.pk}/',
            {'stripe_price_id': 'price_attacker_controlled'},
            format='json',
        )
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.stripe_price_id, '')

    def test_blank_job_limit_means_unlimited(self):
        self.client.put(
            f'/api/v1/admin/plans/{self.plan.pk}/', {'job_post_limit': None}, format='json',
        )
        self.plan.refresh_from_db()
        self.assertIsNone(self.plan.job_post_limit)

    def test_negative_price_is_rejected(self):
        res = self.client.put(
            f'/api/v1/admin/plans/{self.plan.pk}/', {'price_monthly': '-10'}, format='json',
        )
        self.assertEqual(res.status_code, 400)

    def test_paid_plan_needs_a_price(self):
        res = self.client.post(
            '/api/v1/admin/plans/',
            {'name': 'Broken', 'price_monthly': '0', 'features': []},
            format='json',
        )
        self.assertEqual(res.status_code, 400)

    def test_free_plan_with_a_price_is_rejected(self):
        res = self.client.post(
            '/api/v1/admin/plans/',
            {'name': 'Odd', 'price_monthly': '50', 'is_free': True, 'features': []},
            format='json',
        )
        self.assertEqual(res.status_code, 400)

    def test_free_and_enterprise_together_is_rejected(self):
        res = self.client.post(
            '/api/v1/admin/plans/',
            {'name': 'Both', 'price_monthly': '0', 'is_free': True,
             'is_enterprise': True, 'features': []},
            format='json',
        )
        self.assertEqual(res.status_code, 400)

    def test_annual_discount_is_editable(self):
        r = self.client.put(
            f'/api/v1/admin/plans/{self.plan.id}/',
            {'annual_discount_percent': 25}, format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.annual_discount_percent, 25)
        self.assertEqual(self.plan.annual_monthly_equivalent, Decimal('299.25'))

    def test_changing_only_the_discount_warns_about_stripe(self):
        r = self.client.put(
            f'/api/v1/admin/plans/{self.plan.id}/',
            {'annual_discount_percent': 25}, format='json',
        )
        self.assertIn('Sync to Stripe', r.data['message'])

    def test_discount_above_the_cap_is_rejected(self):
        r = self.client.put(
            f'/api/v1/admin/plans/{self.plan.id}/',
            {'annual_discount_percent': 95}, format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_annual_stripe_id_cannot_be_set_by_hand(self):
        self.client.put(
            f'/api/v1/admin/plans/{self.plan.id}/',
            {'stripe_price_id_annual': 'price_attacker'}, format='json',
        )
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.stripe_price_id_annual, '')

    def test_a_free_plan_cannot_carry_a_discount(self):
        free = SubscriptionPlan.objects.create(name='Basic', price_monthly=0, is_free=True)
        r = self.client.put(
            f'/api/v1/admin/plans/{free.id}/',
            {'annual_discount_percent': 20}, format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_blank_feature_entries_are_rejected(self):
        res = self.client.put(
            f'/api/v1/admin/plans/{self.plan.pk}/',
            {'features': ['Good', '   ']},
            format='json',
        )
        self.assertEqual(res.status_code, 400)


class PlanDeleteGuardTest(TestCase):
    """UserSubscription.plan is PROTECT, so an unguarded delete is a 500."""

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(make_admin())
        self.plan = make_paid_plan()

    def _subscribe(self, status_value):
        user = User.objects.create_user(
            email=f'sub-{status_value}@test.com', password='StrongPass1',
            first_name='S', last_name='U', user_type='employer',
        )
        EmployerProfile.objects.create(user=user, company_name='Co', company_type='employer')
        UserSubscription.objects.create(user=user, plan=self.plan, status=status_value)

    def test_unused_plan_deletes(self):
        res = self.client.delete(f'/api/v1/admin/plans/{self.plan.pk}/')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(SubscriptionPlan.objects.filter(pk=self.plan.pk).exists())

    def test_plan_with_active_subscribers_is_protected(self):
        self._subscribe('active')
        res = self.client.delete(f'/api/v1/admin/plans/{self.plan.pk}/')
        self.assertEqual(res.status_code, 409)
        self.assertTrue(SubscriptionPlan.objects.filter(pk=self.plan.pk).exists())

    def test_plan_with_only_past_subscribers_is_also_protected(self):
        """Billing history would break, and the PROTECT constraint blocks it anyway."""
        self._subscribe('cancelled')
        res = self.client.delete(f'/api/v1/admin/plans/{self.plan.pk}/')
        self.assertEqual(res.status_code, 409)


class StripeSyncServiceTest(TestCase):
    def setUp(self):
        self.plan = make_paid_plan()

    def test_dollars_convert_to_cents_without_float_drift(self):
        self.assertEqual(to_minor_units(Decimal('399')), 39900)
        self.assertEqual(to_minor_units(Decimal('19.99')), 1999)
        self.assertEqual(to_minor_units(Decimal('0.10')), 10)

    @patch('services.plan_pricing_service.stripe_configured', return_value=False)
    def test_missing_api_key_is_reported_not_raised(self, _cfg):
        self.assertIn('skipped', sync_plan_to_stripe(self.plan))

    def test_free_and_enterprise_plans_never_reach_stripe(self):
        free = SubscriptionPlan.objects.create(name='Basic', price_monthly=0, is_free=True)
        ent = SubscriptionPlan.objects.create(name='Ent', price_monthly=0, is_enterprise=True)
        self.assertIn('skipped', sync_plan_to_stripe(free))
        self.assertIn('skipped', sync_plan_to_stripe(ent))

    @patch('services.plan_pricing_service.stripe_configured', return_value=True)
    @patch('services.plan_pricing_service._client')
    def test_first_sync_creates_product_and_price(self, mock_client, _cfg):
        s = MagicMock()
        s.Product.create.return_value = MagicMock(id='prod_1')
        s.Price.create.return_value = MagicMock(id='price_1')
        mock_client.return_value = s

        sync_plan_to_stripe(self.plan)

        self.plan.refresh_from_db()
        self.assertEqual(self.plan.stripe_product_id, 'prod_1')
        self.assertEqual(self.plan.stripe_price_id, 'price_1')
        self.assertEqual(s.Price.create.call_args.kwargs['unit_amount'], 39900)

    @patch('services.plan_pricing_service.stripe_configured', return_value=True)
    @patch('services.plan_pricing_service._client')
    def test_matching_price_is_left_alone(self, mock_client, _cfg):
        """Re-syncing an unchanged plan must not pile up duplicate prices."""
        self.plan.stripe_product_id = 'prod_1'
        self.plan.stripe_price_id = 'price_1'
        self.plan.save()

        s = MagicMock()
        s.Product.retrieve.return_value = MagicMock(id='prod_1')
        s.Price.retrieve.return_value = _price(39900, 'prod_1')
        mock_client.return_value = s

        result = sync_plan_to_stripe(self.plan)

        self.assertIn('unchanged', result)
        s.Price.create.assert_not_called()

    @patch('services.plan_pricing_service.stripe_configured', return_value=True)
    @patch('services.plan_pricing_service._client')
    def test_changed_price_creates_new_and_retires_old(self, mock_client, _cfg):
        self.plan.stripe_product_id = 'prod_1'
        self.plan.stripe_price_id = 'price_old'
        self.plan.price_monthly = Decimal('499')
        self.plan.save()

        s = MagicMock()
        s.Product.retrieve.return_value = MagicMock(id='prod_1')
        s.Price.retrieve.return_value = _price(39900, 'prod_1')
        s.Price.create.return_value = MagicMock(id='price_new')
        mock_client.return_value = s

        sync_plan_to_stripe(self.plan)

        self.plan.refresh_from_db()
        self.assertEqual(self.plan.stripe_price_id, 'price_new')
        s.Price.modify.assert_called_once_with('price_old', active=False)

    @patch('services.plan_pricing_service.stripe_configured', return_value=True)
    @patch('services.plan_pricing_service._client')
    def test_ids_from_another_account_are_rebuilt(self, mock_client, _cfg):
        """Switching the key from test to live must rebuild, not fail.

        The IDs saved on the plan belong to the sandbox account, so the live
        account 404s on both. Without this the whole sync raises and checkout
        keeps pointing at a price that no longer resolves.
        """
        import stripe as stripe_lib

        self.plan.stripe_product_id = 'prod_test'
        self.plan.stripe_price_id = 'price_test'
        self.plan.save()

        not_found = stripe_lib.InvalidRequestError('No such price', 'id', http_status=404)

        s = MagicMock()
        s.Product.retrieve.side_effect = not_found
        s.Price.retrieve.side_effect = not_found
        s.Product.create.return_value = MagicMock(id='prod_live')
        s.Price.create.return_value = MagicMock(id='price_live')
        mock_client.return_value = s

        result = sync_plan_to_stripe(self.plan)

        self.plan.refresh_from_db()
        self.assertIn('synced', result)
        self.assertEqual(self.plan.stripe_product_id, 'prod_live')
        self.assertEqual(self.plan.stripe_price_id, 'price_live')

    @patch('services.plan_pricing_service.stripe_configured', return_value=True)
    @patch('services.plan_pricing_service._client')
    def test_a_price_orphaned_from_its_product_is_replaced(self, mock_client, _cfg):
        """A recreated product leaves the old price attached to the dead one."""
        self.plan.stripe_product_id = 'prod_old'
        self.plan.stripe_price_id = 'price_1'
        self.plan.save()

        import stripe as stripe_lib

        s = MagicMock()
        s.Product.retrieve.side_effect = stripe_lib.InvalidRequestError(
            'No such product', 'id', http_status=404,
        )
        s.Product.create.return_value = MagicMock(id='prod_new')
        # Same amount, but still hanging off the product that no longer exists.
        s.Price.retrieve.return_value = _price(39900, 'prod_old')
        s.Price.create.return_value = MagicMock(id='price_2')
        mock_client.return_value = s

        result = sync_plan_to_stripe(self.plan)

        self.plan.refresh_from_db()
        self.assertIn('synced', result)
        self.assertEqual(self.plan.stripe_product_id, 'prod_new')
        self.assertEqual(self.plan.stripe_price_id, 'price_2')

    @patch('services.plan_pricing_service.stripe_configured', return_value=True)
    @patch('services.plan_pricing_service._client')
    def test_auth_failure_is_not_mistaken_for_a_missing_object(self, mock_client, _cfg):
        """A revoked key must fail loudly, never silently duplicate a price."""
        import stripe as stripe_lib

        self.plan.stripe_product_id = 'prod_1'
        self.plan.stripe_price_id = 'price_1'
        self.plan.save()

        s = MagicMock()
        s.Product.retrieve.side_effect = stripe_lib.AuthenticationError('Invalid API key')
        mock_client.return_value = s

        with self.assertRaises(StripeSyncError):
            sync_plan_to_stripe(self.plan)
        s.Price.create.assert_not_called()

    @patch('services.plan_pricing_service.stripe_configured', return_value=True)
    @patch('services.plan_pricing_service._client')
    def test_stripe_failure_surfaces_as_sync_error(self, mock_client, _cfg):
        import stripe as stripe_lib

        s = MagicMock()
        s.Product.create.side_effect = stripe_lib.StripeError('card_declined')
        s.StripeError = stripe_lib.StripeError
        mock_client.return_value = s

        with self.assertRaises(StripeSyncError):
            sync_plan_to_stripe(self.plan)


class AnnualDiscountTest(TestCase):
    """The discount is admin-set, so the arithmetic has to hold for any value."""

    def test_no_discount_means_no_annual_offer(self):
        plan = make_paid_plan()
        self.assertFalse(plan.offers_annual)
        self.assertEqual(plan.annual_monthly_equivalent, Decimal('399'))

    def test_discount_derives_both_figures(self):
        plan = make_paid_plan(annual_discount_percent=20)
        self.assertTrue(plan.offers_annual)
        self.assertEqual(plan.annual_monthly_equivalent, Decimal('319.20'))
        self.assertEqual(plan.price_annual_total, Decimal('3830.40'))

    def test_odd_percentage_keeps_cents(self):
        """A third off 399 is 266.33 — the rounding must not lose the cent."""
        plan = make_paid_plan(annual_discount_percent=33)
        self.assertEqual(plan.annual_monthly_equivalent, Decimal('267.33'))
        self.assertEqual(plan.price_annual_total, Decimal('3207.96'))

    def test_free_and_enterprise_never_offer_annual(self):
        free = SubscriptionPlan.objects.create(
            name='Basic', price_monthly=0, is_free=True, annual_discount_percent=20,
        )
        ent = SubscriptionPlan.objects.create(
            name='Ent', price_monthly=0, is_enterprise=True, annual_discount_percent=20,
        )
        self.assertFalse(free.offers_annual)
        self.assertFalse(ent.offers_annual)


class AnnualStripeSyncTest(TestCase):
    def setUp(self):
        self.plan = make_paid_plan(annual_discount_percent=20)

    @patch('services.plan_pricing_service.stripe_configured', return_value=True)
    @patch('services.plan_pricing_service._client')
    def test_discount_creates_a_yearly_price(self, mock_client, _cfg):
        s = MagicMock()
        s.Product.create.return_value = MagicMock(id='prod_1')
        s.Price.create.side_effect = [
            MagicMock(id='price_month'), MagicMock(id='price_year'),
        ]
        mock_client.return_value = s

        sync_plan_to_stripe(self.plan)

        self.plan.refresh_from_db()
        self.assertEqual(self.plan.stripe_price_id, 'price_month')
        self.assertEqual(self.plan.stripe_price_id_annual, 'price_year')

        monthly, annual = s.Price.create.call_args_list
        self.assertEqual(monthly.kwargs['unit_amount'], 39900)
        self.assertEqual(monthly.kwargs['recurring'], {'interval': 'month'})
        # 319.20 x 12 — the yearly total, not the monthly figure.
        self.assertEqual(annual.kwargs['unit_amount'], 383040)
        self.assertEqual(annual.kwargs['recurring'], {'interval': 'year'})

    @patch('services.plan_pricing_service.stripe_configured', return_value=True)
    @patch('services.plan_pricing_service._client')
    def test_changing_the_discount_replaces_the_yearly_price(self, mock_client, _cfg):
        self.plan.stripe_product_id = 'prod_1'
        self.plan.stripe_price_id = 'price_month'
        self.plan.stripe_price_id_annual = 'price_year_old'
        self.plan.annual_discount_percent = 30
        self.plan.save()

        s = MagicMock()
        s.Product.retrieve.return_value = MagicMock(id='prod_1')
        s.Price.retrieve.side_effect = [
            _price(39900, 'prod_1', 'month'),          # monthly unchanged
            _price(383040, 'prod_1', 'year'),          # yearly still at 20% off
        ]
        s.Price.create.return_value = MagicMock(id='price_year_new')
        mock_client.return_value = s

        sync_plan_to_stripe(self.plan)

        self.plan.refresh_from_db()
        self.assertEqual(self.plan.stripe_price_id, 'price_month')
        self.assertEqual(self.plan.stripe_price_id_annual, 'price_year_new')
        # 399 x 0.70 x 12
        self.assertEqual(s.Price.create.call_args.kwargs['unit_amount'], 335160)
        s.Price.modify.assert_called_once_with('price_year_old', active=False)

    @patch('services.plan_pricing_service.stripe_configured', return_value=True)
    @patch('services.plan_pricing_service._client')
    def test_removing_the_discount_withdraws_the_yearly_price(self, mock_client, _cfg):
        """Otherwise the yearly price stays purchasable after the offer ends."""
        self.plan.stripe_product_id = 'prod_1'
        self.plan.stripe_price_id = 'price_month'
        self.plan.stripe_price_id_annual = 'price_year'
        self.plan.annual_discount_percent = 0
        self.plan.save()

        s = MagicMock()
        s.Product.retrieve.return_value = MagicMock(id='prod_1')
        s.Price.retrieve.return_value = _price(39900, 'prod_1', 'month')
        mock_client.return_value = s

        sync_plan_to_stripe(self.plan)

        self.plan.refresh_from_db()
        self.assertEqual(self.plan.stripe_price_id_annual, '')
        s.Price.modify.assert_called_once_with('price_year', active=False)

    @patch('services.plan_pricing_service.stripe_configured', return_value=True)
    @patch('services.plan_pricing_service._client')
    def test_a_monthly_price_is_not_accepted_for_the_yearly_slot(self, mock_client, _cfg):
        """Interval is part of the match, or a monthly price bills 12x too little."""
        self.plan.stripe_product_id = 'prod_1'
        self.plan.stripe_price_id = 'price_month'
        self.plan.stripe_price_id_annual = 'price_wrong'
        self.plan.save()

        s = MagicMock()
        s.Product.retrieve.return_value = MagicMock(id='prod_1')
        s.Price.retrieve.side_effect = [
            _price(39900, 'prod_1', 'month'),
            _price(383040, 'prod_1', 'month'),   # right amount, wrong interval
        ]
        s.Price.create.return_value = MagicMock(id='price_year')
        mock_client.return_value = s

        sync_plan_to_stripe(self.plan)

        self.plan.refresh_from_db()
        self.assertEqual(self.plan.stripe_price_id_annual, 'price_year')


class AnnualCheckoutTest(TestCase):
    """Which price gets billed must be decided from the plan, not the request."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='emp@test.com', password='StrongPass1', first_name='Em',
            last_name='Ployer', user_type='employer',
        )
        EmployerProfile.objects.get_or_create(user=self.user, defaults={'company_name': 'Co'})
        self.client.force_authenticate(self.user)
        self.plan = make_paid_plan(
            annual_discount_percent=20,
            stripe_price_id='price_month',
            stripe_price_id_annual='price_year',
        )

    @patch('subscriptions.views._stripe')
    def test_annual_request_bills_the_yearly_price(self, mock_stripe):
        s = MagicMock()
        s.checkout.Session.create.return_value = MagicMock(url='https://stripe.test/s')
        mock_stripe.return_value = s

        r = self.client.post(
            '/api/v1/subscriptions/create-checkout/',
            {'plan_id': self.plan.id, 'billing': 'annual'}, format='json',
        )

        self.assertEqual(r.status_code, 200)
        line_items = s.checkout.Session.create.call_args.kwargs['line_items']
        self.assertEqual(line_items[0]['price'], 'price_year')

    @patch('subscriptions.views._stripe')
    def test_default_is_monthly(self, mock_stripe):
        s = MagicMock()
        s.checkout.Session.create.return_value = MagicMock(url='https://stripe.test/s')
        mock_stripe.return_value = s

        self.client.post(
            '/api/v1/subscriptions/create-checkout/',
            {'plan_id': self.plan.id}, format='json',
        )

        line_items = s.checkout.Session.create.call_args.kwargs['line_items']
        self.assertEqual(line_items[0]['price'], 'price_month')

    def test_annual_is_refused_when_the_plan_does_not_offer_it(self):
        self.plan.annual_discount_percent = 0
        self.plan.save()

        r = self.client.post(
            '/api/v1/subscriptions/create-checkout/',
            {'plan_id': self.plan.id, 'billing': 'annual'}, format='json',
        )

        self.assertEqual(r.status_code, 400)

    def test_an_unknown_billing_value_is_rejected(self):
        r = self.client.post(
            '/api/v1/subscriptions/create-checkout/',
            {'plan_id': self.plan.id, 'billing': 'weekly'}, format='json',
        )

        self.assertEqual(r.status_code, 400)


class PlanSyncEndpointTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(make_admin())
        self.plan = make_paid_plan()

    @patch('admin_panel.views.sync_plan_to_stripe', return_value='synced: new Stripe price created')
    def test_sync_endpoint_reports_result(self, _sync):
        res = self.client.post(f'/api/v1/admin/plans/{self.plan.pk}/sync-stripe/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('synced', res.json()['message'])

    @patch('admin_panel.views.sync_plan_to_stripe', side_effect=StripeSyncError('no such product'))
    def test_stripe_error_is_a_bad_gateway_not_a_crash(self, _sync):
        res = self.client.post(f'/api/v1/admin/plans/{self.plan.pk}/sync-stripe/')
        self.assertEqual(res.status_code, 502)
        self.assertIn('no such product', res.json()['message'])


class PublicPricingReflectsAdminEditsTest(TestCase):
    """The point of the feature: what the admin saves is what visitors see."""

    def setUp(self):
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())
        self.plan = make_paid_plan()

    def test_public_plan_list_shows_the_edited_price(self):
        self.admin.put(
            f'/api/v1/admin/plans/{self.plan.pk}/',
            {'price_monthly': '450', 'features': ['New feature']},
            format='json',
        )
        res = self.client.get('/api/v1/subscriptions/plans/employer/')
        self.assertEqual(res.status_code, 200)
        plan = [p for p in res.json()['data'] if p['id'] == self.plan.pk][0]
        self.assertEqual(Decimal(plan['price_monthly']), Decimal('450'))
        self.assertEqual(plan['features'], ['New feature'])

    def test_public_plan_list_carries_the_admins_discount(self):
        """The page must not compute the discount itself — this is the path
        that let the advertised 20% drift from what Stripe actually billed."""
        self.admin.put(
            f'/api/v1/admin/plans/{self.plan.pk}/',
            {'annual_discount_percent': 15}, format='json',
        )
        res = self.client.get('/api/v1/subscriptions/plans/employer/')
        plan = [p for p in res.json()['data'] if p['id'] == self.plan.pk][0]

        self.assertTrue(plan['offers_annual'])
        self.assertEqual(plan['annual_discount_percent'], 15)
        self.assertEqual(Decimal(plan['annual_monthly_equivalent']), Decimal('339.15'))
        self.assertEqual(Decimal(plan['price_annual_total']), Decimal('4069.80'))

    def test_job_post_limit_change_takes_effect_immediately(self):
        from services.subscription_service import check_job_posting_limit

        user = User.objects.create_user(
            email='limit@test.com', password='StrongPass1',
            first_name='L', last_name='T', user_type='employer',
        )
        employer = EmployerProfile.objects.create(
            user=user, company_name='Co', company_type='employer',
        )
        UserSubscription.objects.create(user=user, plan=self.plan, status='active')

        self.admin.put(
            f'/api/v1/admin/plans/{self.plan.pk}/', {'job_post_limit': 0}, format='json',
        )

        allowed, _ = check_job_posting_limit(user, employer)
        self.assertFalse(allowed)
