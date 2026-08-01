import stripe
import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView

from core.exceptions import success_response
from core.permissions import IsEmployer, IsAdminUser
from .models import SubscriptionPlan, UserSubscription, PaymentHistory, EnterpriseRequest, CustomSubscriptionPlan
from emails.tasks import (
    send_payment_confirmation_email_task,
    send_admin_payment_received_email_task,
    send_admin_payment_failed_email_task,
    send_admin_subscription_cancelled_email_task,
)
from .serializers import (
    SubscriptionPlanSerializer, UserSubscriptionSerializer, PaymentHistorySerializer,
    EnterpriseRequestSerializer, EnterpriseRequestAdminSerializer, CustomSubscriptionPlanSerializer,
)

logger = logging.getLogger(__name__)


def _stripe():
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


class EmployerPlanListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        plans = SubscriptionPlan.objects.filter(plan_type='employer')
        return success_response(data=SubscriptionPlanSerializer(plans, many=True).data)


class CreateCheckoutSessionView(APIView):
    permission_classes = [IsEmployer]

    def post(self, request):
        plan_id = request.data.get('plan_id')
        if not plan_id:
            return success_response(
                message='plan_id is required.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        try:
            plan = SubscriptionPlan.objects.get(pk=plan_id, plan_type='employer')
        except SubscriptionPlan.DoesNotExist:
            return success_response(message='Plan not found.', status_code=status.HTTP_404_NOT_FOUND)

        if not plan.stripe_price_id:
            return success_response(
                message='This plan does not support online checkout. Please contact sales.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        s = _stripe()
        try:
            session = s.checkout.Session.create(
                payment_method_types=['card'],
                mode='subscription',
                line_items=[{'price': plan.stripe_price_id, 'quantity': 1}],
                success_url=f"{settings.FRONTEND_URL}/dashboard/employer?subscription=success&session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{settings.FRONTEND_URL}/employers?subscription=cancelled",
                customer_email=request.user.email,
                metadata={
                    'user_id': str(request.user.id),
                    'plan_id': str(plan.id),
                },
            )
        except stripe.StripeError as e:
            logger.error('Stripe checkout error: %s', e)
            return success_response(
                message='Payment provider error. Please try again.',
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

        return success_response(data={'checkout_url': session.url})


@method_decorator(csrf_exempt, name='dispatch')
class StripeWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        payload = request.body
        sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')
        webhook_secret = getattr(settings, 'STRIPE_WEBHOOK_SECRET', '')

        if not webhook_secret:
            logger.error('STRIPE_WEBHOOK_SECRET is not configured — rejecting webhook')
            return HttpResponse(status=403)

        s = _stripe()
        try:
            event = s.Webhook.construct_event(payload, sig_header, webhook_secret)
        except ValueError:
            logger.warning('Webhook: invalid payload received')
            return HttpResponse(status=400)
        except stripe.SignatureVerificationError:
            logger.warning('Webhook: invalid signature — possible replay or spoofing attempt')
            return HttpResponse(status=400)

        event_type = event['type']
        data = event['data']['object']

        try:
            if event_type == 'checkout.session.completed':
                self._handle_checkout_completed(data)
            elif event_type == 'customer.subscription.updated':
                self._handle_subscription_updated(data)
            elif event_type == 'customer.subscription.deleted':
                self._handle_subscription_deleted(data)
            elif event_type == 'invoice.payment_succeeded':
                self._handle_invoice_paid(data)
            elif event_type == 'invoice.payment_failed':
                sub_id = getattr(data, 'subscription', '') or ''
                UserSubscription.objects.filter(stripe_subscription_id=sub_id).update(status='past_due')
                try:
                    user_sub = UserSubscription.objects.select_related('user', 'plan').get(stripe_subscription_id=sub_id)
                    send_admin_payment_failed_email_task.delay(user_sub.user.pk, user_sub.plan.name)
                except UserSubscription.DoesNotExist:
                    pass
        except stripe.StripeError as e:
            logger.exception('Stripe error in webhook handler for event %s', event_type)
            return HttpResponse(status=500)
        except Exception:
            logger.exception('Unexpected error in webhook handler for event %s', event_type)
            return HttpResponse(status=500)

        return HttpResponse(status=200)

    def _handle_checkout_completed(self, session):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        metadata = getattr(session, 'metadata', None) or {}
        user_id = metadata.get('user_id') if hasattr(metadata, 'get') else getattr(metadata, 'user_id', None)
        plan_id = metadata.get('plan_id') if hasattr(metadata, 'get') else getattr(metadata, 'plan_id', None)
        is_custom_plan = (metadata.get('custom_plan') if hasattr(metadata, 'get') else getattr(metadata, 'custom_plan', None)) == 'true'
        enterprise_request_id = metadata.get('enterprise_request_id') if hasattr(metadata, 'get') else getattr(metadata, 'enterprise_request_id', None)
        customer_id = getattr(session, 'customer', '') or ''
        subscription_id = getattr(session, 'subscription', '') or ''

        if not user_id:
            return

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            logger.warning('Webhook: user_id=%s not found in checkout.session.completed', user_id)
            return

        amount_total = getattr(session, 'amount_total', None) or 0
        currency = getattr(session, 'currency', 'cad') or 'cad'

        # ── Custom / Enterprise payment link ──────────────────────────────
        if is_custom_plan and enterprise_request_id:
            try:
                custom_plan = CustomSubscriptionPlan.objects.select_related('enterprise_request').get(
                    enterprise_request_id=enterprise_request_id
                )
                now = timezone.now()
                custom_plan.is_active = True
                custom_plan.payment_status = 'paid'
                custom_plan.save(update_fields=['is_active', 'payment_status', 'updated_at'])

                # Cancel any existing Stripe subscription (e.g. Professional plan)
                # before switching the user to the new enterprise subscription.
                self._cancel_old_subscription(user, new_subscription_id=subscription_id)

                # Move UserSubscription to enterprise plan
                try:
                    enterprise_plan = SubscriptionPlan.objects.get(plan_type='employer', is_enterprise=True)
                    UserSubscription.objects.update_or_create(
                        user=user,
                        defaults={
                            'plan': enterprise_plan,
                            'stripe_customer_id': customer_id,
                            'stripe_subscription_id': subscription_id,
                            'status': 'active',
                            'cancel_at_period_end': False,
                            'current_period_start': now,
                            'current_period_end': now + timedelta(days=30),
                        },
                    )
                except SubscriptionPlan.DoesNotExist:
                    pass

                PaymentHistory.objects.create(
                    user=user,
                    amount=amount_total / 100,
                    currency=currency,
                    status='succeeded',
                    description=f'Enterprise Custom Plan — {custom_plan.enterprise_request.organization_name}',
                    stripe_payment_intent_id=getattr(session, 'payment_intent', '') or '',
                )
            except CustomSubscriptionPlan.DoesNotExist:
                logger.error(
                    'CustomSubscriptionPlan not found for enterprise_request_id=%s — '
                    'webhook will return 500 so Stripe retries',
                    enterprise_request_id,
                )
                raise
            return

        # ── Standard plan checkout ─────────────────────────────────────────
        if not plan_id:
            return

        try:
            plan = SubscriptionPlan.objects.get(pk=plan_id)
        except SubscriptionPlan.DoesNotExist:
            logger.warning('Webhook: plan_id=%s not found in session metadata', plan_id)
            return

        now = timezone.now()
        UserSubscription.objects.update_or_create(
            user=user,
            defaults={
                'plan': plan,
                'stripe_customer_id': customer_id,
                'stripe_subscription_id': subscription_id,
                'status': 'active',
                'cancel_at_period_end': False,
                'current_period_start': now,
                'current_period_end': now + timedelta(days=30),
            },
        )

        PaymentHistory.objects.create(
            user=user,
            amount=amount_total / 100,
            currency=currency,
            status='succeeded',
            description=f'{plan.name} Plan — Monthly',
            stripe_payment_intent_id=getattr(session, 'payment_intent', '') or '',
        )

        try:
            sub_obj = UserSubscription.objects.get(user=user)
            period_end = sub_obj.current_period_end.strftime('%B %d, %Y') if sub_obj.current_period_end else ''
        except UserSubscription.DoesNotExist:
            period_end = ''
        send_payment_confirmation_email_task.delay(
            user.pk,
            plan.name,
            f"${amount_total / 100:.2f}",
            period_end,
        )
        send_admin_payment_received_email_task.delay(
            user.pk,
            plan.name,
            f"${amount_total / 100:.2f}",
        )

    def _handle_subscription_updated(self, sub):
        sub_id = getattr(sub, 'id', '') or ''
        if not sub_id:
            return

        period_end = getattr(sub, 'current_period_end', None)
        period_start = getattr(sub, 'current_period_start', None)
        cancel_at = getattr(sub, 'cancel_at_period_end', False)
        stripe_status = getattr(sub, 'status', 'active') or 'active'

        status_map = {
            'active':   'active',
            'past_due': 'past_due',
            'canceled': 'cancelled',
            'trialing': 'trialing',
            'unpaid':   'past_due',
        }

        updates = {
            'status': status_map.get(stripe_status, 'inactive'),
            'cancel_at_period_end': cancel_at,
        }
        if period_start:
            updates['current_period_start'] = timezone.make_aware(
                datetime.utcfromtimestamp(period_start), dt_timezone.utc
            )
        if period_end:
            updates['current_period_end'] = timezone.make_aware(
                datetime.utcfromtimestamp(period_end), dt_timezone.utc
            )

        UserSubscription.objects.filter(stripe_subscription_id=sub_id).update(**updates)

    def _handle_invoice_paid(self, invoice):
        sub_id = getattr(invoice, 'subscription', '') or ''
        if not sub_id:
            return
        try:
            user_sub = UserSubscription.objects.select_related('user', 'plan').get(
                stripe_subscription_id=sub_id
            )
        except UserSubscription.DoesNotExist:
            return

        period_end = getattr(invoice, 'period_end', None)
        if period_end:
            user_sub.current_period_end = timezone.make_aware(
                datetime.utcfromtimestamp(period_end), dt_timezone.utc
            )
            user_sub.status = 'active'
            user_sub.save(update_fields=['current_period_end', 'status'])

        amount_paid = getattr(invoice, 'amount_paid', 0) or 0
        PaymentHistory.objects.create(
            user=user_sub.user,
            amount=amount_paid / 100,
            currency=getattr(invoice, 'currency', 'cad') or 'cad',
            status='succeeded',
            description=f'{user_sub.plan.name} Plan — Renewal',
            stripe_payment_intent_id=getattr(invoice, 'payment_intent', '') or '',
            stripe_invoice_id=getattr(invoice, 'id', '') or '',
        )

        next_period_end = user_sub.current_period_end.strftime('%B %d, %Y') if user_sub.current_period_end else ''
        send_payment_confirmation_email_task.delay(
            user_sub.user.pk,
            user_sub.plan.name,
            f"${amount_paid / 100:.2f}",
            next_period_end,
        )
        send_admin_payment_received_email_task.delay(
            user_sub.user.pk,
            f"{user_sub.plan.name} — Renewal",
            f"${amount_paid / 100:.2f}",
        )

    def _cancel_old_subscription(self, user, new_subscription_id: str):
        """Cancel the user's existing Stripe subscription (if any) when they
        upgrade to a new plan so they are not double-charged."""
        try:
            old_sub = UserSubscription.objects.get(user=user)
            old_sid = old_sub.stripe_subscription_id or ''
            if old_sid and old_sid != new_subscription_id:
                s = _stripe()
                try:
                    s.Subscription.modify(old_sid, cancel_at_period_end=True)
                    old_sub.cancel_at_period_end = True
                    old_sub.save(update_fields=['cancel_at_period_end'])
                    logger.info(
                        'Old subscription %s scheduled for cancellation (user %s upgrading to enterprise)',
                        old_sid, user.email,
                    )
                except stripe.StripeError as e:
                    logger.warning('Could not cancel old subscription %s during enterprise upgrade: %s', old_sid, e)
        except UserSubscription.DoesNotExist:
            pass

    def _handle_subscription_deleted(self, sub):
        """Handle customer.subscription.deleted:
        - Mark UserSubscription as cancelled
        - Deactivate associated CustomSubscriptionPlan
        - Downgrade user to free plan
        """
        sub_id = getattr(sub, 'id', '') or ''
        if not sub_id:
            return

        qs = UserSubscription.objects.filter(stripe_subscription_id=sub_id).select_related('user', 'plan')
        for user_sub in qs:
            send_admin_subscription_cancelled_email_task.delay(user_sub.user.pk, user_sub.plan.name)
            # Deactivate custom plan if this was an enterprise subscription
            try:
                cp = user_sub.user.custom_plan
                if cp.is_active and cp.payment_status == 'paid':
                    cp.is_active = False
                    cp.save(update_fields=['is_active', 'updated_at'])
            except CustomSubscriptionPlan.DoesNotExist:
                pass

            # Downgrade UserSubscription to free plan
            try:
                free_plan = SubscriptionPlan.objects.get(is_free=True, plan_type='employer')
                user_sub.plan = free_plan
                user_sub.status = 'cancelled'
                user_sub.stripe_subscription_id = ''
                user_sub.cancel_at_period_end = False
                user_sub.save(update_fields=['plan', 'status', 'stripe_subscription_id', 'cancel_at_period_end'])
            except SubscriptionPlan.DoesNotExist:
                user_sub.status = 'cancelled'
                user_sub.save(update_fields=['status'])


class MySubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            sub = UserSubscription.objects.select_related('plan').get(user=request.user)
        except UserSubscription.DoesNotExist:
            # No subscription row — return a synthetic free-plan object so the
            # frontend always has something to render (plan info + upgrade CTA).
            from django.core.cache import cache
            free_plan = cache.get('free_employer_plan')
            if free_plan is None:
                free_plan = SubscriptionPlan.objects.filter(is_free=True, plan_type='employer').first()
                cache.set('free_employer_plan', free_plan, timeout=3600)
            import jobs.models as jobs_models
            try:
                jobs_posted = jobs_models.Job.objects.filter(
                    employer=request.user.employer_profile, is_active=True
                ).count()
            except AttributeError:
                jobs_posted = 0
            limit = free_plan.job_post_limit if free_plan else 1
            return success_response(data={
                'plan_name': free_plan.name if free_plan else 'Free',
                'plan_type': 'standard',
                'is_custom': False,
                'status': 'active',
                'price_monthly': str(free_plan.price_monthly) if free_plan else '0.00',
                'current_period_end': None,
                'days_remaining': None,
                'job_post_limit': limit,
                'jobs_posted': jobs_posted,
                'jobs_remaining': max(0, limit - jobs_posted) if limit is not None else None,
                'cancel_at_period_end': False,
                'has_stripe_subscription': False,
            })

        data = UserSubscriptionSerializer(sub).data

        # Enrich with custom plan info if one exists (active OR pending payment)
        import datetime
        today = datetime.date.today()
        active_custom = None
        pending_custom = None
        try:
            cp = request.user.custom_plan
            if cp.is_active and (cp.valid_until is None or cp.valid_until >= today):
                active_custom = cp
            elif cp.payment_status == 'pending_payment':
                pending_custom = cp
        except CustomSubscriptionPlan.DoesNotExist:
            pass

        if active_custom:
            data['is_custom'] = True
            data['plan_type'] = 'enterprise_custom'
            data['custom_job_limit'] = active_custom.job_post_limit
            data['custom_price_monthly'] = str(active_custom.price_monthly)
            data['custom_features'] = active_custom.features
            data['custom_valid_until'] = str(active_custom.valid_until) if active_custom.valid_until else None
            data['custom_payment_status'] = 'paid'
            data['custom_payment_link'] = None
        elif pending_custom:
            # Plan approved but not yet paid — surface the payment link
            data['is_custom'] = True
            data['plan_type'] = 'enterprise_custom'
            data['custom_job_limit'] = pending_custom.job_post_limit
            data['custom_price_monthly'] = str(pending_custom.price_monthly)
            data['custom_features'] = pending_custom.features
            data['custom_valid_until'] = str(pending_custom.valid_until) if pending_custom.valid_until else None
            data['custom_payment_status'] = 'pending_payment'
            data['custom_payment_link'] = pending_custom.stripe_payment_link_url or None
        else:
            data['is_custom'] = False
            data['plan_type'] = 'enterprise' if sub.plan.is_enterprise else 'standard'
            data['custom_payment_status'] = None
            data['custom_payment_link'] = None
            # For enterprise plans, surface the job limit from the approved request
            # (plan.job_post_limit is NULL for enterprise — the limit lives on the request)
            if sub.plan.is_enterprise:
                try:
                    er = EnterpriseRequest.objects.filter(
                        user=request.user, status='approved'
                    ).order_by('-approved_at').first()
                    if er and er.custom_job_limit:
                        data['job_post_limit'] = er.custom_job_limit
                        data['jobs_remaining'] = max(0, er.custom_job_limit - (data.get('jobs_posted') or 0))
                except Exception:
                    pass

        # Expose whether a Stripe subscription exists so the frontend can
        # decide to show "Cancel plan" regardless of local status value.
        # The actual stripe_subscription_id is never sent to the client.
        data['has_stripe_subscription'] = bool(sub.stripe_subscription_id)

        return success_response(data=data)


class CancelSubscriptionView(APIView):
    permission_classes = [IsEmployer]

    def post(self, request):
        try:
            sub = UserSubscription.objects.get(user=request.user)
        except UserSubscription.DoesNotExist:
            return success_response(
                message='No active subscription found.', status_code=status.HTTP_404_NOT_FOUND
            )

        if not sub.stripe_subscription_id:
            return success_response(
                message='No Stripe subscription to cancel.', status_code=status.HTTP_400_BAD_REQUEST
            )

        s = _stripe()
        try:
            s.Subscription.modify(sub.stripe_subscription_id, cancel_at_period_end=True)
        except stripe.StripeError as e:
            logger.error('Stripe cancel error: %s', e)
            return success_response(
                message='Payment provider error.', status_code=status.HTTP_502_BAD_GATEWAY
            )

        # Stripe confirmed — now update our DB (webhook will also sync this)
        sub.cancel_at_period_end = True
        sub.save(update_fields=['cancel_at_period_end'])
        send_admin_subscription_cancelled_email_task.delay(request.user.pk, sub.plan.name)
        return success_response(
            message='Subscription will cancel at the end of the current billing period.'
        )


class ReactivateSubscriptionView(APIView):
    permission_classes = [IsEmployer]

    def post(self, request):
        try:
            sub = UserSubscription.objects.get(user=request.user)
        except UserSubscription.DoesNotExist:
            return success_response(
                message='No subscription found.',
                status_code=status.HTTP_404_NOT_FOUND,
            )

        if not sub.stripe_subscription_id:
            return success_response(
                message='No Stripe subscription to reactivate.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if not sub.cancel_at_period_end:
            return success_response(
                message='Subscription is already active and not scheduled for cancellation.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        s = _stripe()
        try:
            s.Subscription.modify(sub.stripe_subscription_id, cancel_at_period_end=False)
        except stripe.StripeError as e:
            logger.error('Stripe reactivation error: %s', e)
            return success_response(
                message='Payment provider error. Please try again.',
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

        # Stripe confirmed — update DB
        sub.cancel_at_period_end = False
        sub.save(update_fields=['cancel_at_period_end'])
        return success_response(message='Subscription reactivated successfully. Your plan will continue as normal.')


class SyncSubscriptionView(APIView):
    """
    Called by the frontend after Stripe checkout success redirect.
    Uses the checkout session_id (passed in the success URL) to retrieve the
    session directly from Stripe — no webhook needed.
    """
    permission_classes = [IsEmployer]

    def post(self, request):
        session_id = request.data.get('session_id', '').strip()
        if not session_id:
            return success_response(
                message='session_id is required.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        s = _stripe()
        try:
            session = s.checkout.Session.retrieve(
                session_id,
                expand=['subscription', 'subscription.items.data.price'],
            )
        except stripe.StripeError as e:
            logger.error('Stripe session retrieve failed: %s', e)
            return success_response(message='Stripe error.', status_code=status.HTTP_502_BAD_GATEWAY)

        if session.payment_status != 'paid':
            return success_response(message='Payment not completed yet.')

        # Parse period timestamps safely
        def _ts(val):
            if not val:
                return None
            try:
                return timezone.make_aware(datetime.utcfromtimestamp(int(val)), dt_timezone.utc)
            except Exception:
                return None

        # ── Custom / Enterprise payment link ──────────────────────────────────
        metadata = getattr(session, 'metadata', None) or {}
        is_custom = (metadata.get('custom_plan') if hasattr(metadata, 'get') else getattr(metadata, 'custom_plan', None)) == 'true'
        enterprise_request_id = metadata.get('enterprise_request_id') if hasattr(metadata, 'get') else getattr(metadata, 'enterprise_request_id', None)

        if is_custom and enterprise_request_id:
            try:
                cp = CustomSubscriptionPlan.objects.select_related('enterprise_request').get(
                    enterprise_request_id=enterprise_request_id
                )
            except CustomSubscriptionPlan.DoesNotExist:
                # Fall back to lookup by user in case enterprise_request changed (re-approval)
                try:
                    cp = request.user.custom_plan
                except CustomSubscriptionPlan.DoesNotExist:
                    return success_response(message='Custom plan not found.')

            now = timezone.now()
            cp.is_active = True
            cp.payment_status = 'paid'
            cp.save(update_fields=['is_active', 'payment_status', 'updated_at'])

            stripe_sub = session.subscription
            customer_id = getattr(session, 'customer', '') or ''
            subscription_id = stripe_sub.id if stripe_sub else ''

            try:
                enterprise_plan = SubscriptionPlan.objects.get(plan_type='employer', is_enterprise=True)
                UserSubscription.objects.update_or_create(
                    user=request.user,
                    defaults={
                        'plan': enterprise_plan,
                        'stripe_customer_id': customer_id,
                        'stripe_subscription_id': subscription_id,
                        'status': 'active',
                        'cancel_at_period_end': False,
                        'current_period_start': now,
                        'current_period_end': _ts(getattr(stripe_sub, 'current_period_end', None)) or now + timedelta(days=30),
                    },
                )
            except SubscriptionPlan.DoesNotExist:
                pass

            amount_total = getattr(session, 'amount_total', None) or 0
            currency = getattr(session, 'currency', 'cad') or 'cad'
            PaymentHistory.objects.get_or_create(
                stripe_payment_intent_id=getattr(session, 'payment_intent', '') or '',
                defaults={
                    'user': request.user,
                    'amount': amount_total / 100,
                    'currency': currency,
                    'status': 'succeeded',
                    'description': f'Enterprise Custom Plan — {cp.enterprise_request.organization_name}',
                },
            )

            send_payment_confirmation_email_task.delay(
                request.user.pk,
                'Enterprise Custom Plan',
                f"${amount_total / 100:.2f}",
                '',
            )

            logger.info('Custom plan activated via session %s for user %s', session_id, request.user.email)
            return success_response(message='Enterprise plan activated.')

        # ── Standard plan checkout ─────────────────────────────────────────────
        stripe_sub = session.subscription
        if not stripe_sub:
            return success_response(message='No subscription attached to this session.')

        # Get plan from price ID
        try:
            price_id = stripe_sub.items.data[0].price.id
            plan = SubscriptionPlan.objects.get(stripe_price_id=price_id)
        except (IndexError, AttributeError, SubscriptionPlan.DoesNotExist):
            return success_response(message='Plan not recognised — contact support.')

        UserSubscription.objects.update_or_create(
            user=request.user,
            defaults={
                'plan': plan,
                'stripe_customer_id': getattr(session, 'customer', '') or '',
                'stripe_subscription_id': stripe_sub.id,
                'status': 'active',
                'cancel_at_period_end': getattr(stripe_sub, 'cancel_at_period_end', False),
                'current_period_start': _ts(getattr(stripe_sub, 'current_period_start', None)),
                'current_period_end': _ts(getattr(stripe_sub, 'current_period_end', None)),
            },
        )
        amount_total = getattr(session, 'amount_total', None) or 0
        send_admin_payment_received_email_task.delay(
            request.user.pk,
            plan.name,
            f"${amount_total / 100:.2f}",
        )
        logger.info('Subscription synced via session %s for user %s', session_id, request.user.email)
        return success_response(message='Subscription synced.')


class PaymentHistoryView(APIView):
    permission_classes = [IsAuthenticated]
    PAGE_SIZE = 20

    def get(self, request):
        payments = PaymentHistory.objects.filter(user=request.user)
        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except (ValueError, TypeError):
            page = 1
        start = (page - 1) * self.PAGE_SIZE
        total = payments.count()
        return success_response(data={
            'results': PaymentHistorySerializer(payments[start:start + self.PAGE_SIZE], many=True).data,
            'count': total,
            'page': page,
            'page_size': self.PAGE_SIZE,
            'total_pages': max(1, -(-total // self.PAGE_SIZE)),
        })


# ---------------------------------------------------------------------------
# Enterprise Plan views
# ---------------------------------------------------------------------------

class SyncCustomPlanView(APIView):
    """
    Called after the user pays via a custom-plan payment link.
    Works even when no session_id is available (old payment links).
    Queries Stripe for the most recent completed checkout session on this
    payment link and activates the plan if payment is confirmed.
    """
    permission_classes = [IsEmployer]

    def post(self, request):
        try:
            cp = request.user.custom_plan
        except CustomSubscriptionPlan.DoesNotExist:
            return success_response(message='No custom plan found.', status_code=status.HTTP_404_NOT_FOUND)

        if cp.payment_status == 'paid' and cp.is_active:
            return success_response(message='Plan already active.')

        if cp.payment_status != 'pending_payment':
            return success_response(message='No pending payment found.', status_code=status.HTTP_400_BAD_REQUEST)

        if not cp.stripe_payment_link_id:
            return success_response(message='No payment link associated with this plan.', status_code=status.HTTP_400_BAD_REQUEST)

        s = _stripe()
        try:
            sessions = s.checkout.Session.list(
                payment_link=cp.stripe_payment_link_id,
                limit=5,
                expand=['data.subscription'],
            )
        except stripe.StripeError as e:
            logger.error('Stripe session list failed: %s', e)
            return success_response(message='Stripe error — try again.', status_code=status.HTTP_502_BAD_GATEWAY)

        paid_session = next(
            (sess for sess in sessions.data if sess.payment_status == 'paid'),
            None
        )
        if not paid_session:
            return success_response(message='No completed payment found yet. Please wait a moment and try again.')

        now = timezone.now()
        cp.is_active = True
        cp.payment_status = 'paid'
        cp.save(update_fields=['is_active', 'payment_status', 'updated_at'])

        stripe_sub = paid_session.subscription
        customer_id = getattr(paid_session, 'customer', '') or ''
        subscription_id = stripe_sub.id if stripe_sub else ''

        def _ts(val):
            if not val:
                return None
            try:
                return timezone.make_aware(datetime.utcfromtimestamp(int(val)), dt_timezone.utc)
            except Exception:
                return None

        # Cancel any pre-existing Stripe subscription (e.g. Professional plan)
        try:
            old_sub = UserSubscription.objects.get(user=request.user)
            old_sid = old_sub.stripe_subscription_id or ''
            if old_sid and old_sid != subscription_id:
                s = _stripe()
                try:
                    s.Subscription.modify(old_sid, cancel_at_period_end=True)
                    old_sub.cancel_at_period_end = True
                    old_sub.save(update_fields=['cancel_at_period_end'])
                except stripe.StripeError as e:
                    logger.warning('Could not cancel old subscription %s during enterprise upgrade: %s', old_sid, e)
        except UserSubscription.DoesNotExist:
            pass

        try:
            enterprise_plan = SubscriptionPlan.objects.get(plan_type='employer', is_enterprise=True)
            UserSubscription.objects.update_or_create(
                user=request.user,
                defaults={
                    'plan': enterprise_plan,
                    'stripe_customer_id': customer_id,
                    'stripe_subscription_id': subscription_id,
                    'status': 'active',
                    'cancel_at_period_end': False,
                    'current_period_start': now,
                    'current_period_end': _ts(getattr(stripe_sub, 'current_period_end', None)) or now + timedelta(days=30),
                },
            )
        except SubscriptionPlan.DoesNotExist:
            pass

        amount_total = getattr(paid_session, 'amount_total', None) or 0
        currency = getattr(paid_session, 'currency', 'cad') or 'cad'
        PaymentHistory.objects.get_or_create(
            stripe_payment_intent_id=getattr(paid_session, 'payment_intent', '') or '',
            defaults={
                'user': request.user,
                'amount': amount_total / 100,
                'currency': currency,
                'status': 'succeeded',
                'description': f'Enterprise Custom Plan — {cp.enterprise_request.organization_name}',
            },
        )

        send_payment_confirmation_email_task.delay(
            request.user.pk,
            'Enterprise Custom Plan',
            f"${amount_total / 100:.2f}",
            '',
        )

        logger.info('Custom plan activated via poll-sync for user %s', request.user.email)
        return success_response(message='Enterprise plan activated.')


class CancelCustomPlanView(APIView):
    """Employer cancels a custom plan — handles both pending-payment and paid states."""
    permission_classes = [IsEmployer]

    def post(self, request):
        try:
            cp = request.user.custom_plan
        except CustomSubscriptionPlan.DoesNotExist:
            return success_response(
                message='No custom plan found.',
                status_code=status.HTTP_404_NOT_FOUND,
            )

        from django.utils import timezone as tz

        # ── Pending payment: employer decides not to pay ──────────────────────
        if cp.payment_status == 'pending_payment':
            cp.payment_status = 'revoked'
            cp.is_active = False
            cp.save(update_fields=['payment_status', 'is_active', 'updated_at'])
            try:
                er = cp.enterprise_request
                er.status = 'revoked'
                er.revoked_by = request.user
                er.revoked_at = tz.now()
                er.save(update_fields=['status', 'revoked_by', 'revoked_at', 'updated_at'])
            except Exception:
                pass
            # Deactivate the Stripe payment link so it can no longer be paid
            if cp.stripe_payment_link_id:
                try:
                    s = _stripe()
                    s.PaymentLink.modify(cp.stripe_payment_link_id, active=False)
                except stripe.StripeError as e:
                    logger.warning('Could not deactivate payment link during user cancel: %s', e)
            return success_response(message='Custom plan order cancelled successfully.')

        # ── Active paid plan: cancel at period end via Stripe ─────────────────
        if cp.payment_status == 'paid' and cp.is_active:
            try:
                user_sub = UserSubscription.objects.get(user=request.user)
            except UserSubscription.DoesNotExist:
                return success_response(
                    message='No subscription record found.',
                    status_code=status.HTTP_404_NOT_FOUND,
                )
            if not user_sub.stripe_subscription_id:
                return success_response(
                    message='No Stripe subscription linked to this plan.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            s = _stripe()
            try:
                s.Subscription.modify(user_sub.stripe_subscription_id, cancel_at_period_end=True)
            except stripe.StripeError as e:
                logger.error('Stripe cancel error for custom plan: %s', e)
                return success_response(
                    message='Payment provider error — please try again.',
                    status_code=status.HTTP_502_BAD_GATEWAY,
                )
            user_sub.cancel_at_period_end = True
            user_sub.save(update_fields=['cancel_at_period_end'])
            return success_response(
                message=(
                    'Your enterprise plan will be cancelled at the end of the current billing period. '
                    'You will be downgraded to the free plan after that.'
                )
            )

        return success_response(
            message='No active or pending plan to cancel.',
            status_code=status.HTTP_400_BAD_REQUEST,
        )


class EnterpriseRequestCreateView(APIView):
    permission_classes = [IsEmployer]

    def post(self, request):
        from admin_panel.models import AdminNotification

        try:
            employer_profile = request.user.employer_profile
        except AttributeError:
            return success_response(
                message='Employer profile not found.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        serializer = EnterpriseRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return success_response(
                message='Invalid data.',
                data=serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        enterprise_request = serializer.save(
            user=request.user,
            employer_profile=employer_profile,
        )

        AdminNotification.objects.create(
            notification_type='enterprise',
            title=f'New Enterprise Request: {enterprise_request.organization_name}',
            message=(
                f'{enterprise_request.contact_name} ({enterprise_request.contact_email}) '
                f'from {enterprise_request.organization_name} has submitted an enterprise plan request. '
                f'Hiring volume: {enterprise_request.monthly_hiring_volume or "Not specified"}.'
            ),
            related_id=enterprise_request.id,
        )

        # Email all admin users about the new request
        from emails.tasks import send_enterprise_request_admin_email_task
        from django.contrib.auth import get_user_model
        User = get_user_model()
        admin_emails = list(User.objects.filter(is_staff=True).values_list('email', flat=True))
        for admin_email in admin_emails:
            if admin_email:
                send_enterprise_request_admin_email_task.delay(
                    admin_email,
                    request.user.pk,
                    enterprise_request.pk,
                )

        return success_response(
            data=EnterpriseRequestSerializer(enterprise_request).data,
            message='Enterprise request submitted successfully. Our team will be in touch soon.',
            status_code=status.HTTP_201_CREATED,
        )


class MyEnterpriseRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        enterprise_request = EnterpriseRequest.objects.filter(user=request.user).first()
        if not enterprise_request:
            return success_response(data=None)
        return success_response(data=EnterpriseRequestSerializer(enterprise_request).data)


class MyEnterpriseRequestsHistoryView(APIView):
    """Returns all enterprise requests for the authenticated employer, newest first."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        requests = EnterpriseRequest.objects.filter(
            user=request.user
        ).order_by('-created_at')
        return success_response(data=EnterpriseRequestSerializer(requests, many=True).data)


class AdminEnterpriseRequestListView(APIView):
    permission_classes = [IsAdminUser]
    PAGE_SIZE = 20

    def get(self, request):
        status_filter = request.query_params.get('status', '').strip()
        qs = EnterpriseRequest.objects.select_related('user', 'employer_profile', 'approved_by').all()
        if status_filter:
            qs = qs.filter(status=status_filter)
        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except (ValueError, TypeError):
            page = 1
        start = (page - 1) * self.PAGE_SIZE
        total = qs.count()
        qs = qs[start:start + self.PAGE_SIZE]
        return success_response(data={
            'results': EnterpriseRequestAdminSerializer(qs, many=True).data,
            'count': total,
            'page': page,
            'page_size': self.PAGE_SIZE,
            'total_pages': max(1, -(-total // self.PAGE_SIZE)),
        })


class AdminEnterpriseRequestDetailView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            enterprise_request = EnterpriseRequest.objects.select_related(
                'user', 'employer_profile', 'approved_by'
            ).get(pk=pk)
        except EnterpriseRequest.DoesNotExist:
            return success_response(message='Enterprise request not found.', status_code=status.HTTP_404_NOT_FOUND)
        return success_response(data=EnterpriseRequestAdminSerializer(enterprise_request).data)


class AdminEnterpriseRequestApproveView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        try:
            enterprise_request = EnterpriseRequest.objects.select_related('user', 'employer_profile').get(pk=pk)
        except EnterpriseRequest.DoesNotExist:
            return success_response(message='Enterprise request not found.', status_code=status.HTTP_404_NOT_FOUND)

        # Block only when the employer has already paid — re-approving a paid plan
        # would create a duplicate Stripe price/link and is not safe.
        try:
            if enterprise_request.custom_plan.payment_status == 'paid':
                return success_response(
                    message='This plan has already been paid and is active. Revoke it first if you need to change it.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
        except CustomSubscriptionPlan.DoesNotExist:
            pass

        custom_job_limit = request.data.get('custom_job_limit', enterprise_request.custom_job_limit)
        custom_price_monthly = request.data.get('custom_price_monthly', enterprise_request.custom_price_monthly)
        custom_features = request.data.get('custom_features', enterprise_request.custom_features or [])
        admin_notes = request.data.get('admin_notes', enterprise_request.admin_notes)
        valid_until = request.data.get('valid_until')

        price_amount = float(custom_price_monthly or 0)
        is_free = price_amount == 0

        # ── Build Stripe payment link BEFORE writing approved status to DB ──────
        # If Stripe fails we return an error without touching the DB, so the
        # admin can retry. Previously the record was saved first and a Stripe
        # failure left the request permanently approved with no payment link.
        payment_link_id = ''
        payment_link_url = ''
        stripe_price_id = ''

        if not is_free:
            s = _stripe()
            try:
                stripe_price = s.Price.create(
                    unit_amount=int(price_amount * 100),
                    currency='cad',
                    recurring={'interval': 'month'},
                    product_data={
                        'name': f"CandianMdJobs Enterprise — {enterprise_request.organization_name}",
                    },
                    metadata={
                        'enterprise_request_id': str(enterprise_request.id),
                        'user_id': str(enterprise_request.user.id),
                    },
                )
                stripe_price_id = stripe_price.id

                pl = s.PaymentLink.create(
                    line_items=[{'price': stripe_price.id, 'quantity': 1}],
                    metadata={
                        'enterprise_request_id': str(enterprise_request.id),
                        'user_id': str(enterprise_request.user.id),
                        'custom_plan': 'true',
                    },
                    after_completion={
                        'type': 'redirect',
                        'redirect': {'url': f"{settings.FRONTEND_URL}/dashboard/employer?enterprise=paid&session_id={{CHECKOUT_SESSION_ID}}"},
                    },
                )
                payment_link_id = pl.id
                payment_link_url = pl.url
            except stripe.StripeError as e:
                logger.error('Stripe payment link creation failed: %s', e)
                return success_response(
                    message='Payment link creation failed. No changes were saved — please retry.',
                    status_code=status.HTTP_502_BAD_GATEWAY,
                )

        # Stripe succeeded (or plan is free) — now safe to persist the approval
        enterprise_request.custom_job_limit = custom_job_limit
        enterprise_request.custom_price_monthly = custom_price_monthly
        enterprise_request.custom_features = custom_features
        enterprise_request.admin_notes = admin_notes
        enterprise_request.status = 'approved'
        enterprise_request.approved_by = request.user
        enterprise_request.approved_at = timezone.now()
        enterprise_request.save()

        # Create or update CustomSubscriptionPlan, keyed by user so that a
        # re-approval (after cancellation or a new request from the same user)
        # updates the existing row instead of hitting the user unique-constraint.
        CustomSubscriptionPlan.objects.update_or_create(
            user=enterprise_request.user,
            defaults={
                'enterprise_request': enterprise_request,
                'job_post_limit': custom_job_limit,
                'price_monthly': price_amount,
                'features': custom_features,
                'is_active': is_free,          # free plans activate immediately
                'valid_until': valid_until,
                'payment_status': 'free' if is_free else 'pending_payment',
                'stripe_payment_link_id': payment_link_id,
                'stripe_payment_link_url': payment_link_url,
                'stripe_price_id': stripe_price_id,
            },
        )

        # For free custom plans activate UserSubscription to enterprise tier immediately
        if is_free:
            try:
                enterprise_plan = SubscriptionPlan.objects.get(plan_type='employer', is_enterprise=True)
                UserSubscription.objects.update_or_create(
                    user=enterprise_request.user,
                    defaults={
                        'plan': enterprise_plan,
                        'status': 'active',
                        'current_period_start': timezone.now(),
                    },
                )
            except SubscriptionPlan.DoesNotExist:
                pass

        # ── Notify employer via email and in-app notification ─────────────────
        employer_user = enterprise_request.user
        if not is_free and payment_link_url:
            # Email employer with payment link
            from emails.tasks import send_custom_plan_payment_link_email_task
            send_custom_plan_payment_link_email_task.delay(
                employer_user.pk,
                payment_link_url,
                str(price_amount),
                custom_job_limit,
                custom_features,
            )

            # In-app notification for employer
            from notifications.models import Notification
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            notif = Notification.objects.create(
                user=employer_user,
                notification_type='employer_custom_plan_payment',
                title='Your Custom Plan Payment Link is Ready',
                message=(
                    f'Your enterprise plan has been approved! '
                    f'Complete your payment of ${price_amount:.2f}/month to activate your custom plan '
                    f'with {custom_job_limit} job postings.'
                ),
                link='/dashboard/employer?tab=billing',
            )
            try:
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f'notifications_{employer_user.pk}',
                    {
                        'type': 'notify',
                        'id': notif.pk,
                        'notification_type': notif.notification_type,
                        'title': notif.title,
                        'message': notif.message,
                        'link': notif.link,
                    },
                )
            except Exception:
                pass
        elif is_free:
            # Notify employer that plan is immediately active
            from notifications.models import Notification
            Notification.objects.create(
                user=employer_user,
                notification_type='employer_custom_plan_active',
                title='Your Custom Plan is Now Active!',
                message=f'Your enterprise custom plan with {custom_job_limit} job postings is now active.',
                link='/dashboard/employer?tab=billing',
            )

        return success_response(
            data=EnterpriseRequestAdminSerializer(enterprise_request).data,
            message='Enterprise request approved. Payment link sent to employer.' if not is_free else 'Enterprise request approved and plan activated.',
        )


class AdminEnterpriseRequestRevokeView(APIView):
    """
    Revoke an already-approved enterprise plan.

    Two cases:
      1. Customer has NOT yet paid (payment_status=pending_payment):
         → Deactivate the Stripe payment link so it can no longer be used.
         → No refund needed.

      2. Customer HAS paid (payment_status=paid):
         → Issue a full Stripe refund on the original payment intent.
         → Downgrade UserSubscription back to the free plan.
         → Mark PaymentHistory row as 'refunded'.
    """
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        try:
            enterprise_request = EnterpriseRequest.objects.select_related(
                'user', 'employer_profile'
            ).get(pk=pk)
        except EnterpriseRequest.DoesNotExist:
            return success_response(
                message='Enterprise request not found.',
                status_code=status.HTTP_404_NOT_FOUND,
            )

        if enterprise_request.status != 'approved':
            return success_response(
                message='Only approved requests can be revoked.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        try:
            custom_plan = enterprise_request.custom_plan
        except CustomSubscriptionPlan.DoesNotExist:
            custom_plan = None

        already_paid = custom_plan and custom_plan.payment_status == 'paid'
        s = _stripe()

        if already_paid:
            # Find the most recent succeeded payment for this enterprise request
            payment = PaymentHistory.objects.filter(
                user=enterprise_request.user,
                status='succeeded',
                description__icontains=enterprise_request.organization_name,
            ).order_by('-created_at').first()

            if payment and payment.stripe_payment_intent_id:
                try:
                    s.Refund.create(payment_intent=payment.stripe_payment_intent_id)
                except stripe.StripeError as e:
                    logger.error(
                        'Stripe refund failed for enterprise_request=%s: %s', pk, e
                    )
                    return success_response(
                        message='Refund failed. Please issue the refund manually in Stripe, then retry.',
                        status_code=status.HTTP_502_BAD_GATEWAY,
                    )
                payment.status = 'refunded'
                payment.save(update_fields=['status'])

            # Cancel the recurring Stripe subscription so the user is not charged again
            try:
                user_sub = UserSubscription.objects.get(user=enterprise_request.user)
                if user_sub.stripe_subscription_id:
                    try:
                        s.Subscription.cancel(user_sub.stripe_subscription_id)
                    except stripe.StripeError as e:
                        logger.warning(
                            'Could not cancel Stripe subscription during admin revoke for request=%s: %s', pk, e
                        )
            except UserSubscription.DoesNotExist:
                pass

            # Downgrade UserSubscription to free plan
            try:
                free_plan = SubscriptionPlan.objects.get(is_free=True, plan_type='employer')
                UserSubscription.objects.filter(user=enterprise_request.user).update(
                    plan=free_plan,
                    status='active',
                    stripe_subscription_id='',
                    cancel_at_period_end=False,
                )
            except SubscriptionPlan.DoesNotExist:
                logger.warning('Free employer plan not found — cannot downgrade user after revoke.')

        elif custom_plan and custom_plan.stripe_payment_link_id:
            # Deactivate the payment link so the customer cannot use it
            try:
                s.PaymentLink.modify(custom_plan.stripe_payment_link_id, active=False)
            except stripe.StripeError as e:
                logger.error(
                    'Stripe payment link deactivation failed for enterprise_request=%s: %s', pk, e
                )
                return success_response(
                    message='Failed to deactivate payment link. Please try again.',
                    status_code=status.HTTP_502_BAD_GATEWAY,
                )

        # Stripe action confirmed — now update DB
        enterprise_request.status = 'revoked'
        enterprise_request.revoked_by = request.user
        enterprise_request.revoked_at = timezone.now()
        enterprise_request.revoked_reason = (request.data.get('revoked_reason') or '').strip()
        enterprise_request.save(update_fields=['status', 'revoked_by', 'revoked_at', 'revoked_reason', 'updated_at'])

        if custom_plan:
            custom_plan.is_active = False
            custom_plan.payment_status = 'revoked'
            custom_plan.stripe_payment_link_url = ''
            custom_plan.save(update_fields=['is_active', 'payment_status', 'stripe_payment_link_url', 'updated_at'])

        msg = (
            'Approval revoked and full refund issued to customer.'
            if already_paid
            else 'Approval revoked. Payment link has been deactivated.'
        )
        return success_response(
            data=EnterpriseRequestAdminSerializer(enterprise_request).data,
            message=msg,
        )


class AdminEnterpriseRequestRejectView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        try:
            enterprise_request = EnterpriseRequest.objects.get(pk=pk)
        except EnterpriseRequest.DoesNotExist:
            return success_response(message='Enterprise request not found.', status_code=status.HTTP_404_NOT_FOUND)

        rejected_reason = request.data.get('rejected_reason', '')
        admin_notes = request.data.get('admin_notes', enterprise_request.admin_notes)

        enterprise_request.status = 'rejected'
        enterprise_request.rejected_reason = rejected_reason
        enterprise_request.admin_notes = admin_notes
        enterprise_request.save(update_fields=['status', 'rejected_reason', 'admin_notes', 'updated_at'])

        return success_response(
            data=EnterpriseRequestAdminSerializer(enterprise_request).data,
            message='Enterprise request rejected.',
        )


class AdminEnterpriseRequestReviewView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        try:
            enterprise_request = EnterpriseRequest.objects.get(pk=pk)
        except EnterpriseRequest.DoesNotExist:
            return success_response(message='Enterprise request not found.', status_code=status.HTTP_404_NOT_FOUND)

        admin_notes = request.data.get('admin_notes', enterprise_request.admin_notes)
        enterprise_request.status = 'reviewing'
        enterprise_request.admin_notes = admin_notes
        enterprise_request.save(update_fields=['status', 'admin_notes', 'updated_at'])

        return success_response(
            data=EnterpriseRequestAdminSerializer(enterprise_request).data,
            message='Enterprise request marked as reviewing.',
        )


class AdminCustomPlanListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        plans = CustomSubscriptionPlan.objects.select_related('user', 'enterprise_request').all()
        return success_response(data=CustomSubscriptionPlanSerializer(plans, many=True).data)


class AdminCustomPlanUpdateView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        try:
            plan = CustomSubscriptionPlan.objects.select_related('user').get(pk=pk)
        except CustomSubscriptionPlan.DoesNotExist:
            return success_response(message='Custom plan not found.', status_code=status.HTTP_404_NOT_FOUND)

        serializer = CustomSubscriptionPlanSerializer(plan, data=request.data, partial=True)
        if not serializer.is_valid():
            return success_response(
                message='Invalid data.',
                data=serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save()
        return success_response(data=serializer.data, message='Custom plan updated.')
