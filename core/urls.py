from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from core.health import health_check

# ── Admin URL hardening ───────────────────────────────────────────────────────
# The admin path is read from settings so it can be changed per-environment
# without a code change. Set DJANGO_ADMIN_URL in production .env.
ADMIN_URL = getattr(settings, 'DJANGO_ADMIN_URL', 'admin')

urlpatterns = [
    # Lightweight health probe — used by Docker, load balancers, and uptime monitors
    path('api/health/', health_check, name='health-check'),

    # Django admin — path comes from settings to allow obfuscation in prod
    path(f'{ADMIN_URL}/', admin.site.urls),

    # OpenAPI docs (only enabled in DEBUG or when explicitly allowed)
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # ── v1 API namespace ──────────────────────────────────────────────────────
    # All application endpoints are under /api/v1/ for versioning.
    # Keep legacy /api/ aliases during the transition period.
    path('api/v1/', include('accounts.urls')),
    path('api/v1/jobs/', include('jobs.urls')),
    path('api/v1/assessments/', include('assessments.urls')),
    path('api/v1/testimonials/', include('testimonials.urls')),
    path('api/v1/contact/', include('contact.urls')),
    path('api/v1/faq/', include('faq.urls')),
    path('api/v1/stats/', include('stats.urls')),
    path('api/v1/admin/', include('admin_panel.urls')),
    path('api/v1/notifications/', include('notifications.urls')),
    path('api/v1/subscriptions/', include('subscriptions.urls')),

    # Legacy aliases — keep for backward compat while frontend migrates to /v1/
    path('api/', include('accounts.urls')),
    path('api/jobs/', include('jobs.urls')),
    path('api/assessments/', include('assessments.urls')),
    path('api/testimonials/', include('testimonials.urls')),
    path('api/contact/', include('contact.urls')),
    path('api/faq/', include('faq.urls')),
    path('api/stats/', include('stats.urls')),
    path('api/admin/', include('admin_panel.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/subscriptions/', include('subscriptions.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
