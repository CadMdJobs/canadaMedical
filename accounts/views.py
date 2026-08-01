import logging

from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.conf import settings

from emails.tasks import send_welcome_email_task, send_password_reset_email_task, send_admin_new_user_email_task

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from core.exceptions import success_response
from core.permissions import IsPhysician, IsEmployer, RegistrationThrottle, PasswordResetThrottle
from .models import PhysicianProfile, EmployerProfile
from .serializers import (
    CustomTokenObtainPairSerializer,
    PhysicianRegistrationSerializer,
    EmployerRegistrationSerializer,
    PhysicianProfileSerializer,
    PhysicianProfileUpdateSerializer,
    ResumeUploadSerializer,
    EmployerProfileSerializer,
    EmployerProfileUpdateSerializer,
    UserMeSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
)

User = get_user_model()


@extend_schema_view(
    post=extend_schema(
        tags=['Auth'],
        operation_id='physician_register',
        summary='Register a new physician account',
        request=PhysicianRegistrationSerializer,
        responses={201: OpenApiTypes.OBJECT},
    ),
)
class PhysicianRegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [RegistrationThrottle]

    def post(self, request):
        serializer = PhysicianRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        send_welcome_email_task.delay(user.pk)
        send_admin_new_user_email_task.delay(user.pk)
        refresh = RefreshToken.for_user(user)
        return success_response(
            data={
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user_type': user.user_type,
                'email': user.email,
                'full_name': user.full_name,
            },
            message='Physician account created successfully.',
            status_code=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    post=extend_schema(
        tags=['Auth'],
        operation_id='employer_register',
        summary='Register a new employer account',
        request=EmployerRegistrationSerializer,
        responses={201: OpenApiTypes.OBJECT},
    ),
)
class EmployerRegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [RegistrationThrottle]

    def post(self, request):
        serializer = EmployerRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        send_welcome_email_task.delay(user.pk)
        send_admin_new_user_email_task.delay(user.pk)
        refresh = RefreshToken.for_user(user)
        return success_response(
            data={
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user_type': user.user_type,
                'email': user.email,
                'full_name': user.full_name,
            },
            message='Employer account created successfully.',
            status_code=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    post=extend_schema(
        tags=['Auth'],
        operation_id='auth_login',
        summary='Login and obtain JWT access + refresh tokens',
        request=CustomTokenObtainPairSerializer,
        responses={200: OpenApiTypes.OBJECT},
    ),
)
class CustomLoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            return success_response(
                data=response.data,
                message='Login successful.',
            )
        return response


@extend_schema_view(
    post=extend_schema(
        tags=['Auth'],
        operation_id='auth_logout',
        summary='Logout and blacklist the refresh token',
        request=OpenApiTypes.OBJECT,
        responses={200: OpenApiTypes.OBJECT},
    ),
)
class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return success_response(message='Logged out successfully.')
        try:
            RefreshToken(refresh_token).blacklist()
        except TokenError:
            pass  # already expired or blacklisted — treat as a clean logout
        return success_response(message='Logged out successfully.')


@extend_schema_view(
    get=extend_schema(
        tags=['Auth'],
        operation_id='current_user_get',
        summary='Get the current authenticated user',
        responses={200: UserMeSerializer},
    ),
    put=extend_schema(
        tags=['Auth'],
        operation_id='current_user_update',
        summary='Update the current authenticated user',
        request=UserMeSerializer,
        responses={200: UserMeSerializer},
    ),
    patch=extend_schema(
        tags=['Auth'],
        operation_id='current_user_partial_update',
        summary='Partially update the current authenticated user',
        request=UserMeSerializer,
        responses={200: UserMeSerializer},
    ),
)
class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserMeSerializer(request.user)
        return success_response(data=serializer.data)

    def put(self, request):
        serializer = UserMeSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(data=serializer.data, message='User info updated.')

    def patch(self, request):
        serializer = UserMeSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(data=serializer.data, message='User info updated.')


