import logging
import re
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from core.validators import validate_resume_file, validate_image_file  # centralised validators
from .models import PhysicianProfile, EmployerProfile

logger = logging.getLogger(__name__)

User = get_user_model()


def validate_password_strength(password: str) -> str:
    if len(password) < 8:
        raise serializers.ValidationError('Password must be at least 8 characters.')
    if not re.search(r'[A-Za-z]', password):
        raise serializers.ValidationError('Password must contain at least one letter.')
    if not re.search(r'\d', password):
        raise serializers.ValidationError('Password must contain at least one number.')
    try:
        django_validate_password(password)
    except DjangoValidationError as e:
        raise serializers.ValidationError(list(e.messages))
    return password


def validate_phone(phone: str) -> str:
    cleaned = re.sub(r'[\s\-\(\)\+]', '', phone)
    if phone and not cleaned.isdigit():
        raise serializers.ValidationError('Enter a valid phone number.')
    if phone and not (7 <= len(cleaned) <= 15):
        raise serializers.ValidationError('Phone number must be between 7 and 15 digits.')
    return cleaned


# ── Custom JWT ────────────────────────────────────────────────────────────────

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    user_type = serializers.ChoiceField(
        choices=['physician', 'employer', 'admin'],
        required=False,
        write_only=True,
    )

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['user_type'] = user.user_type
        token['full_name'] = user.full_name
        token['email'] = user.email
        token['is_admin'] = user.is_staff
        return token

    def validate(self, attrs):
        requested_type = attrs.pop('user_type', None)
        data = super().validate(attrs)
        actual_type = self.user.user_type
        is_admin = self.user.is_staff

        if requested_type and not is_admin:
            if requested_type == 'admin':
                raise serializers.ValidationError(
                    {'user_type': 'Admin accounts must log in through the admin portal.'}
                )
            if actual_type != requested_type:
                raise serializers.ValidationError(
                    {'user_type': f'This account is registered as a {actual_type}. Please select the correct account type.'}
                )

        data['user_type'] = actual_type
        data['full_name'] = self.user.full_name
        data['email'] = self.user.email
        data['is_admin'] = is_admin
        return data


# ── User ──────────────────────────────────────────────────────────────────────

class UserMeSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name', 'user_type', 'phone', 'date_joined']
        read_only_fields = ['id', 'email', 'user_type', 'date_joined']


# ── Physician Registration ────────────────────────────────────────────────────

class PhysicianRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    confirm_email = serializers.EmailField(write_only=True)
    terms_accepted = serializers.BooleanField(write_only=True)
    specialty = serializers.CharField(required=False, allow_blank=True)
    sub_specialty = serializers.CharField(required=False, allow_blank=True)
    cpso_number = serializers.CharField(required=False, allow_blank=True)
    board_certifications = serializers.CharField(required=False, allow_blank=True)
    degrees = serializers.CharField(required=False, allow_blank=True)
    country = serializers.CharField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    zip_code = serializers.CharField(required=False, allow_blank=True)
    work_eligibility = serializers.BooleanField(required=False, default=False)
    resume = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            'email', 'confirm_email', 'first_name', 'last_name', 'phone',
            'password', 'confirm_password',
            'terms_accepted',
            'specialty', 'sub_specialty', 'cpso_number',
            'board_certifications', 'degrees',
            'country', 'address', 'zip_code',
            'work_eligibility', 'resume',
        ]

    def validate_email(self, value):
        normalized = User.objects.normalize_email(value)
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return normalized

    def validate_password(self, value):
        return validate_password_strength(value)

    def validate_phone(self, value):
        return validate_phone(value)

    def validate_resume(self, value):
        if value:
            return validate_resume_file(value)
        return value

    def validate(self, data):
        if data['password'] != data.pop('confirm_password'):
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        if data['email'] != data.pop('confirm_email'):
            raise serializers.ValidationError({'confirm_email': 'Email addresses do not match.'})
        if not data.pop('terms_accepted'):
            raise serializers.ValidationError({'terms_accepted': 'You must accept the Terms of Use.'})
        return data

    def create(self, validated_data):
        profile_fields = {
            'specialty': validated_data.pop('specialty', ''),
            'sub_specialty': validated_data.pop('sub_specialty', ''),
            'cpso_number': validated_data.pop('cpso_number', ''),
            'board_certifications': validated_data.pop('board_certifications', ''),
            'degrees': validated_data.pop('degrees', ''),
            'country': validated_data.pop('country', ''),
            'address': validated_data.pop('address', ''),
            'zip_code': validated_data.pop('zip_code', ''),
            'work_eligibility': validated_data.pop('work_eligibility', False),
            'resume': validated_data.pop('resume', None),
        }
        validated_data['user_type'] = 'physician'
        with transaction.atomic():
            user = User.objects.create_user(**validated_data)
            profile = PhysicianProfile(user=user, **profile_fields)
            profile.check_profile_complete()
            profile.save()
        return user


