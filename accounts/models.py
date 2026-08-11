import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone
from core.constants import SPECIALTY_CHOICES, SUB_SPECIALTY_CHOICES


class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email address is required.')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('user_type', 'admin')

        if not extra_fields.get('is_staff'):
            raise ValueError('Superuser must have is_staff=True.')
        if not extra_fields.get('is_superuser'):
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)


class CustomUser(AbstractBaseUser, PermissionsMixin):
    USER_TYPE_CHOICES = [
        ('physician', 'Physician'),
        ('employer', 'Employer'),
        ('admin', 'Admin'),
    ]

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    user_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES)
    phone = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name', 'user_type']

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()


def physician_resume_path(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
    return f'resumes/physician_{instance.user.id}/{uuid.uuid4().hex}.{ext}'


class PhysicianProfile(models.Model):
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='physician_profile')
    avatar = models.ImageField(upload_to='physician_avatars/', blank=True, null=True)
    bio = models.TextField(blank=True)
    years_of_experience = models.PositiveIntegerField(null=True, blank=True)
    linkedin_url = models.URLField(blank=True)
    specialty = models.CharField(max_length=50, choices=SPECIALTY_CHOICES, blank=True)
    sub_specialty = models.CharField(max_length=50, choices=SUB_SPECIALTY_CHOICES, blank=True)
    cpso_number = models.CharField(max_length=20, blank=True)
    board_certifications = models.TextField(blank=True)
    degrees = models.TextField(blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    province = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True, default='Canada')
    zip_code = models.CharField(max_length=20, blank=True)
    work_eligibility = models.BooleanField(default=False)
    resume = models.FileField(upload_to=physician_resume_path, blank=True, null=True)
    profile_complete = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Physician: {self.user.full_name}'

    def check_profile_complete(self):
        required = [self.specialty, self.country, self.user.first_name, self.user.last_name]
        self.profile_complete = all(required)


class EmployerProfile(models.Model):
    COMPANY_TYPE_CHOICES = [
        ('recruiter', 'Recruiter'),
        ('employer', 'Employer'),
    ]

    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='employer_profile')
    company_name = models.CharField(max_length=255)
    company_type = models.CharField(max_length=20, choices=COMPANY_TYPE_CHOICES)
    company_phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    province = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True, default='Canada')
    zip_code = models.CharField(max_length=20, blank=True)
    contact_person_first_name = models.CharField(max_length=150, blank=True)
    contact_person_last_name = models.CharField(max_length=150, blank=True)
    website = models.URLField(blank=True)
    logo = models.ImageField(upload_to='employer_logos/', blank=True, null=True)
    # Every job this employer has ever created. Only ever goes up — deleting a
    # listing does not give the post back. The free plan is sold as a fixed
    # number of posts rather than a number of live listings, and counting rows
    # in the jobs table would let an employer delete and repost forever.
    jobs_posted_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Employer: {self.company_name}'