@extend_schema_view(
    get=extend_schema(
        tags=['Profile'],
        operation_id='physician_profile_get',
        summary='Get the authenticated physician profile',
        responses={200: PhysicianProfileSerializer},
    ),
    put=extend_schema(
        tags=['Profile'],
        operation_id='physician_profile_update',
        summary='Update the authenticated physician profile',
        request=PhysicianProfileUpdateSerializer,
        responses={200: PhysicianProfileSerializer},
    ),
)
class PhysicianProfileView(APIView):
    permission_classes = [IsPhysician]

    def get(self, request):
        try:
            profile = request.user.physician_profile
        except PhysicianProfile.DoesNotExist:
            return success_response(message='Profile not found.', status_code=status.HTTP_404_NOT_FOUND)
        serializer = PhysicianProfileSerializer(profile, context={'request': request})
        return success_response(data=serializer.data)

    def put(self, request):
        try:
            profile = request.user.physician_profile
        except PhysicianProfile.DoesNotExist:
            profile = PhysicianProfile.objects.create(user=request.user)
        serializer = PhysicianProfileUpdateSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return success_response(
            data=PhysicianProfileSerializer(updated, context={'request': request}).data,
            message='Profile updated successfully.',
        )


@extend_schema_view(
    post=extend_schema(
        tags=['Profile'],
        operation_id='physician_resume_upload',
        summary='Upload a resume PDF for the authenticated physician',
        request=ResumeUploadSerializer,
        responses={200: OpenApiTypes.OBJECT},
    ),
)
class PhysicianResumeUploadView(APIView):
    permission_classes = [IsPhysician]

    def post(self, request):
        try:
            profile = request.user.physician_profile
        except PhysicianProfile.DoesNotExist:
            profile = PhysicianProfile.objects.create(user=request.user)
        serializer = ResumeUploadSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        resume_url = None
        if updated.resume:
            try:
                resume_url = request.build_absolute_uri(updated.resume.url)
            except (ValueError, AttributeError) as exc:
                logger.warning('Could not build absolute URI for resume (user=%s): %s', request.user.pk, exc)
                resume_url = updated.resume.name
        return success_response(
            data={'resume': resume_url},
            message='Resume uploaded successfully.',
        )


@extend_schema_view(
    get=extend_schema(
        tags=['Profile'],
        operation_id='employer_profile_get',
        summary='Get the authenticated employer profile',
        responses={200: EmployerProfileSerializer},
    ),
    put=extend_schema(
        tags=['Profile'],
        operation_id='employer_profile_update',
        summary='Update the authenticated employer profile',
        request=EmployerProfileUpdateSerializer,
        responses={200: EmployerProfileSerializer},
    ),
)
class EmployerProfileView(APIView):
    permission_classes = [IsEmployer]

    def get(self, request):
        try:
            profile = request.user.employer_profile
        except EmployerProfile.DoesNotExist:
            return success_response(message='Profile not found.', status_code=status.HTTP_404_NOT_FOUND)
        serializer = EmployerProfileSerializer(profile, context={'request': request})
        return success_response(data=serializer.data)

    def put(self, request):
        try:
            profile = request.user.employer_profile
        except EmployerProfile.DoesNotExist:
            return success_response(message='Employer profile not found.', status_code=status.HTTP_404_NOT_FOUND)
        serializer = EmployerProfileUpdateSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return success_response(
            data=EmployerProfileSerializer(updated, context={'request': request}).data,
            message='Profile updated successfully.',
        )


@extend_schema_view(
    post=extend_schema(
        tags=['Auth'],
        operation_id='password_reset_request',
        summary='Send a password reset email',
        request=PasswordResetRequestSerializer,
        responses={200: OpenApiTypes.OBJECT},
    ),
)
class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = User.objects.normalize_email(serializer.validated_data['email'])
        generic_msg = 'If an account with that email exists, a password reset link has been sent.'
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return success_response(message=generic_msg)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
        send_password_reset_email_task.delay(user.pk, reset_url)
        return success_response(message=generic_msg)


@extend_schema_view(
    post=extend_schema(
        tags=['Auth'],
        operation_id='password_reset_confirm',
        summary='Confirm password reset with uid and token',
        request=PasswordResetConfirmSerializer,
        responses={200: OpenApiTypes.OBJECT},
    ),
)
class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(message='Password reset successful. You can now log in.')


class ChangePasswordView(APIView):
    """
    Authenticated user changes their own password.
    Validates current password, enforces strength rules, then invalidates
    the provided refresh token so the client must re-authenticate.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .serializers_password import ChangePasswordSerializer
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        if not request.user.check_password(data['current_password']):
            return success_response(
                message='Current password is incorrect.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        request.user.set_password(data['new_password'])
        request.user.save(update_fields=['password'])

        refresh_token = data.get('refresh_token', '')
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                pass

        logger.info('User %s changed their password.', request.user.email)
        return success_response(message='Password changed successfully. Please log in again.')
