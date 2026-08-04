from django.urls import path

from .views import (
    AdminRevenueOverviewView,
    AdminUserBillingView,
    AdminAssessmentDetailView,
    AdminAssessmentListView,
    AdminAssessmentReviewView,
    AdminChangePasswordView,
    AdminContactDetailView,
    AdminContactListView,
    AdminContactRespondView,
    AdminDashboardView,
    AdminEmployersView,
    AdminExportAssessmentsView,
    AdminExportContactsView,
    AdminExportJobsView,
    AdminExportUsersView,
    AdminFAQDetailView,
    AdminFAQListCreateView,
    AdminFAQToggleView,
    AdminGlobalSearchView,
    AdminJobApproveView,
    AdminJobDetailView,
    AdminJobListView,
    AdminJobRejectView,
    AdminNotificationDeleteView,
    AdminNotificationListView,
    AdminNotificationReadAllView,
    AdminNotificationReadView,
    AdminPendingJobsView,
    AdminPhysiciansView,
    AdminPlanDetailView,
    AdminPlanListCreateView,
    AdminPlanStripeSyncView,
    AdminProfileView,
    AdminStatsRecalculateView,
    AdminStatsView,
    AdminTestimonialDetailView,
    AdminTestimonialListCreateView,
    AdminTestimonialToggleView,
    AdminUnreadCountView,
    AdminUserActivateView,
    AdminUserDeactivateView,
    AdminUserDetailView,
    AdminUserListView,
)

urlpatterns = [
    # Dashboard
    path('dashboard/', AdminDashboardView.as_view(), name='admin-dashboard'),

    # Jobs — static paths before <int:pk>
    path('jobs/', AdminJobListView.as_view(), name='admin-job-list'),
    path('jobs/pending/', AdminPendingJobsView.as_view(), name='admin-pending-jobs'),
    path('jobs/<int:pk>/', AdminJobDetailView.as_view(), name='admin-job-detail'),
    path('jobs/<int:pk>/approve/', AdminJobApproveView.as_view(), name='admin-job-approve'),
    path('jobs/<int:pk>/reject/', AdminJobRejectView.as_view(), name='admin-job-reject'),

    # Users — static paths before <int:pk>
    path('users/', AdminUserListView.as_view(), name='admin-user-list'),
    path('users/physicians/', AdminPhysiciansView.as_view(), name='admin-physicians'),
    path('users/employers/', AdminEmployersView.as_view(), name='admin-employers'),
    path('users/<int:pk>/', AdminUserDetailView.as_view(), name='admin-user-detail'),
    path('users/<int:pk>/activate/', AdminUserActivateView.as_view(), name='admin-user-activate'),
    path('users/<int:pk>/deactivate/', AdminUserDeactivateView.as_view(), name='admin-user-deactivate'),

    # Assessments
    path('assessments/', AdminAssessmentListView.as_view(), name='admin-assessment-list'),
    path('assessments/<int:pk>/', AdminAssessmentDetailView.as_view(), name='admin-assessment-detail'),
    path('assessments/<int:pk>/review/', AdminAssessmentReviewView.as_view(), name='admin-assessment-review'),

    # Contacts
    path('contacts/', AdminContactListView.as_view(), name='admin-contact-list'),
    path('contacts/<int:pk>/', AdminContactDetailView.as_view(), name='admin-contact-detail'),
    path('contacts/<int:pk>/respond/', AdminContactRespondView.as_view(), name='admin-contact-respond'),

    # Testimonials
    path('testimonials/', AdminTestimonialListCreateView.as_view(), name='admin-testimonial-list'),
    path('testimonials/<int:pk>/', AdminTestimonialDetailView.as_view(), name='admin-testimonial-detail'),
    path('testimonials/<int:pk>/toggle/', AdminTestimonialToggleView.as_view(), name='admin-testimonial-toggle'),

    # FAQs
    path('faqs/', AdminFAQListCreateView.as_view(), name='admin-faq-list'),
    path('faqs/<int:pk>/', AdminFAQDetailView.as_view(), name='admin-faq-detail'),
    path('faqs/<int:pk>/toggle/', AdminFAQToggleView.as_view(), name='admin-faq-toggle'),

    # Subscription plans
    path('plans/', AdminPlanListCreateView.as_view(), name='admin-plan-list'),
    path('plans/<int:pk>/', AdminPlanDetailView.as_view(), name='admin-plan-detail'),
    path('plans/<int:pk>/sync-stripe/', AdminPlanStripeSyncView.as_view(), name='admin-plan-sync-stripe'),

    # Stats
    path('stats/', AdminStatsView.as_view(), name='admin-stats'),
    path('stats/recalculate/', AdminStatsRecalculateView.as_view(), name='admin-stats-recalculate'),

    # Notifications — static paths before <int:pk>
    path('notifications/', AdminNotificationListView.as_view(), name='admin-notification-list'),
    path('notifications/unread-count/', AdminUnreadCountView.as_view(), name='admin-unread-count'),
    path('notifications/read-all/', AdminNotificationReadAllView.as_view(), name='admin-notification-read-all'),
    path('notifications/<int:pk>/read/', AdminNotificationReadView.as_view(), name='admin-notification-read'),
    path('notifications/<int:pk>/', AdminNotificationDeleteView.as_view(), name='admin-notification-delete'),

    # Global search
    path('search/', AdminGlobalSearchView.as_view(), name='admin-search'),

    # CSV export
    path('export/users/', AdminExportUsersView.as_view(), name='admin-export-users'),
    path('export/jobs/', AdminExportJobsView.as_view(), name='admin-export-jobs'),
    path('export/assessments/', AdminExportAssessmentsView.as_view(), name='admin-export-assessments'),
    path('export/contacts/', AdminExportContactsView.as_view(), name='admin-export-contacts'),

    # Admin profile — static path before potential future <pk>
    path('profile/', AdminProfileView.as_view(), name='admin-profile'),
    path('profile/change-password/', AdminChangePasswordView.as_view(), name='admin-change-password'),

    # Revenue & Billing
    path('revenue/', AdminRevenueOverviewView.as_view(), name='admin-revenue'),
    path('revenue/user/<int:user_id>/', AdminUserBillingView.as_view(), name='admin-user-billing'),
]
