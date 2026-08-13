from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from contact.models import ContactSubmission

User = get_user_model()


def make_admin(email='admin@test.com'):
    return User.objects.create_user(
        email=email, password='StrongPass1', first_name='Ad', last_name='Min',
        user_type='admin', is_staff=True,
    )


def make_contact(**kwargs):
    defaults = dict(
        full_name='Dana Reyes',
        email='dana@example.com',
        phone='416-555-0134',
        subject='Question about posting',
        message='First line.\n\nSecond paragraph with detail.',
    )
    defaults.update(kwargs)
    return ContactSubmission.objects.create(**defaults)


class ContactListTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(make_admin())
        self.contact = make_contact()

    def test_non_admin_is_refused(self):
        client = APIClient()
        client.force_authenticate(User.objects.create_user(
            email='doc@test.com', password='StrongPass1', user_type='physician',
        ))
        self.assertEqual(client.get('/api/v1/admin/contacts/').status_code, 403)

    def test_list_carries_the_fields_the_table_renders(self):
        """The table read name/date/message straight off the list response, so a
        missing field showed as a blank column rather than an error."""
        row = self.client.get('/api/v1/admin/contacts/').json()['data'][0]
        for field in ('full_name', 'email', 'subject', 'message', 'submitted_at', 'status'):
            self.assertIn(field, row, f'{field} missing from list response')
        self.assertEqual(row['full_name'], 'Dana Reyes')
        self.assertEqual(row['status'], 'new')
        self.assertIn('Second paragraph', row['message'])

    def test_message_keeps_its_line_breaks(self):
        row = self.client.get('/api/v1/admin/contacts/').json()['data'][0]
        self.assertIn('\n', row['message'])


class ContactStatusTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(make_admin())
        self.contact = make_contact()

    def test_status_can_be_changed(self):
        """PATCH on the detail route used to 405 — the view had only GET and
        DELETE, so every status change from the table failed."""
        resp = self.client.patch(
            f'/api/v1/admin/contacts/{self.contact.pk}/', {'status': 'read'}, format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.contact.refresh_from_db()
        self.assertEqual(self.contact.status, 'read')

    def test_unknown_status_is_rejected(self):
        resp = self.client.patch(
            f'/api/v1/admin/contacts/{self.contact.pk}/', {'status': 'archived'}, format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_submitted_content_cannot_be_edited(self):
        """Only status is writable; the rest is what the sender actually typed."""
        self.client.patch(
            f'/api/v1/admin/contacts/{self.contact.pk}/',
            {'status': 'read', 'message': 'tampered', 'email': 'attacker@example.com'},
            format='json',
        )
        self.contact.refresh_from_db()
        self.assertIn('First line.', self.contact.message)
        self.assertEqual(self.contact.email, 'dana@example.com')

    def test_replied_keeps_the_legacy_flag_in_step(self):
        """is_responded still backs the dashboard's unread count, so it has to
        follow status rather than drift away from it."""
        self.client.patch(
            f'/api/v1/admin/contacts/{self.contact.pk}/', {'status': 'replied'}, format='json',
        )
        self.contact.refresh_from_db()
        self.assertTrue(self.contact.is_responded)

        self.client.patch(
            f'/api/v1/admin/contacts/{self.contact.pk}/', {'status': 'read'}, format='json',
        )
        self.contact.refresh_from_db()
        self.assertFalse(self.contact.is_responded)

    def test_respond_endpoint_still_marks_replied(self):
        resp = self.client.patch(f'/api/v1/admin/contacts/{self.contact.pk}/respond/')
        self.assertEqual(resp.status_code, 200)
        self.contact.refresh_from_db()
        self.assertEqual(self.contact.status, 'replied')
        self.assertTrue(self.contact.is_responded)

    def test_delete_removes_the_enquiry(self):
        resp = self.client.delete(f'/api/v1/admin/contacts/{self.contact.pk}/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(ContactSubmission.objects.filter(pk=self.contact.pk).exists())


class ContactExportTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(make_admin())
        make_contact()

    def test_export_includes_the_message(self):
        resp = self.client.get('/api/v1/admin/export/contacts/')
        self.assertEqual(resp.status_code, 200)
        body = resp.content.decode()
        self.assertIn('Message', body)
        self.assertIn('Dana Reyes', body)
        self.assertIn('Second paragraph', body)
