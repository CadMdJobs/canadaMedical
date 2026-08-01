from django.conf import settings
from django.db import models


class Notification(models.Model):
    NOTIFICATION_TYPES = [
        # Admin-targeted
        ('admin_job',        'New Job Submitted'),
        ('admin_physician',  'New Physician Registered'),
        ('admin_employer',   'New Employer Registered'),
        ('admin_assessment', 'New Assessment Submitted'),
        ('admin_contact',    'New Contact Message'),
        # Employer-targeted
        ('employer_application',           'New Job Application'),
        ('employer_job_approved',          'Job Approved'),
        ('employer_job_rejected',          'Job Rejected'),
        ('employer_offer_accepted',        'Offer Accepted'),
        ('employer_offer_declined',        'Offer Declined'),
        ('employer_custom_plan_payment',   'Custom Plan Payment Link Ready'),
        ('employer_custom_plan_active',    'Custom Plan Activated'),
        # Physician-targeted
        ('physician_app_status',          'Application Status Changed'),
        ('physician_assessment_status',   'Assessment Status Updated'),
        # Admin-targeted (enterprise)
        ('admin_enterprise_request',      'New Enterprise Plan Request'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        null=True,
        blank=True,
        help_text='Null means admin-only notification (delivered to all staff)',
    )
    notification_type = models.CharField(max_length=40, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=255)
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True,
                            help_text='Frontend route to navigate to on click')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read'], name='notif_user_read_idx'),
            models.Index(fields=['user', '-created_at'], name='notif_user_created_idx'),
        ]

    def __str__(self):
        return f'[{self.notification_type}] {self.title}'
