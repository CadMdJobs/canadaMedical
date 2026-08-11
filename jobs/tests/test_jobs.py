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


def _rows(response) -> list:
    """List endpoints answer either paginated or not depending on result size,
    so tests read through both shapes rather than pinning one."""
    body = response.data
    if isinstance(body, dict):
        for key in ('results', 'data'):
            if key in body:
                inner = body[key]
                return inner.get('results', inner) if isinstance(inner, dict) else inner
    return body or []


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


class JobQuotaTests(TestCase):
    """The plan's job limit must hold whichever door the employer comes through.

    The quota counts active jobs, so closing one frees a slot. Reopening had
    no check, which made the limit trivially bypassable: close, post a
    replacement, reopen — repeat for as many live listings as you like.
    """

    def setUp(self):
        self.client = APIClient()
        self.emp_user, self.emp_profile = _make_employer()
        plan = SubscriptionPlan.objects.create(
            name='Two Slots', plan_type='employer', price_monthly=99, job_post_limit=2,
        )
        UserSubscription.objects.create(user=self.emp_user, plan=plan, status='active')
        _auth(self.client, self.emp_user.email)

    def test_reopening_beyond_the_limit_is_refused(self):
        closed = _make_job(self.emp_profile, title='Closed Listing Here', is_active=False)
        _make_job(self.emp_profile, title='Live Listing One Here')
        _make_job(self.emp_profile, title='Live Listing Two Here')

        resp = self.client.post(f'/api/v1/jobs/{closed.pk}/reopen/')

        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        closed.refresh_from_db()
        self.assertFalse(closed.is_active)

    def test_reopening_within_the_limit_still_works(self):
        closed = _make_job(self.emp_profile, title='Closed Listing Here', is_active=False)
        _make_job(self.emp_profile, title='Live Listing One Here')

        resp = self.client.post(f'/api/v1/jobs/{closed.pk}/reopen/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        closed.refresh_from_db()
        self.assertTrue(closed.is_active)

    def test_editing_cannot_reopen_a_closed_job(self):
        """`is_active` is not an editable field — the close/reopen endpoints
        own that transition, and they are where the quota is enforced."""
        closed = _make_job(self.emp_profile, title='Closed Listing Here', is_active=False)
        _make_job(self.emp_profile, title='Live Listing One Here')
        _make_job(self.emp_profile, title='Live Listing Two Here')

        resp = self.client.put(
            f'/api/v1/jobs/{closed.pk}/',
            {'title': 'Closed Listing Renamed', 'is_active': True},
            format='json',
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        closed.refresh_from_db()
        self.assertEqual(closed.title, 'Closed Listing Renamed')
        self.assertFalse(closed.is_active)

    def test_owner_can_load_a_closed_job_to_edit_it(self):
        """Editing a closed or pending job has to be able to read it first."""
        closed = _make_job(self.emp_profile, title='Closed Listing Here', is_active=False)

        resp = self.client.get(f'/api/v1/jobs/{closed.pk}/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['data']['title'], 'Closed Listing Here')

    def test_a_stranger_still_cannot_see_a_closed_job(self):
        closed = _make_job(self.emp_profile, title='Closed Listing Here', is_active=False)
        other = APIClient()

        resp = other.get(f'/api/v1/jobs/{closed.pk}/')

        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class JobRemovalTests(TestCase):
    """Removing a listing must not take other people's records with it."""

    def setUp(self):
        self.client = APIClient()
        self.emp_user, self.emp_profile = _make_employer()
        _give_subscription(self.emp_user)
        self.phys_user, self.phys_profile = _make_physician()
        _auth(self.client, self.emp_user.email)

    def _apply_to(self, job):
        return JobApplication.objects.create(
            job=job, physician=self.phys_profile,
            job_title_snapshot=job.title,
            job_location_snapshot=job.location_display,
            employer_name_snapshot=job.employer.company_name,
        )

    def test_job_without_applications_is_really_deleted(self):
        job = _make_job(self.emp_profile, title='Nobody Applied Here')

        resp = self.client.delete(f'/api/v1/jobs/{job.pk}/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(Job.objects.filter(pk=job.pk).exists())

    def test_job_with_applications_is_archived_not_deleted(self):
        job = _make_job(self.emp_profile, title='Someone Applied Here')
        application = self._apply_to(job)

        resp = self.client.delete(f'/api/v1/jobs/{job.pk}/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        job.refresh_from_db()
        self.assertIsNotNone(job.archived_at)
        self.assertFalse(job.is_active)
        self.assertTrue(JobApplication.objects.filter(pk=application.pk).exists())

    def test_archived_job_leaves_every_listing(self):
        job = _make_job(self.emp_profile, title='Someone Applied Here')
        self._apply_to(job)
        self.client.delete(f'/api/v1/jobs/{job.pk}/')

        mine = self.client.get('/api/v1/jobs/my-jobs/')
        self.assertNotIn(job.pk, [row['id'] for row in _rows(mine)])

        public = APIClient().get('/api/v1/jobs/')
        self.assertNotIn(job.pk, [row['id'] for row in _rows(public)])

    def test_physician_keeps_the_application_after_archiving(self):
        job = _make_job(self.emp_profile, title='Someone Applied Here')
        self._apply_to(job)
        self.client.delete(f'/api/v1/jobs/{job.pk}/')

        phys_client = APIClient()
        _auth(phys_client, self.phys_user.email)
        resp = phys_client.get('/api/v1/jobs/my-applications/')

        rows = _rows(resp)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['job_title'], 'Someone Applied Here')
        self.assertTrue(rows[0]['job_archived'])

    def test_snapshot_survives_the_job_row_disappearing(self):
        """Even a hard delete from the admin or the database leaves the
        physician's history readable — that is what the snapshot is for."""
        job = _make_job(self.emp_profile, title='Someone Applied Here')
        application = self._apply_to(job)

        Job.objects.filter(pk=job.pk).delete()

        application.refresh_from_db()
        self.assertIsNone(application.job)
        self.assertEqual(application.job_title_snapshot, 'Someone Applied Here')
        self.assertEqual(application.employer_name_snapshot, 'ACME Corp')

    def test_archived_job_cannot_be_edited_or_reopened(self):
        job = _make_job(self.emp_profile, title='Someone Applied Here')
        self._apply_to(job)
        self.client.delete(f'/api/v1/jobs/{job.pk}/')

        edit = self.client.put(f'/api/v1/jobs/{job.pk}/', {'title': 'Sneaky Rename Here'}, format='json')
        self.assertEqual(edit.status_code, status.HTTP_400_BAD_REQUEST)

        reopen = self.client.post(f'/api/v1/jobs/{job.pk}/reopen/')
        self.assertEqual(reopen.status_code, status.HTTP_400_BAD_REQUEST)

        job.refresh_from_db()
        self.assertEqual(job.title, 'Someone Applied Here')
        self.assertFalse(job.is_active)


class FreePlanCreditTests(TestCase):
    """The free plan sells posts, not slots — deleting one does not refund it."""

    def setUp(self):
        self.client = APIClient()
        self.emp_user, self.emp_profile = _make_employer()
        plan = SubscriptionPlan.objects.create(
            name='Free Tier', plan_type='employer', price_monthly=0,
            is_free=True, job_post_limit=1,
        )
        UserSubscription.objects.create(user=self.emp_user, plan=plan, status='active')
        _auth(self.client, self.emp_user.email)

    def _post_job(self, title='Family Physician Wanted'):
        return self.client.post('/api/v1/jobs/', {
            'title': title,
            'specialty': 'family_medicine',
            'province': 'ON',
            'city': 'Toronto',
            'description': 'A' * 60,
            'qualifications': 'Qualified physician',
            'job_type': 'full_time',
            'contact_person': 'HR Person',
            'contact_email': 'hr@acme.test',
        }, format='json')

    def test_first_post_is_allowed_and_charged(self):
        resp = self._post_job()

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.emp_profile.refresh_from_db()
        self.assertEqual(self.emp_profile.jobs_posted_count, 1)

    def test_deleting_the_job_does_not_give_the_post_back(self):
        first = self._post_job()
        job_id = first.data['data']['id']
        self.client.delete(f'/api/v1/jobs/{job_id}/')
        self.assertFalse(Job.objects.filter(pk=job_id).exists())

        second = self._post_job(title='Second Attempt Posting')

        self.assertEqual(second.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Job.objects.filter(employer=self.emp_profile).count(), 0)

    def test_closing_does_not_give_the_post_back_either(self):
        first = self._post_job()
        job_id = first.data['data']['id']
        self.client.post(f'/api/v1/jobs/{job_id}/close/')

        second = self._post_job(title='Second Attempt Posting')

        self.assertEqual(second.status_code, status.HTTP_403_FORBIDDEN)

    def test_reopening_own_job_is_still_allowed_at_the_limit(self):
        """Reopening spends nothing — that post was already charged for."""
        first = self._post_job()
        job_id = first.data['data']['id']
        self.client.post(f'/api/v1/jobs/{job_id}/close/')

        resp = self.client.post(f'/api/v1/jobs/{job_id}/reopen/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(Job.objects.get(pk=job_id).is_active)

    def test_duplicate_also_draws_down_the_allowance(self):
        first = self._post_job()
        job_id = first.data['data']['id']

        resp = self.client.post(f'/api/v1/jobs/{job_id}/duplicate/')

        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
