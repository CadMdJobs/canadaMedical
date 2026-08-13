import django_filters
from django.contrib.auth import get_user_model
from django.db.models import Q

from assessments.models import CareerAssessment
from contact.models import ContactSubmission
from jobs.models import Job

User = get_user_model()


class AdminJobFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(method='filter_status')
    specialty = django_filters.CharFilter(field_name='specialty', lookup_expr='iexact')
    province = django_filters.CharFilter(field_name='province', lookup_expr='iexact')
    job_type = django_filters.CharFilter(field_name='job_type', lookup_expr='iexact')
    search = django_filters.CharFilter(method='filter_search')
    date_from = django_filters.DateFilter(field_name='created_at', lookup_expr='date__gte')
    date_to = django_filters.DateFilter(field_name='created_at', lookup_expr='date__lte')

    class Meta:
        model = Job
        fields = []

    def filter_status(self, queryset, name, value):
        if value == 'pending':
            return queryset.filter(is_approved=False, rejected_at__isnull=True)
        if value == 'approved':
            return queryset.filter(is_approved=True)
        if value == 'rejected':
            return queryset.filter(rejected_at__isnull=False)
        return queryset

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(title__icontains=value) | Q(employer__company_name__icontains=value)
        )


class AdminUserFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(method='filter_search')
    date_from = django_filters.DateFilter(field_name='date_joined', lookup_expr='date__gte')
    date_to = django_filters.DateFilter(field_name='date_joined', lookup_expr='date__lte')
    specialty = django_filters.CharFilter(
        field_name='physician_profile__specialty', lookup_expr='iexact'
    )

    class Meta:
        model = User
        fields = ['user_type', 'is_active']

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(first_name__icontains=value)
            | Q(last_name__icontains=value)
            | Q(email__icontains=value)
        )


class AdminAssessmentFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(method='filter_search')
    date_from = django_filters.DateFilter(field_name='submitted_at', lookup_expr='date__gte')

    class Meta:
        model = CareerAssessment
        fields = ['is_reviewed', 'specialty', 'licensure_status']

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(full_name__icontains=value) | Q(email__icontains=value)
        )


class AdminContactFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(method='filter_search')
    date_from = django_filters.DateFilter(field_name='submitted_at', lookup_expr='date__gte')

    class Meta:
        model = ContactSubmission
        fields = ['status', 'is_responded']

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(full_name__icontains=value) | Q(email__icontains=value)
        )
