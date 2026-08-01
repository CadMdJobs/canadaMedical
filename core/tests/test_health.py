"""
Health check endpoint tests.
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status


class HealthCheckTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_endpoint_returns_200(self):
        resp = self.client.get('/api/health/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('status', resp.data)
        self.assertIn('checks', resp.data)
        self.assertIn('db', resp.data['checks'])

    def test_health_db_ok(self):
        resp = self.client.get('/api/health/')
        self.assertEqual(resp.data['checks']['db']['status'], 'ok')

    def test_health_no_auth_required(self):
        """Health endpoint must be publicly accessible for load balancers."""
        resp = self.client.get('/api/health/')
        self.assertNotEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