# ── Employer Registration ─────────────────────────────────────────────────────

class EmployerRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    confirm_email = serializers.EmailField(write_only=True)
    terms_accepted = serializers.BooleanField(write_only=True)
    company_name = serializers.CharField()
    company_type = serializers.ChoiceField(choices=EmployerProfile.COMPANY_TYPE_CHOICES)
    company_phone = serializers.CharField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    country = serializers.CharField(required=False, allow_blank=True)
    zip_code = serializers.CharField(required=False, allow_blank=True)
    contact_person_first_name = serializers.CharField(required=False, allow_blank=True)
    contact_person_last_name = serializers.CharField(required=False, allow_blank=True)
    website = serializers.URLField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'email', 'confirm_email', 'first_name', 'last_name', 'phone',
            'password', 'confirm_password',
            'terms_accepted',
            'company_name', 'company_type', 'company_phone',
            'address', 'country', 'zip_code',
            'contact_person_first_name', 'contact_person_last_name', 'website',
        ]

    def validate_email(self, value):
        normalized = User.objects.normalize_email(value)
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return normalized

    def validate_password(self, value):
        return validate_password_strength(value)

    def validate_phone(self, value):
        return validate_phone(value)

    def validate(self, data):
        if data['password'] != data.pop('confirm_password'):
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        if data['email'] != data.pop('confirm_email'):
            raise serializers.ValidationError({'confirm_email': 'Email addresses do not match.'})
        if not data.pop('terms_accepted'):
            raise serializers.ValidationError({'terms_accepted': 'You must accept the Terms of Use.'})
        return data

    def create(self, validated_data):
        profile_fields = {
            'company_name': validated_data.pop('company_name'),
            'company_type': validated_data.pop('company_type'),
            'company_phone': validated_data.pop('company_phone', ''),
            'address': validated_data.pop('address', ''),
            'country': validated_data.pop('country', ''),
            'zip_code': validated_data.pop('zip_code', ''),
            'contact_person_first_name': validated_data.pop('contact_person_first_name', ''),
            'contact_person_last_name': validated_data.pop('contact_person_last_name', ''),
            'website': validated_data.pop('website', ''),
        }
        validated_data['user_type'] = 'employer'
        with transaction.atomic():
            user = User.objects.create_user(**validated_data)
            EmployerProfile.objects.create(user=user, **profile_fields)
        return user


# ── Physician Profile ─────────────────────────────────────────────────────────

class PhysicianProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True, allow_null=True)
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    avatar_url = serializers.SerializerMethodField()
    resume_url = serializers.SerializerMethodField()

    class Meta:
        model = PhysicianProfile
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name', 'phone',
            'avatar_url', 'bio', 'years_of_experience', 'linkedin_url',
            'specialty', 'sub_specialty', 'cpso_number',
            'board_certifications', 'degrees',
            'address', 'city', 'province', 'country', 'zip_code',
            'work_eligibility', 'resume', 'resume_url',
            'profile_complete', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'profile_complete', 'created_at', 'updated_at']

    def _abs(self, file_field):
        if not file_field:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(file_field.url) if request else file_field.url

    def get_avatar_url(self, obj):
        return self._abs(obj.avatar)

    def get_resume_url(self, obj):
        return self._abs(obj.resume)


class PhysicianProfileUpdateSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source='user.first_name', required=False, allow_blank=True)
    last_name = serializers.CharField(source='user.last_name', required=False, allow_blank=True)
    phone = serializers.CharField(source='user.phone', required=False, allow_blank=True)
    linkedin_url = serializers.URLField(required=False, allow_blank=True)

    class Meta:
        model = PhysicianProfile
        fields = [
            'first_name', 'last_name', 'phone',
            'avatar', 'bio', 'years_of_experience', 'linkedin_url',
            'specialty', 'sub_specialty', 'cpso_number',
            'board_certifications', 'degrees',
            'address', 'city', 'province', 'country', 'zip_code',
            'work_eligibility',
        ]

    def validate_avatar(self, value):
        if value:
            return validate_image_file(value)
        return value

    def validate_linkedin_url(self, value):
        if not value:
            return value
        if not value.startswith(('http://', 'https://')):
            value = f'https://{value}'
        return value

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        for attr, value in user_data.items():
            setattr(instance.user, attr, value)
        if user_data:
            instance.user.save(update_fields=list(user_data.keys()))

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.check_profile_complete()
        instance.save()
        return instance


class ResumeUploadSerializer(serializers.ModelSerializer):
    resume = serializers.FileField()

    class Meta:
        model = PhysicianProfile
        fields = ['resume']

    def validate_resume(self, value):
        return validate_resume_file(value)


# ── Employer Profile ──────────────────────────────────────────────────────────

class EmployerProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True, allow_null=True)
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = EmployerProfile
        fields = [
            'id', 'email', 'first_name', 'last_name', 'phone',
            'company_name', 'company_type', 'company_phone',
            'address', 'city', 'province', 'country', 'zip_code',
            'contact_person_first_name', 'contact_person_last_name',
            'website', 'logo_url', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_logo_url(self, obj):
        if obj.logo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.logo.url)
            return obj.logo.url
        return None


class EmployerProfileUpdateSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source='user.first_name', required=False, allow_blank=True)
    last_name = serializers.CharField(source='user.last_name', required=False, allow_blank=True)
    phone = serializers.CharField(source='user.phone', required=False, allow_blank=True)
    website = serializers.URLField(required=False, allow_blank=True)

    class Meta:
        model = EmployerProfile
        fields = [
            'first_name', 'last_name', 'phone',
            'company_name', 'company_type', 'company_phone',
            'address', 'city', 'province', 'country', 'zip_code',
            'contact_person_first_name', 'contact_person_last_name',
            'website', 'logo',
        ]

    def validate_logo(self, value):
        if value:
            return validate_image_file(value)
        return value

    def validate_website(self, value):
        if not value:
            return value
        if not value.startswith(('http://', 'https://')):
            value = f'https://{value}'
        return value

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        for attr, value in user_data.items():
            setattr(instance.user, attr, value)
        if user_data:
            instance.user.save(update_fields=list(user_data.keys()))

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


# ── Password Reset ────────────────────────────────────────────────────────────

class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)
    confirm_password = serializers.CharField()

    def validate_new_password(self, value):
        return validate_password_strength(value)

    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        try:
            uid = urlsafe_base64_decode(data['uid']).decode()
            user = User.objects.get(pk=uid)
        except (User.DoesNotExist, ValueError, TypeError, UnicodeDecodeError):
            raise serializers.ValidationError({'uid': 'Invalid reset link.'})

        if not default_token_generator.check_token(user, data['token']):
            raise serializers.ValidationError({'token': 'Invalid or expired reset token.'})

        data['user'] = user
        return data

    def save(self):
        from django.db import DatabaseError
        user = self.validated_data['user']
        user.set_password(self.validated_data['new_password'])
        user.save()
        try:
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
            tokens = OutstandingToken.objects.filter(user=user)
            BlacklistedToken.objects.bulk_create(
                [BlacklistedToken(token=t) for t in tokens],
                ignore_conflicts=True,
            )
        except DatabaseError as exc:
            logger.error(
                'Failed to blacklist tokens after password reset for user %s — '
                'existing sessions may remain active: %s',
                user.pk, exc,
            )
