"""
Production middleware utilities.
"""
import ipaddress
import uuid
import logging

from django.conf import settings
from django.http import HttpResponseForbidden

logger = logging.getLogger(__name__)


class AdminIPRestrictionMiddleware:
    """
    Block access to the Django admin from IPs not in ADMIN_ALLOWED_IPS.
    Only active when ADMIN_ALLOWED_IPS is non-empty and DEBUG=False.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self._networks = self._build_networks()
        self._admin_prefix = f"/{getattr(settings, 'DJANGO_ADMIN_URL', 'admin')}/"

    def _build_networks(self):
        allowed = getattr(settings, 'ADMIN_ALLOWED_IPS', [])
        networks = []
        for entry in allowed:
            try:
                networks.append(ipaddress.ip_network(entry, strict=False))
            except ValueError:
                logger.warning("AdminIPRestrictionMiddleware: invalid CIDR/IP '%s'", entry)
        return networks

    def __call__(self, request):
        if (
            not settings.DEBUG
            and self._networks
            and request.path.startswith(self._admin_prefix)
        ):
            client_ip = self._get_ip(request)
            try:
                addr = ipaddress.ip_address(client_ip)
            except ValueError:
                return HttpResponseForbidden("Forbidden")
            if not any(addr in net for net in self._networks):
                logger.warning(
                    "Admin access denied from IP %s (path: %s)", client_ip, request.path
                )
                return HttpResponseForbidden("Forbidden")
        return self.get_response(request)

    @staticmethod
    def _get_ip(request) -> str:
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "unknown")


class RequestIDMiddleware:
    """
    Attach a unique request ID to every request/response.
    Enables log correlation across backend, Celery, and frontend.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = (
            request.META.get("HTTP_X_REQUEST_ID")
            or str(uuid.uuid4())
        )
        request.request_id = request_id
        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        return response
