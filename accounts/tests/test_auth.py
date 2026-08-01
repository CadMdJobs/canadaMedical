"""
Authentication endpoint tests.
Run: python manage.py test accounts.tests --verbosity=2
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import CustomUser, PhysicianProfile, EmployerProfile


def make_physician(**kwargs) -> CustomUser:
    defaults = dict(
        email='physician@test.com',
        first_name='Jane',
        last_name='Smith',
        user_type='physician',
        password='TestPass123!',
    )
    defaults.update(kwargs)
    user = CustomUser.objects.create_user(**defaults)
    PhysicianProfile.objects.get_or_create(user=user)
    return user


def make_employer(**kwargs) -> CustomUser:
    defaults = dict(
        email='employer@test.com',
        first_name='Bob',
        last_name='Corp',
        user_type='employer',
        password='TestPass123!',
    )
    defaults.update(kwargs)
    user = CustomUser.objects.create_user(**defaults)
    EmployerProfile.objects.get_or_create(user=user, defaults={'company_name': 'Test Corp', 'company_type': 'employer'})
    return user


class PhysicianRegistrationTests(TestCase):
    url = '/api/v1/auth/register/physician/'

    def setUp(self):
        self.client = APIClient()

    def _payload(self, **kwargs):
        data = {
            'email': 'newdoc@test.com',
            'confirm_email': 'newdoc@test.com',
            'first_name': 'Alice',
            'last_name': 'Doctor',
            'password': 'StrongPass99!',
            'confirm_password': 'StrongPass99!',
            'terms_accepted': True,
        }
        data.update(kwargs)
        return data

    def test_successful_registration(self):
        resp = self.client.post(self.url, self._payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn('access', resp.data['data'])
        self.assertIn('refresh', resp.data['data'])
        self.assertEqual(resp.data['data']['user_type'], 'physician')

    def test_duplicate_email_rejected(self):
        make_physician(email='newdoc@test.com')
        resp = self.client.post(self.url, self._payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_mismatch_rejected(self):
        resp = self.client.post(self.url, self._payload(confirm_password='Wrong1!'), format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_email_mismatch_rejected(self):
        resp = self.client.post(self.url, self._payload(confirm_email='other@test.com'), format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_terms_not_accepted_rejected(self):
        resp = self.client.post(self.url, self._payload(terms_accepted=False), format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_weak_password_rejected(self):
        resp = self.client.post(
            self.url,
            self._payload(password='abc', confirm_password='abc'),
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class LoginTests(TestCase):
    url = '/api/v1/auth/login/'

    def setUp(self):
        self.client = APIClient()
        self.user = make_physician()

    def test_login_success(self):
        resp = self.client.post(
            self.url, {'email': self.user.email, 'password': 'TestPass123!'}, format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['success'])
        self.assertIn('access', resp.data['data'])

    def test_wrong_password(self):
        resp = self.client.post(
            self.url, {'email': self.user.email, 'password': 'WrongPassword'}, format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inactive_user_blocked(self):
        self.user.is_active = False
        self.user.save()
        resp = self.client.post(
            self.url, {'email': self.user.email, 'password': 'TestPass123!'}, format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class LogoutTests(TestCase):
    url = '/api/v1/auth/logout/'

    def setUp(self):
        self.client = APIClient()
        self.user = make_physician()

    def _login(self):
        resp = self.client.post(
            '/api/v1/auth/login/', {'email': self.user.email, 'password': 'TestPass123!'}, format='json'
        )
        return resp.data['data']

    def test_logout_blacklists_refresh(self):
        tokens = self._login()
        resp = self.client.post(self.url, {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Second refresh attempt must fail
        resp2 = self.client.post('/api/v1/auth/token/refresh/', {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_without_token_succeeds(self):
        resp = self.client.post(self.url, {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class CurrentUserTests(TestCase):
    url = '/api/v1/auth/me/'

    def setUp(self):
        self.client = APIClient()
        self.user = make_physician()

    def _auth(self):
        resp = self.client.post(
            '/api/v1/auth/login/', {'email': self.user.email, 'password': 'TestPass123!'}, format='json'
        )
        token = resp.data['data']['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_authenticated_returns_user(self):
        self._auth()
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['data']['email'], self.user.email)

    def test_unauthenticated_denied(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class PasswordResetTests(TestCase):
    request_url = '/api/v1/auth/password/reset/'

    def setUp(self):
        self.client = APIClient()
        self.user = make_physician()

    def test_unknown_email_still_returns_200(self):
        """Must not leak user existence via different status codes."""
        resp = self.client.post(self.request_url, {'email': 'nobody@test.com'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_known_email_returns_200(self):
        resp = self.client.post(self.request_url, {'email': self.user.email}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
