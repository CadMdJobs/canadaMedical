from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.views.decorators.vary import vary_on_headers
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

from drf_spectacular.utils import extend_schema, extend_schema_view

from core.exceptions import success_response
from core.permissions import IsAdminUser
from .models import PlatformStats
from .serializers import PlatformStatsSerializer

# Cache public stats for 15 minutes — invalidated on PUT by the admin.
_STATS_CACHE_TTL = 60 * 15


@extend_schema_view(
    get=extend_schema(
        tags=['Stats'],
        operation_id='platform_stats_get',
        summary='Get public platform statistics',
        responses={200: PlatformStatsSerializer},
    ),
    put=extend_schema(
        tags=['Stats'],
        operation_id='platform_stats_update',
        summary='Update platform statistics (admin only)',
        request=PlatformStatsSerializer,
        responses={200: PlatformStatsSerializer},
    ),
)
class PlatformStatsView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAdminUser()]

    @method_decorator(cache_page(_STATS_CACHE_TTL, key_prefix='stats'))
    def get(self, request):
        stats = PlatformStats.get_stats()
        return success_response(data=PlatformStatsSerializer(stats).data)

    def put(self, request):
        from django.core.cache import cache
        stats = PlatformStats.get_stats()
        serializer = PlatformStatsSerializer(stats, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        # Bust the cached stats so the next GET returns fresh data
        cache.delete_pattern('canadamed:stats:*')
        return success_response(data=PlatformStatsSerializer(updated).data, message='Stats updated.')
