import uuid
from django.db import models
from accounts.models import PhysicianProfile, EmployerProfile
from core.constants import (
    SPECIALTY_CHOICES, SUB_SPECIALTY_CHOICES, PROVINCE_CHOICES,
    JOB_TYPE_CHOICES, PRACTICE_SETTING_CHOICES, COMPENSATION_MODEL_CHOICES,
    EXPERIENCE_LEVEL_CHOICES, APPLICATION_STATUS_CHOICES,
)


def application_resume_path(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower()
    return f'applications/resumes/{instance.job_id}/{uuid.uuid4().hex}.{ext}'


class Job(models.Model):
    employer = models.ForeignKey(EmployerProfile, on_delete=models.CASCADE, related_name='jobs')
    title = models.CharField(max_length=255)
    specialty = models.CharField(max_length=50, choices=SPECIALTY_CHOICES)
    sub_specialty = models.CharField(max_length=50, choices=SUB_SPECIALTY_CHOICES, blank=True)
    province = models.CharField(max_length=2, choices=PROVINCE_CHOICES)
    city = models.CharField(max_length=100)
    location_display = models.CharField(max_length=255, blank=True)
    description = models.TextField()
    qualifications = models.TextField()
    requirements = models.TextField(blank=True, help_text='Required licences, certifications, years of experience etc.')
    responsibilities = models.TextField(blank=True, help_text='Day-to-day duties and responsibilities')
    compensation = models.TextField(blank=True)
    benefits = models.TextField(blank=True)
    application_deadline = models.DateField(null=True, blank=True)
    contact_person = models.CharField(max_length=255, blank=True)
    contact_email = models.EmailField(blank=True)
    job_type = models.CharField(max_length=20, choices=JOB_TYPE_CHOICES, default='full_time')
    practice_setting = models.CharField(max_length=50, choices=PRACTICE_SETTING_CHOICES, blank=True, null=True)
    required_experience = models.CharField(max_length=20, choices=EXPERIENCE_LEVEL_CHOICES, blank=True, null=True)
    salary_min = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    salary_max = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    compensation_model = models.CharField(max_length=50, choices=COMPENSATION_MODEL_CHOICES, blank=True, null=True)
    salary_display = models.CharField(max_length=100, blank=True, null=True)
    remote_option = models.BooleanField(default=False, help_text='Position allows remote/telemedicine work')
    relocation_assistance = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_approved = models.BooleanField(default=False)
    # Set when an employer removes a listing that people have applied to. The
    # row stays so the applications keep their parent; it simply stops being a
    # job anyone can see. A listing with no applications is still deleted
    # outright — archiving those would only clutter the employer's own list.
    archived_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, null=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    views_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['is_active', 'is_approved'], name='job_active_approved_idx'),
            models.Index(fields=['employer', 'is_active'], name='job_employer_active_idx'),
            models.Index(fields=['specialty'], name='job_specialty_idx'),
            models.Index(fields=['province'], name='job_province_idx'),
            models.Index(fields=['job_type', 'province'], name='job_type_province_idx'),
            models.Index(fields=['-created_at'], name='job_created_at_idx'),
        ]

    def __str__(self):
        return f'{self.title} — {self.location_display or self.city}'

    def save(self, *args, **kwargs):
        if self.city and self.province:
            province_name = dict(PROVINCE_CHOICES).get(self.province, self.province)
            self.location_display = f'{self.city}, {province_name}'
        super().save(*args, **kwargs)


class JobApplication(models.Model):
    STATUS_CHOICES = APPLICATION_STATUS_CHOICES

    # SET_NULL, not CASCADE: an application is the record of something a
    # physician did, and deleting the employer's listing must not erase it.
    # The API archives instead of deleting whenever applications exist, so
    # this only fires for admin or database-level deletion — the cases where
    # silent loss would be worst.
    job = models.ForeignKey(Job, on_delete=models.SET_NULL, null=True, related_name='applications')
    physician = models.ForeignKey(PhysicianProfile, on_delete=models.CASCADE, related_name='applications')
    # Copied from the job at apply time so the physician's history stays
    # readable even if the listing is later edited or removed. This is also
    # the more honest record: it shows what they actually applied to, not
    # what the posting was rewritten into afterwards.
    job_title_snapshot = models.CharField(max_length=255, blank=True)
    job_location_snapshot = models.CharField(max_length=255, blank=True)
    employer_name_snapshot = models.CharField(max_length=255, blank=True)
    cover_letter = models.TextField(blank=True)
    resume = models.FileField(upload_to=application_resume_path, blank=True, null=True,
                              help_text='CV/resume submitted with this application')
    phone = models.CharField(max_length=30, blank=True)
    years_experience = models.PositiveSmallIntegerField(null=True, blank=True)
    linkedin_url = models.URLField(blank=True)
    availability_date = models.DateField(null=True, blank=True)
    willing_to_relocate = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    employer_notes = models.TextField(blank=True, help_text='Internal notes visible only to the employer')
    applied_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('job', 'physician')
        ordering = ['-applied_at']
        indexes = [
            models.Index(fields=['physician', 'status'], name='app_physician_status_idx'),
            models.Index(fields=['job', 'status'], name='app_job_status_idx'),
        ]

    def __str__(self):
        return f'{self.physician.user.full_name} → {self.job.title}'


class SavedJob(models.Model):
    physician = models.ForeignKey(PhysicianProfile, on_delete=models.CASCADE, related_name='saved_jobs')
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name='saved_by')
    saved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('physician', 'job')
        ordering = ['-saved_at']

    def __str__(self):
        return f'{self.physician.user.full_name} saved {self.job.title}'
