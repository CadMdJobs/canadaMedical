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
        s.Price.retrieve.return_value = MagicMock(unit_amount=39900, currency='usd')
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
        s.Price.retrieve.return_value = MagicMock(unit_amount=39900, currency='usd')
        s.Price.create.return_value = MagicMock(id='price_new')
        mock_client.return_value = s

        sync_plan_to_stripe(self.plan)

        self.plan.refresh_from_db()
        self.assertEqual(self.plan.stripe_price_id, 'price_new')
        s.Price.modify.assert_called_once_with('price_old', active=False)

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
