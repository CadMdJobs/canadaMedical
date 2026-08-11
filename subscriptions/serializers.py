from django.conf import settings
from django.utils import timezone
from rest_framework import serializers
from .models import SubscriptionPlan, UserSubscription, PaymentHistory, EnterpriseRequest, CustomSubscriptionPlan


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    # The annual figures are computed server-side so the price the page shows
    # is the same number Stripe was told to charge. Deriving them in the
    # browser is how the advertised discount drifted from the billed amount.
    offers_annual = serializers.BooleanField(read_only=True)
    # "$399" is ambiguous between CAD and USD, and this site quotes a currency
    # that is not the reader's default. Sending the code lets the page label
    # the figure instead of leaving the visitor to assume.
    currency = serializers.SerializerMethodField()
    annual_monthly_equivalent = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True,
    )
    price_annual_total = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True,
    )

    class Meta:
        model = SubscriptionPlan
        fields = [
            'id', 'name', 'price_monthly', 'is_free', 'is_enterprise',
            'is_popular', 'job_post_limit', 'features', 'stripe_price_id',
            'annual_discount_percent', 'offers_annual',
            'annual_monthly_equivalent', 'price_annual_total',
            'currency',
        ]

    def get_currency(self, obj) -> str:
        return settings.STRIPE_CURRENCY.upper()


class UserSubscriptionSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source='plan.name', read_only=True)
    price_monthly = serializers.DecimalField(
        source='plan.price_monthly', max_digits=10, decimal_places=2, read_only=True,
    )
    job_post_limit = serializers.IntegerField(source='plan.job_post_limit', read_only=True, allow_null=True)
    days_remaining = serializers.SerializerMethodField()
    jobs_posted = serializers.SerializerMethodField()
    jobs_remaining = serializers.SerializerMethodField()

    class Meta:
        model = UserSubscription
        fields = [
            'plan_name', 'status', 'price_monthly',
            'current_period_end', 'days_remaining',
            'job_post_limit', 'jobs_posted', 'jobs_remaining',
            'cancel_at_period_end',
        ]

    def get_days_remaining(self, obj):
        if obj.current_period_end:
            delta = obj.current_period_end - timezone.now()
            return max(0, delta.days)
        return None

    def get_jobs_posted(self, obj):
        try:
            from jobs.models import Job
            return Job.objects.filter(employer=obj.user.employer_profile, is_active=True).count()
        except Exception:
            return 0

    def get_jobs_remaining(self, obj):
        limit = obj.plan.job_post_limit
        if limit is None:
            return None
        posted = self.get_jobs_posted(obj)
        return max(0, limit - posted)


class PaymentHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentHistory
        fields = ['id', 'amount', 'currency', 'status', 'description', 'created_at']


class EnterpriseRequestSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    company_name = serializers.CharField(source='employer_profile.company_name', read_only=True)
    custom_payment_status = serializers.SerializerMethodField()
    custom_payment_link = serializers.SerializerMethodField()
    admin_notes = serializers.CharField(read_only=True)

    class Meta:
        model = EnterpriseRequest
        fields = [
            'id', 'user_email', 'company_name',
            'organization_name', 'contact_name', 'contact_email', 'contact_phone',
            'monthly_hiring_volume', 'num_job_posts', 'featured_jobs',
            'hiring_duration', 'additional_services', 'budget_range', 'message', 'status',
            'custom_job_limit', 'custom_price_monthly', 'custom_features',
            'admin_notes', 'approved_at', 'rejected_reason',
            'custom_payment_status', 'custom_payment_link',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'user_email', 'company_name', 'status',
            'custom_job_limit', 'custom_price_monthly', 'custom_features',
            'admin_notes', 'approved_at', 'rejected_reason',
            'custom_payment_status', 'custom_payment_link',
            'created_at', 'updated_at',
        ]

    def get_custom_payment_status(self, obj):
        try:
            return obj.custom_plan.payment_status
        except Exception:
            return None

    def get_custom_payment_link(self, obj):
        try:
            return obj.custom_plan.stripe_payment_link_url or None
        except Exception:
            return None


class EnterpriseRequestAdminSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    company_name = serializers.CharField(source='employer_profile.company_name', read_only=True)
    approved_by_email = serializers.EmailField(source='approved_by.email', read_only=True, allow_null=True)
    revoked_by_email = serializers.EmailField(source='revoked_by.email', read_only=True, allow_null=True)
    monthly_hiring_volume_display = serializers.CharField(source='monthly_hiring_volume', read_only=True)
    custom_payment_status = serializers.SerializerMethodField()
    custom_payment_link = serializers.SerializerMethodField()
    existing_plan_info = serializers.SerializerMethodField()
    # The figure the admin types here becomes a real Stripe price, so the
    # approval form should name the currency it will be charged in rather than
    # leaving it to the dollar sign on the input.
    currency = serializers.SerializerMethodField()

    class Meta:
        model = EnterpriseRequest
        fields = [
            'id', 'user_email', 'company_name',
            'organization_name', 'contact_name', 'contact_email', 'contact_phone',
            'monthly_hiring_volume', 'monthly_hiring_volume_display',
            'num_job_posts', 'featured_jobs', 'hiring_duration',
            'additional_services', 'budget_range', 'message', 'status',
            'custom_job_limit', 'custom_price_monthly', 'custom_features',
            'admin_notes', 'approved_by_email', 'approved_at', 'rejected_reason',
            'revoked_by_email', 'revoked_at', 'revoked_reason',
            'custom_payment_status', 'custom_payment_link',
            'existing_plan_info', 'currency',
            'created_at', 'updated_at',
        ]

    def get_currency(self, obj) -> str:
        return settings.STRIPE_CURRENCY.upper()

    def get_custom_payment_status(self, obj):
        try:
            return obj.custom_plan.payment_status
        except Exception:
            return None

    def get_custom_payment_link(self, obj):
        try:
            return obj.custom_plan.stripe_payment_link_url or None
        except Exception:
            return None

    def get_existing_plan_info(self, obj):
        """Return the employer's currently active paid plan (if any) so the
        admin can see unused value and set a fair discounted price."""
        try:
            cp = obj.user.custom_plan
            if not cp.is_active or cp.payment_status != 'paid':
                return None
            days_remaining = None
            estimated_unused_value = None
            if cp.valid_until:
                delta = cp.valid_until.date() - timezone.now().date()
                days_remaining = max(0, delta.days)
                if cp.price_monthly and days_remaining > 0:
                    # Approximate: 1 month ≈ 30 days
                    estimated_unused_value = round(float(cp.price_monthly) * days_remaining / 30, 2)
            return {
                'job_post_limit': cp.job_post_limit,
                'price_monthly': str(cp.price_monthly),
                'valid_until': cp.valid_until.isoformat() if cp.valid_until else None,
                'days_remaining': days_remaining,
                'estimated_unused_value': estimated_unused_value,
                'payment_status': cp.payment_status,
                'enterprise_request_id': cp.enterprise_request_id,
            }
        except Exception:
            return None


class CustomSubscriptionPlanSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = CustomSubscriptionPlan
        fields = [
            'id', 'user_email', 'job_post_limit', 'price_monthly',
            'features', 'is_active', 'valid_until',
            'payment_status', 'stripe_payment_link_url',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'user_email', 'payment_status',
            'stripe_payment_link_url', 'created_at', 'updated_at',
        ]
