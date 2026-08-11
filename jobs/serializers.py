import logging
from django.db import IntegrityError
from rest_framework import serializers
from accounts.serializers import validate_resume_file
from core.constants import SPECIALTY_CHOICES, SUB_SPECIALTY_CHOICES, PROVINCE_CHOICES, SPECIALTY_MAP
from .models import Job, JobApplication, SavedJob

logger = logging.getLogger(__name__)


class JobListSerializer(serializers.ModelSerializer):
    employer_name = serializers.CharField(source='employer.company_name', read_only=True)
    employer_type = serializers.CharField(source='employer.company_type', read_only=True)
    specialty_display = serializers.CharField(source='get_specialty_display', read_only=True)
    province_display = serializers.CharField(source='get_province_display', read_only=True)
    job_type_display = serializers.CharField(source='get_job_type_display', read_only=True)
    practice_setting_display = serializers.CharField(source='get_practice_setting_display', read_only=True)
    salary_min = serializers.FloatField(read_only=True)
    salary_max = serializers.FloatField(read_only=True)
    applications_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Job
        fields = [
            'id', 'title', 'specialty', 'specialty_display',
            'sub_specialty', 'province', 'province_display',
            'city', 'location_display',
            'job_type', 'job_type_display',
            'practice_setting', 'practice_setting_display',
            'salary_min', 'salary_max', 'salary_display', 'compensation_model',
            'employer_name', 'employer_type',
            'application_deadline', 'is_active', 'is_approved', 'is_featured',
            'remote_option', 'relocation_assistance',
            'required_experience',
            'views_count', 'applications_count', 'created_at',
        ]


class JobDetailSerializer(serializers.ModelSerializer):
    employer_name = serializers.CharField(source='employer.company_name', read_only=True)
    employer_type = serializers.CharField(source='employer.company_type', read_only=True)
    employer_website = serializers.CharField(source='employer.website', read_only=True)
    specialty_display = serializers.CharField(source='get_specialty_display', read_only=True)
    province_display = serializers.CharField(source='get_province_display', read_only=True)
    job_type_display = serializers.CharField(source='get_job_type_display', read_only=True)
    practice_setting_display = serializers.CharField(source='get_practice_setting_display', read_only=True)
    compensation_model_display = serializers.CharField(source='get_compensation_model_display', read_only=True)
    required_experience_display = serializers.CharField(source='get_required_experience_display', read_only=True)
    salary_min = serializers.FloatField(read_only=True)
    salary_max = serializers.FloatField(read_only=True)
    applications_count = serializers.SerializerMethodField()

    def get_applications_count(self, obj):
        if hasattr(obj, 'applications_count'):
            return obj.applications_count
        return obj.applications.count()

    class Meta:
        model = Job
        fields = [
            'id', 'title',
            'specialty', 'specialty_display',
            'sub_specialty', 'province', 'province_display',
            'city', 'location_display',
            'description', 'qualifications', 'requirements', 'responsibilities',
            'compensation', 'benefits',
            'application_deadline', 'contact_person', 'contact_email',
            'job_type', 'job_type_display',
            'practice_setting', 'practice_setting_display',
            'required_experience', 'required_experience_display',
            'salary_min', 'salary_max', 'salary_display',
            'compensation_model', 'compensation_model_display',
            'employer_name', 'employer_type', 'employer_website',
            'remote_option', 'relocation_assistance', 'is_featured',
            'is_active', 'is_approved', 'views_count', 'applications_count',
            'created_at', 'updated_at',
        ]


class JobCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = [
            'title', 'specialty', 'sub_specialty',
            'province', 'city',
            'description', 'qualifications', 'requirements', 'responsibilities',
            'compensation', 'benefits',
            'application_deadline', 'contact_person', 'contact_email',
            'job_type', 'practice_setting', 'required_experience',
            'salary_min', 'salary_max', 'salary_display', 'compensation_model',
            'remote_option', 'relocation_assistance',
        ]
        # `is_active` is deliberately absent. Opening and closing a listing
        # goes through the close/reopen endpoints, which enforce the plan's
        # job quota; accepting it here would let an employer reopen a job by
        # editing it and walk straight past that limit.

    def validate_title(self, value):
        if len(value.strip()) < 5:
            raise serializers.ValidationError('Job title must be at least 5 characters.')
        return value.strip()

    def validate_description(self, value):
        if len(value.strip()) < 50:
            raise serializers.ValidationError('Job description must be at least 50 characters.')
        return value.strip()

    def create(self, validated_data):
        employer = self.context['request'].user.employer_profile
        return Job.objects.create(employer=employer, **validated_data)

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save(update_fields=list(validated_data.keys()) + ['updated_at'])
        return instance


