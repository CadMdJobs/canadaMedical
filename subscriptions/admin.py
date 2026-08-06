from django.contrib import admin, messages
from services.plan_pricing_service import StripeSyncError, sync_plan_to_stripe
from .models import SubscriptionPlan, UserSubscription, PaymentHistory, EnterpriseRequest, CustomSubscriptionPlan


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'plan_type', 'price_monthly', 'stripe_status',
        'is_free', 'is_enterprise', 'is_popular', 'job_post_limit', 'order',
    ]
    list_editable = ['order', 'is_popular', 'is_enterprise']
    readonly_fields = ['stripe_price_id', 'stripe_price_id_annual', 'stripe_product_id']
    ordering = ['order']
    actions = ['sync_to_stripe']

    @admin.display(description='Stripe')
    def stripe_status(self, obj):
        """Editing price_monthly changes the advertised figure only — checkout
        bills whatever stripe_price_id points at, so surface the difference."""
        if obj.is_free or obj.is_enterprise:
            return 'n/a'
        return 'linked' if obj.stripe_price_id else 'NOT LINKED'

    @admin.action(description='Sync selected plans to Stripe')
    def sync_to_stripe(self, request, queryset):
        for plan in queryset:
            try:
                result = sync_plan_to_stripe(plan)
            except StripeSyncError as exc:
                self.message_user(request, f'{plan.name}: {exc}', level=messages.ERROR)
            else:
                self.message_user(request, f'{plan.name}: {result}')


@admin.register(UserSubscription)
class UserSubscriptionAdmin(admin.ModelAdmin):
    list_display = ['user', 'plan', 'status', 'current_period_end', 'cancel_at_period_end']
    list_filter = ['status', 'plan']
    search_fields = ['user__email']
    raw_id_fields = ['user', 'plan']


@admin.register(PaymentHistory)
class PaymentHistoryAdmin(admin.ModelAdmin):
    list_display = ['user', 'amount', 'currency', 'status', 'description', 'created_at']
    list_filter = ['status', 'currency']
    search_fields = ['user__email']
    raw_id_fields = ['user']


@admin.register(EnterpriseRequest)
class EnterpriseRequestAdmin(admin.ModelAdmin):
    list_display = ['organization_name', 'contact_name', 'contact_email', 'status', 'monthly_hiring_volume', 'created_at']
    list_filter = ['status', 'monthly_hiring_volume']
    search_fields = ['organization_name', 'contact_name', 'contact_email', 'user__email']
    raw_id_fields = ['user', 'employer_profile', 'approved_by']
    readonly_fields = ['created_at', 'updated_at', 'approved_at']


@admin.register(CustomSubscriptionPlan)
class CustomSubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ['user', 'job_post_limit', 'price_monthly', 'is_active', 'valid_until', 'created_at']
    list_filter = ['is_active']
    search_fields = ['user__email']
    raw_id_fields = ['user', 'enterprise_request']
    readonly_fields = ['created_at', 'updated_at']
