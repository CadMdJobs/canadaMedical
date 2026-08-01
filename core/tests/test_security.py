"""
Security hardening tests — verify headers and access controls are in place.
"""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework import status


class SecurityHeaderTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_no_server_header_leakage(self):
        resp = self.client.get('/api/health/')
        # Nginx strips the Server header; Django shouldn't add sensitive version info
        server = resp.get('Server', '')
        self.assertNotIn('Django', server)

    def test_content_type_nosniff(self):
        resp = self.client.get('/api/health/')
        self.assertEqual(resp.get('X-Content-Type-Options', ''), 'nosniff')

    def test_x_frame_options(self):
        resp = self.client.get('/api/health/')
        self.assertIn(resp.get('X-Frame-Options', ''), ['DENY', 'SAMEORIGIN'])


class AdminAccessTests(TestCase):
    """Ensure admin 404s or redirects for unauthenticated users."""

    def setUp(self):
        self.client = APIClient()

    def test_admin_unauthenticated_redirects(self):
        resp = self.client.get('/admin/', follow=False)
        # Should redirect to login, not 200
        self.assertIn(resp.status_code, [301, 302])

    def test_api_endpoints_require_auth(self):
        protected = [
            '/api/v1/auth/me/',
            '/api/v1/jobs/my-jobs/',
            '/api/v1/admin/dashboard/',
        ]
        for url in protected:
            resp = self.client.get(url)
            self.assertEqual(
                resp.status_code, status.HTTP_401_UNAUTHORIZED,
                msg=f'Expected 401 for {url}, got {resp.status_code}',
            )


class FileUploadSecurityTests(TestCase):
    """Ensure file validators reject bad files."""

    def test_resume_extension_rejected(self):
        from core.validators import validate_resume_file
        from rest_framework import serializers
        from io import BytesIO
        from django.core.files.uploadedfile import SimpleUploadedFile

        evil_file = SimpleUploadedFile('evil.exe', b'\x4d\x5a\x90\x00', content_type='application/octet-stream')
        with self.assertRaises(serializers.ValidationError):
            validate_resume_file(evil_file)

    def test_image_extension_rejected(self):
        from core.validators import validate_image_file
        from rest_framework import serializers
        from django.core.files.uploadedfile import SimpleUploadedFile

        evil_file = SimpleUploadedFile('shell.php', b'<?php echo shell_exec($_GET["cmd"]); ?>', content_type='image/jpeg')
        with self.assertRaises(serializers.ValidationError):
            validate_image_file(evil_file)

    def test_pdf_magic_bytes_accepted(self):
        from core.validators import validate_resume_file
        from django.core.files.uploadedfile import SimpleUploadedFile

        valid_pdf = SimpleUploadedFile('cv.pdf', b'%PDF-1.4 fake content', content_type='application/pdf')
        result = validate_resume_file(valid_pdf)
        self.assertIsNotNone(result)

    def test_fake_pdf_rejected(self):
        from core.validators import validate_resume_file
        from rest_framework import serializers
        from django.core.files.uploadedfile import SimpleUploadedFile

        fake = SimpleUploadedFile('cv.pdf', b'This is not a PDF', content_type='application/pdf')
        with self.assertRaises(serializers.ValidationError):
            validate_resume_file(fake)