class JobApplicationSerializer(serializers.ModelSerializer):
    # These read through the job where it still exists and fall back to the
    # snapshot taken at apply time where it does not. Without the fallback a
    # removed listing would leave the physician looking at a blank row in
    # their own application history.
    job_title = serializers.SerializerMethodField()
    job_location = serializers.SerializerMethodField()
    employer_name = serializers.SerializerMethodField()
    job_id = serializers.SerializerMethodField()
    physician_name = serializers.CharField(source='physician.user.full_name', read_only=True)
    physician_email = serializers.CharField(source='physician.user.email', read_only=True)
    physician_specialty = serializers.CharField(source='physician.specialty', read_only=True)
    physician_specialty_display = serializers.SerializerMethodField()
    physician_cpso = serializers.CharField(source='physician.cpso_number', read_only=True)
    physician_certifications = serializers.CharField(source='physician.board_certifications', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    job_archived = serializers.SerializerMethodField()
    resume_url = serializers.SerializerMethodField()
    profile_resume_url = serializers.SerializerMethodField()

    class Meta:
        model = JobApplication
        fields = [
            'id', 'job_id', 'job_title', 'job_location', 'employer_name',
            'physician_name', 'physician_email',
            'physician_specialty', 'physician_specialty_display',
            'physician_cpso', 'physician_certifications',
            'cover_letter', 'resume_url', 'profile_resume_url',
            'phone', 'years_experience', 'linkedin_url',
            'availability_date', 'willing_to_relocate',
            'status', 'status_display', 'employer_notes',
            'job_archived', 'applied_at', 'updated_at',
        ]
        read_only_fields = ['id', 'status', 'applied_at', 'updated_at']

    def get_job_title(self, obj) -> str:
        return obj.job.title if obj.job else obj.job_title_snapshot

    def get_job_location(self, obj) -> str:
        return obj.job.location_display if obj.job else obj.job_location_snapshot

    def get_employer_name(self, obj) -> str:
        return obj.job.employer.company_name if obj.job else obj.employer_name_snapshot

    def get_job_id(self, obj):
        return obj.job_id

    def get_job_archived(self, obj) -> bool:
        """True once the listing is gone — archived outright, or hard-deleted
        back when it had no applications. The UI uses it to stop linking to a
        page that would 404."""
        return obj.job is None or obj.job.archived_at is not None

    def get_physician_specialty_display(self, obj):
        return SPECIALTY_MAP.get(obj.physician.specialty, obj.physician.specialty)

    def get_resume_url(self, obj):
        request = self.context.get('request')
        if obj.resume:
            try:
                return request.build_absolute_uri(obj.resume.url) if request else obj.resume.url
            except (ValueError, AttributeError) as exc:
                logger.warning('Could not build resume URL for application %s: %s', obj.pk, exc)
                return None
        return None

    def get_profile_resume_url(self, obj):
        request = self.context.get('request')
        if obj.physician.resume:
            try:
                return request.build_absolute_uri(obj.physician.resume.url) if request else obj.physician.resume.url
            except (ValueError, AttributeError) as exc:
                logger.warning('Could not build profile resume URL for physician %s: %s', obj.physician_id, exc)
                return None
        return None


class JobApplicationCreateSerializer(serializers.ModelSerializer):
    resume = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = JobApplication
        fields = [
            'cover_letter', 'resume',
            'phone', 'years_experience', 'linkedin_url',
            'availability_date', 'willing_to_relocate',
        ]

    def validate_resume(self, value):
        if value:
            return validate_resume_file(value)
        return value

    def validate(self, data):
        job = self.context['job']
        physician = self.context['request'].user.physician_profile

        if not job.is_active or not job.is_approved:
            raise serializers.ValidationError('This job is not currently accepting applications.')

        if JobApplication.objects.filter(job=job, physician=physician).exists():
            raise serializers.ValidationError('You have already applied to this job.')

        return data

    def create(self, validated_data):
        job = self.context['job']
        try:
            return JobApplication.objects.create(
                job=job,
                physician=self.context['request'].user.physician_profile,
                # Written once, never updated: this is what the listing said on
                # the day the physician applied.
                job_title_snapshot=job.title,
                job_location_snapshot=job.location_display,
                employer_name_snapshot=job.employer.company_name,
                **validated_data,
            )
        except IntegrityError:
            raise serializers.ValidationError('You have already applied to this job.')


class SavedJobSerializer(serializers.ModelSerializer):
    job_detail = JobListSerializer(source='job', read_only=True)

    class Meta:
        model = SavedJob
        fields = ['id', 'job', 'job_detail', 'saved_at']
        read_only_fields = ['id', 'saved_at']
