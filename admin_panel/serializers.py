from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from rest_framework import serializers

from accounts.models import EmployerProfile, PhysicianProfile
from assessments.models import CareerAssessment
from contact.models import ContactSubmission
from faq.models import FAQ
from jobs.models import Job
from stats.models import PlatformStats
from subscriptions.models import SubscriptionPlan
from testimonials.models import Testimonial
from .models import AdminNotification

User = get_user_model()


# ── Job ───────────────────────────────────────────────────────────────────────

class AdminJobListSerializer(serializers.ModelSerializer):
    employer_name = serializers.CharField(source='employer.company_name', read_only=True)
    specialty_display = serializers.CharField(source='get_specialty_display', read_only=True)
    province_display = serializers.CharField(source='get_province_display', read_only=True)
    job_type_display = serializers.CharField(source='get_job_type_display', read_only=True)
    status_label = serializers.SerializerMethodField()
    total_applications = serializers.IntegerField(read_only=True)

    class Meta:
        model = Job
        fields = [
            'id', 'title',
            'specialty', 'specialty_display', 'sub_specialty',
            'province', 'province_display', 'city',
            'employer_name', 'job_type', 'job_type_display',
            'practice_setting',
            'salary_min', 'salary_max', 'salary_display', 'compensation_model',
            'is_active', 'is_approved', 'status_label',
            'rejection_reason', 'created_at', 'approved_at', 'rejected_at',
            'total_applications',
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_status_label(self, obj):
        if getattr(obj, 'rejected_at', None):
            return 'Rejected'
        if obj.is_approved and obj.is_active:
            return 'Active'
        if obj.is_approved and not obj.is_active:
            return 'Inactive'
        return 'Pending'


class AdminJobDetailSerializer(serializers.ModelSerializer):
    employer_name = serializers.CharField(source='employer.company_name', read_only=True)
    employer_type = serializers.CharField(source='employer.company_type', read_only=True)
    employer_website = serializers.URLField(source='employer.website', read_only=True)
    specialty_display = serializers.CharField(source='get_specialty_display', read_only=True)
    province_display = serializers.CharField(source='get_province_display', read_only=True)
    job_type_display = serializers.CharField(source='get_job_type_display', read_only=True)
    practice_setting_display = serializers.CharField(source='get_practice_setting_display', read_only=True)
    status_label = serializers.SerializerMethodField()
    total_applications = serializers.IntegerField(read_only=True)

    required_experience_display = serializers.CharField(source='get_required_experience_display', read_only=True)

    class Meta:
        model = Job
        fields = [
            'id', 'title',
            'specialty', 'specialty_display', 'sub_specialty',
            'province', 'province_display', 'city', 'location_display',
            'description', 'qualifications', 'responsibilities', 'requirements',
            'compensation', 'benefits',
            'application_deadline', 'contact_person', 'contact_email',
            'job_type', 'job_type_display',
            'practice_setting', 'practice_setting_display',
            'required_experience', 'required_experience_display',
            'remote_option', 'relocation_assistance',
            'salary_min', 'salary_max', 'salary_display', 'compensation_model',
            'employer_name', 'employer_type', 'employer_website',
            'is_active', 'is_approved', 'status_label',
            'approved_at', 'rejection_reason', 'rejected_at',
            'views_count', 'created_at', 'updated_at',
            'total_applications',
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_status_label(self, obj):
        if getattr(obj, 'rejected_at', None):
            return 'Rejected'
        if obj.is_approved and obj.is_active:
            return 'Active'
        if obj.is_approved and not obj.is_active:
            return 'Inactive'
        return 'Pending'


# ── User ──────────────────────────────────────────────────────────────────────

class AdminUserListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    specialty = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'first_name', 'last_name',
            'user_type', 'is_active', 'is_staff', 'phone', 'date_joined',
            'specialty', 'company_name',
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_specialty(self, obj):
        if obj.user_type == 'physician':
            try:
                return obj.physician_profile.specialty
            except Exception:
                return None
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_company_name(self, obj):
        if obj.user_type == 'employer':
            try:
                return obj.employer_profile.company_name
            except Exception:
                return None
        return None


class _PhysicianProfileInlineSerializer(serializers.ModelSerializer):
    class Meta:
        model = PhysicianProfile
        fields = ['specialty', 'sub_specialty', 'cpso_number', 'country', 'work_eligibility', 'profile_complete']


class _EmployerProfileInlineSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployerProfile
        fields = ['company_name', 'company_type', 'company_phone', 'country', 'website']


class AdminUserDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    profile = serializers.SerializerMethodField()
    total_applications = serializers.SerializerMethodField()
    total_saved_jobs = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'first_name', 'last_name',
            'user_type', 'is_active', 'is_staff', 'phone', 'date_joined',
            'profile', 'total_applications', 'total_saved_jobs',
        ]

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_profile(self, obj):
        if obj.user_type == 'physician':
            try:
                return _PhysicianProfileInlineSerializer(obj.physician_profile).data
            except PhysicianProfile.DoesNotExist:
                return {}
        if obj.user_type == 'employer':
            try:
                return _EmployerProfileInlineSerializer(obj.employer_profile).data
            except EmployerProfile.DoesNotExist:
                return {}
        return {}

    @extend_schema_field(OpenApiTypes.INT)
    def get_total_applications(self, obj):
        if obj.user_type == 'physician':
            try:
                return obj.physician_profile.applications.count()
            except PhysicianProfile.DoesNotExist:
                return 0
        return None

    @extend_schema_field(OpenApiTypes.INT)
    def get_total_saved_jobs(self, obj):
        if obj.user_type == 'physician':
            try:
                return obj.physician_profile.saved_jobs.count()
            except PhysicianProfile.DoesNotExist:
                return 0
        return None


# ── Assessment ────────────────────────────────────────────────────────────────

class AdminAssessmentListSerializer(serializers.ModelSerializer):
    licensure_display = serializers.CharField(source='get_licensure_status_display', read_only=True)
    eligibility_display = serializers.CharField(source='get_work_eligibility_display', read_only=True)

    class Meta:
        model = CareerAssessment
        fields = [
            'id', 'full_name', 'email', 'phone', 'specialty', 'sub_specialty',
            'current_location', 'desired_province_in_canada',
            'years_of_experience', 'licensure_status', 'licensure_display',
            'work_eligibility', 'eligibility_display',
            'relocation_support_needed', 'is_reviewed', 'submitted_at',
        ]


class AdminAssessmentDetailSerializer(serializers.ModelSerializer):
    licensure_display = serializers.CharField(source='get_licensure_status_display', read_only=True)
    eligibility_display = serializers.CharField(source='get_work_eligibility_display', read_only=True)

    class Meta:
        model = CareerAssessment
        fields = '__all__'


# ── Contact ───────────────────────────────────────────────────────────────────

class AdminContactListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactSubmission
        fields = ['id', 'full_name', 'email', 'phone', 'subject', 'submitted_at', 'is_responded']


class AdminContactDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactSubmission
        fields = '__all__'


# ── Testimonial ───────────────────────────────────────────────────────────────

class AdminTestimonialSerializer(serializers.ModelSerializer):
    class Meta:
        model = Testimonial
        fields = [
            'id', 'physician_name', 'specialty', 'location',
            'testimonial_text', 'photo',
            'testimonial_type', 'rating', 'organization',
            'is_active', 'order', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


# ── FAQ ───────────────────────────────────────────────────────────────────────

class AdminFAQSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQ
        fields = ['id', 'question', 'answer', 'category', 'order', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


# ── Subscription plans ────────────────────────────────────────────────────────

class AdminSubscriptionPlanSerializer(serializers.ModelSerializer):
    """Editable view of a pricing tier.

    The Stripe IDs are exposed read-only: they are set by the sync service, and
    letting an admin type one in by hand is a direct route to billing the wrong
    amount. `subscriber_count` is here so the UI can warn before a price change
    that affects real customers.
    """

    subscriber_count = serializers.SerializerMethodField()
    stripe_in_sync = serializers.SerializerMethodField()
    # Shown next to the discount field so the admin sees the resulting figures
    # before saving, rather than working out the percentage in their head.
    annual_monthly_equivalent = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True,
    )
    price_annual_total = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True,
    )

    class Meta:
        model = SubscriptionPlan
        fields = [
            'id', 'name', 'plan_type', 'price_monthly',
            'is_free', 'is_enterprise', 'is_popular',
            'job_post_limit', 'features', 'order',
            'stripe_price_id', 'stripe_product_id', 'stripe_price_id_annual',
            'subscriber_count', 'stripe_in_sync',
            'annual_discount_percent', 'annual_monthly_equivalent',
            'price_annual_total',
        ]
        read_only_fields = [
            'id', 'stripe_price_id', 'stripe_product_id', 'stripe_price_id_annual',
        ]

    @extend_schema_field(OpenApiTypes.INT)
    def get_subscriber_count(self, obj):
        return obj.subscriptions.filter(status='active').count()

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_stripe_in_sync(self, obj):
        """False when checkout would charge something other than the advertised
        price. Free and enterprise tiers never use Stripe checkout, so they are
        reported as in sync rather than as a problem to fix."""
        if obj.is_free or obj.is_enterprise:
            return True
        return bool(obj.stripe_price_id)

    def validate_features(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Features must be a list of strings.')
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        if len(cleaned) != len(value):
            raise serializers.ValidationError('Features cannot contain blank entries.')
        return cleaned

    def validate_price_monthly(self, value):
        if value < 0:
            raise serializers.ValidationError('Price cannot be negative.')
        return value

    def validate_job_post_limit(self, value):
        # Null is meaningful here — it is how "unlimited" is stored.
        if value is not None and value < 0:
            raise serializers.ValidationError('Job post limit cannot be negative.')
        return value

    def validate_annual_discount_percent(self, value):
        # Capped below 100 because a full discount would mean a zero-amount
        # yearly price, which Stripe rejects for a recurring subscription.
        if value < 0 or value > 90:
            raise serializers.ValidationError(
                'Annual discount must be between 0 and 90 percent.'
            )
        return value

    def validate(self, attrs):
        # Merge against the instance so PATCH requests are validated on the
        # resulting state, not just the fields that happen to be present.
        def resolved(field):
            if field in attrs:
                return attrs[field]
            return getattr(self.instance, field, None)

        is_free = resolved('is_free')
        is_enterprise = resolved('is_enterprise')
        price = resolved('price_monthly')

        if is_free and is_enterprise:
            raise serializers.ValidationError(
                'A plan cannot be both free and enterprise.'
            )
        if is_free and price and price > 0:
            raise serializers.ValidationError(
                'A free plan must have a price of 0.'
            )
        if not is_free and not is_enterprise and (price is None or price <= 0):
            raise serializers.ValidationError(
                'A paid plan needs a price above 0, or mark it free/enterprise.'
            )

        discount = resolved('annual_discount_percent') or 0
        if discount and (is_free or is_enterprise):
            raise serializers.ValidationError(
                'Only a paid plan can carry an annual discount.'
            )
        return attrs


# ── Stats ─────────────────────────────────────────────────────────────────────

class AdminStatsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformStats
        fields = '__all__'
        read_only_fields = ['id', 'last_updated']


# ── Notification ──────────────────────────────────────────────────────────────

class AdminNotificationSerializer(serializers.ModelSerializer):
    notification_type_display = serializers.CharField(
        source='get_notification_type_display', read_only=True
    )

    class Meta:
        model = AdminNotification
        fields = [
            'id', 'notification_type', 'notification_type_display',
            'title', 'message', 'is_read', 'related_id', 'created_at',
        ]


# ── Admin profile ─────────────────────────────────────────────────────────────

class AdminProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name', 'phone', 'date_joined']
        read_only_fields = ['id', 'date_joined']

    def validate_email(self, value):
        normalized = User.objects.normalize_email(value)
        qs = User.objects.filter(email__iexact=normalized)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return normalized
