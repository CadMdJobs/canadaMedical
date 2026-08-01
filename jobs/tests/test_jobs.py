"""
Job listing and application endpoint tests.
Run: python manage.py test jobs.tests --verbosity=2
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import CustomUser, PhysicianProfile, EmployerProfile
from jobs.models import Job, JobApplication, SavedJob
from subscriptions.models import SubscriptionPlan, UserSubscription


def _make_user(email, user_type, password='Pass123!') -> CustomUser:
    return CustomUser.objects.create_user(
        email=email, first_name='Test', last_name='User',
        user_type=user_type, password=password,
    )


def _make_physician(email='phys@test.com') -> tuple[CustomUser, PhysicianProfile]:
    user = _make_user(email, 'physician')
    profile, _ = PhysicianProfile.objects.get_or_create(user=user)
    return user, profile


def _make_employer(email='emp@test.com') -> tuple[CustomUser, EmployerProfile]:
    user = _make_user(email, 'employer')
    profile, _ = EmployerProfile.objects.get_or_create(
        user=user, defaults={'company_name': 'ACME Corp', 'company_type': 'employer'}
    )
    return user, profile


def _give_subscription(employer_user: CustomUser):
    plan, _ = SubscriptionPlan.objects.get_or_create(
        name='Test Plan',
        defaults={
            'plan_type': 'employer',
            'price_monthly': 0,
            'is_free': True,
            'job_post_limit': None,
        },
    )
    UserSubscription.objects.get_or_create(
        user=employer_user,
        defaults={'plan': plan, 'status': 'active'},
    )


def _make_job(employer_profile: EmployerProfile, approved=True, **kwargs) -> Job:
    defaults = dict(
        title='Family Physician - Full Time',
        specialty='family_medicine',
        province='ON',
        city='Toronto',
        description='A' * 60,
        qualifications='Qualified physician',
        job_type='full_time',
        is_active=True,
        is_approved=approved,
    )
    defaults.update(kwargs)
    return Job.objects.create(employer=employer_profile, **defaults)


def _auth(client: APIClient, email: str, password='Pass123!') -> str:
    resp = client.post('/api/v1/auth/login/', {'email': email, 'password': password}, format='json')
    token = resp.data['data']['access']
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return token


class JobListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        _, emp_profile = _make_employer()
        self.job = _make_job(emp_profile, approved=True)
        self.unapproved = _make_job(emp_profile, approved=False, title='Unapproved Job')

    def test_public_list_only_approved(self):
        resp = self.client.get('/api/v1/jobs/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        titles = [j['title'] for j in resp.data['results']]
        self.assertIn(self.job.title, titles)
        self.assertNotIn(self.unapproved.title, titles)

    def test_filter_by_specialty(self):
        resp = self.client.get('/api/v1/jobs/?specialty=family_medicine')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for job in resp.data['results']:
            self.assertEqual(job['specialty'], 'family_medicine')

    def test_filter_by_province(self):
        resp = self.client.get('/api/v1/jobs/?province=ON')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for job in resp.data['results']:
            self.assertEqual(job['province'], 'ON')


class JobDetailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        _, emp_profile = _make_employer()
        self.job = _make_job(emp_profile)

    def test_approved_job_visible(self):
        resp = self.client.get(f'/api/v1/jobs/{self.job.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['data']['id'], self.job.pk)

    def test_view_count_increments(self):
        before = self.job.views_count
        self.client.get(f'/api/v1/jobs/{self.job.pk}/')
        self.job.refresh_from_db()
        self.assertEqual(self.job.views_count, before + 1)


class JobCreateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.emp_user, self.emp_profile = _make_employer()
        _give_subscription(self.emp_user)
        _auth(self.client, self.emp_user.email)

    def _payload(self, **kwargs):
        data = dict(
            title='Cardiologist Needed',
            specialty='internal_medicine',
            province='BC',
            city='Vancouver',
            description='A' * 60,
            qualifications='Board certified',
            job_type='full_time',
        )
        data.update(kwargs)
        return data

    def test_employer_can_create_job(self):
        resp = self.client.post('/api/v1/jobs/', self._payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertFalse(resp.data['data']['is_approved'])

    def test_physician_cannot_create_job(self):
        phys_client = APIClient()
        phys_user, _ = _make_physician('phys2@test.com')
        _auth(phys_client, phys_user.email)
        resp = phys_client.post('/api/v1/jobs/', self._payload(), format='json')
        self.assertIn(resp.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED])

    def test_unauthenticated_cannot_create_job(self):
        anon = APIClient()
        resp = anon.post('/api/v1/jobs/', self._payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class JobApplicationTests(TestCase):
    def setUp(self):
        self.phys_user, self.phys_profile = _make_physician()
        self.emp_user, self.emp_profile = _make_employer()
        self.job = _make_job(self.emp_profile)
        self.client = APIClient()
        _auth(self.client, self.phys_user.email)

    def test_physician_can_apply(self):
        resp = self.client.post(f'/api/v1/jobs/{self.job.pk}/apply/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            JobApplication.objects.filter(job=self.job, physician=self.phys_profile).exists()
        )

    def test_duplicate_application_rejected(self):
        JobApplication.objects.create(job=self.job, physician=self.phys_profile)
        resp = self.client.post(f'/api/v1/jobs/{self.job.pk}/apply/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_physician_can_save_job(self):
        resp = self.client.post(f'/api/v1/jobs/{self.job.pk}/save/')
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertTrue(SavedJob.objects.filter(job=self.job, physician=self.phys_profile).exists())

    def test_withdraw_application(self):
        app = JobApplication.objects.create(job=self.job, physician=self.phys_profile)
        resp = self.client.delete(f'/api/v1/jobs/applications/{app.pk}/withdraw/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(JobApplication.objects.filter(pk=app.pk).exists())
