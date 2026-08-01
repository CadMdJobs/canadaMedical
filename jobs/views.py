from django.db import transaction
from django.db.models import Count, F, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status, generics
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from io import BytesIO
import datetime as dt

from accounts.models import EmployerProfile
from core.constants import SPECIALTY_CHOICES, SUB_SPECIALTY_CHOICES, PROVINCE_CHOICES, PRACTICE_SETTING_CHOICES
from core.exceptions import success_response
from core.permissions import IsPhysician, IsEmployer
from services.subscription_service import check_job_posting_limit
from .models import Job, JobApplication, SavedJob
from .serializers import (
    JobListSerializer,
    JobDetailSerializer,
    JobCreateUpdateSerializer,
    JobApplicationSerializer,
    JobApplicationCreateSerializer,
    SavedJobSerializer,
)
from .filters import JobFilter

_JOB_FILTER_PARAMS = [
    OpenApiParameter('specialty', OpenApiTypes.STR, description='Filter by specialty slug'),
    OpenApiParameter('sub_specialty', OpenApiTypes.STR, description='Filter by sub-specialty slug'),
    OpenApiParameter('province', OpenApiTypes.STR, description='Province code, e.g. ON'),
    OpenApiParameter('city', OpenApiTypes.STR, description='City name (partial match)'),
    OpenApiParameter('job_type', OpenApiTypes.STR, description='full_time / part_time / locum / contract'),
    OpenApiParameter('keyword', OpenApiTypes.STR, description='Keyword search across title, description, employer'),
    OpenApiParameter('posted_after', OpenApiTypes.DATE, description='Jobs posted on or after this date'),
    OpenApiParameter('posted_before', OpenApiTypes.DATE, description='Jobs posted on or before this date'),
    OpenApiParameter('ordering', OpenApiTypes.STR, description='Sort field, e.g. -created_at'),
    OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
    OpenApiParameter('page_size', OpenApiTypes.INT, description='Results per page'),
]


@extend_schema_view(
    get=extend_schema(tags=['Jobs'], operation_id='job_list', summary='List approved active jobs',
                      responses=JobListSerializer, parameters=_JOB_FILTER_PARAMS),
    post=extend_schema(tags=['Jobs'], operation_id='job_create', summary='Post a new job (employer only)',
                       request=JobCreateUpdateSerializer, responses={201: JobDetailSerializer}),
)
class JobListCreateView(generics.ListCreateAPIView):
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = JobFilter
    ordering_fields = ['created_at', 'title', 'views_count']
    ordering = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        qs = Job.objects.select_related('employer').annotate(
            applications_count=Count('applications', distinct=True)
        )
        if user.is_authenticated and user.is_staff:
            return qs
        return qs.filter(is_active=True, is_approved=True)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return JobCreateUpdateSerializer
        return JobListSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsEmployer()]
        return [AllowAny()]

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return success_response(data=serializer.data)

    def create(self, request, *args, **kwargs):
        employer = request.user.employer_profile
        with transaction.atomic():
            allowed, error_message = check_job_posting_limit(request.user, employer)
            if not allowed:
                return success_response(
                    message=error_message,
                    status_code=status.HTTP_403_FORBIDDEN,
                )
            serializer = self.get_serializer(data=request.data, context={'request': request})
            serializer.is_valid(raise_exception=True)
            job = serializer.save()
        from emails.tasks import send_admin_new_job_email_task
        send_admin_new_job_email_task.delay(job.pk)
        return success_response(
            data=JobDetailSerializer(job).data,
            message='Job posting created. It will be visible after admin approval.',
            status_code=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    get=extend_schema(tags=['Jobs'], operation_id='job_detail', summary='Get job detail', responses=JobDetailSerializer),
    put=extend_schema(tags=['Jobs'], operation_id='job_update', summary='Update a job (employer owner or admin)',
                      request=JobCreateUpdateSerializer, responses=JobDetailSerializer),
    delete=extend_schema(tags=['Jobs'], operation_id='job_delete', summary='Delete a job',
                         responses={200: OpenApiTypes.OBJECT}),
)
class JobDetailView(APIView):
    def get_permissions(self):
        if self.request.method in ('PUT', 'DELETE'):
            return [IsAuthenticated()]
        return [AllowAny()]

    def get(self, request, pk):
        qs = Job.objects.annotate(applications_count=Count('applications', distinct=True))
        job = get_object_or_404(qs, pk=pk)
        if not (request.user.is_authenticated and request.user.is_staff):
            if not job.is_approved or not job.is_active:
                return success_response(message='This job is no longer available.', status_code=status.HTTP_404_NOT_FOUND)
        Job.objects.filter(pk=pk).update(views_count=F('views_count') + 1)
        job.refresh_from_db(fields=['views_count'])
        return success_response(data=JobDetailSerializer(job).data)

    def put(self, request, pk):
        job = get_object_or_404(Job.objects.select_related('employer__user'), pk=pk)
        if not request.user.is_staff and job.employer.user != request.user:
            return success_response(message='Permission denied.', status_code=status.HTTP_403_FORBIDDEN)
        serializer = JobCreateUpdateSerializer(job, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return success_response(data=JobDetailSerializer(updated).data, message='Job updated.')

    def delete(self, request, pk):
        job = get_object_or_404(Job.objects.select_related('employer__user'), pk=pk)
        if not request.user.is_staff and job.employer.user != request.user:
            return success_response(message='Permission denied.', status_code=status.HTTP_403_FORBIDDEN)
        job.delete()
        return success_response(message='Job deleted successfully.')


class JobCloseView(APIView):
    permission_classes = [IsEmployer]

    def post(self, request, pk):
        job = get_object_or_404(Job, pk=pk, employer=request.user.employer_profile)
        job.is_active = False
        job.save(update_fields=['is_active'])
        return success_response(message='Job closed successfully.')


class JobReopenView(APIView):
    permission_classes = [IsEmployer]

    def post(self, request, pk):
        job = get_object_or_404(Job, pk=pk, employer=request.user.employer_profile)
        job.is_active = True
        job.save(update_fields=['is_active'])
        return success_response(message='Job reopened successfully.')


class JobDuplicateView(APIView):
    permission_classes = [IsEmployer]

    def post(self, request, pk):
        employer = request.user.employer_profile
        with transaction.atomic():
            allowed, error_message = check_job_posting_limit(request.user, employer)
            if not allowed:
                return success_response(message=error_message, status_code=status.HTTP_403_FORBIDDEN)
            source = get_object_or_404(Job, pk=pk, employer=employer)
            copy = Job.objects.create(
                employer=employer,
                title=f'{source.title} (Copy)',
                specialty=source.specialty,
                sub_specialty=source.sub_specialty,
                province=source.province,
                city=source.city,
                description=source.description,
                qualifications=source.qualifications,
                requirements=source.requirements,
                responsibilities=source.responsibilities,
                compensation=source.compensation,
                benefits=source.benefits,
                application_deadline=source.application_deadline,
                contact_person=source.contact_person,
                contact_email=source.contact_email,
                job_type=source.job_type,
                practice_setting=source.practice_setting,
                required_experience=source.required_experience,
                salary_min=source.salary_min,
                salary_max=source.salary_max,
                salary_display=source.salary_display,
                compensation_model=source.compensation_model,
                remote_option=source.remote_option,
                relocation_assistance=source.relocation_assistance,
                is_active=True,
                is_approved=False,
                views_count=0,
            )
        return success_response(
            data=JobListSerializer(copy).data,
            message='Job duplicated. It will be visible after admin approval.',
            status_code=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    get=extend_schema(
        tags=['Jobs'], operation_id='employer_my_jobs',
        summary='List jobs posted by the authenticated employer (supports filtering)',
        responses=JobListSerializer,
        parameters=[
            OpenApiParameter('search', OpenApiTypes.STR, description='Keyword search across title, specialty, city'),
            OpenApiParameter('specialty', OpenApiTypes.STR, description='Filter by specialty slug'),
            OpenApiParameter('job_type', OpenApiTypes.STR, description='Filter by job type'),
            OpenApiParameter('status', OpenApiTypes.STR, description='active | pending | closed'),
        ],
    ),
)
class EmployerMyJobsView(generics.ListAPIView):
    permission_classes = [IsEmployer]
    serializer_class = JobListSerializer

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Job.objects.none()
        qs = Job.objects.select_related('employer').annotate(
            applications_count=Count('applications', distinct=True)
        ).filter(
            employer=self.request.user.employer_profile
        ).order_by('-created_at')

        p = self.request.query_params
        search = p.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(specialty__icontains=search) |
                Q(city__icontains=search) |
                Q(location_display__icontains=search)
            )
        specialty = p.get('specialty', '').strip()
        if specialty:
            qs = qs.filter(specialty__iexact=specialty)
        job_type = p.get('job_type', '').strip()
        if job_type:
            qs = qs.filter(job_type__iexact=job_type)
        status_filter = p.get('status', '').strip()
        if status_filter == 'active':
            qs = qs.filter(is_active=True, is_approved=True)
        elif status_filter == 'pending':
            qs = qs.filter(is_active=True, is_approved=False)
        elif status_filter == 'closed':
            qs = qs.filter(is_active=False)
        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return success_response(data=self.get_serializer(queryset, many=True).data)


@extend_schema_view(
    get=extend_schema(
        tags=['Jobs'], operation_id='employer_all_applications',
        summary='All applications across all employer jobs (supports filtering)',
        responses=JobApplicationSerializer,
        parameters=[
            OpenApiParameter('search', OpenApiTypes.STR, description='Search by physician name or email'),
            OpenApiParameter('status', OpenApiTypes.STR, description='Filter by application status'),
            OpenApiParameter('job_id', OpenApiTypes.INT, description='Filter by specific job'),
            OpenApiParameter('specialty', OpenApiTypes.STR, description='Filter by physician specialty'),
        ],
    ),
)
class EmployerAllApplicationsView(generics.ListAPIView):
    permission_classes = [IsEmployer]
    serializer_class = JobApplicationSerializer

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return JobApplication.objects.none()
        qs = JobApplication.objects.filter(
            job__employer=self.request.user.employer_profile
        ).select_related('job', 'job__employer', 'physician', 'physician__user').order_by('-applied_at')

        p = self.request.query_params
        search = p.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(physician__user__first_name__icontains=search) |
                Q(physician__user__last_name__icontains=search) |
                Q(physician__user__email__icontains=search)
            )
        status_filter = p.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        job_id_raw = p.get('job_id', '').strip()
        if job_id_raw:
            try:
                qs = qs.filter(job_id=int(job_id_raw))
            except (ValueError, TypeError):
                pass  # ignore non-integer job_id param
        specialty = p.get('specialty', '').strip()
        if specialty:
            qs = qs.filter(physician__specialty__iexact=specialty)
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return success_response(data=self.get_serializer(queryset, many=True).data)


@extend_schema_view(
    post=extend_schema(
        tags=['Jobs'], operation_id='job_apply',
        summary='Apply to a job (physician only) — supports multipart/form-data for resume upload',
        request=JobApplicationCreateSerializer,
        responses={201: JobApplicationSerializer},
    ),
)
class ApplyToJobView(APIView):
    permission_classes = [IsPhysician]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, pk):
        job = get_object_or_404(Job, pk=pk, is_active=True, is_approved=True)
        serializer = JobApplicationCreateSerializer(
            data=request.data,
            context={'request': request, 'job': job},
        )
        serializer.is_valid(raise_exception=True)
        application = serializer.save()
        return success_response(
            data=JobApplicationSerializer(application, context={'request': request}).data,
            message='Application submitted successfully.',
            status_code=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    get=extend_schema(tags=['Jobs'], operation_id='my_applications',
                      summary='List applications submitted by the authenticated physician',
                      responses=JobApplicationSerializer),
)
class MyApplicationsView(generics.ListAPIView):
    permission_classes = [IsPhysician]
    serializer_class = JobApplicationSerializer

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return JobApplication.objects.none()
        return JobApplication.objects.filter(
            physician=self.request.user.physician_profile
        ).select_related('job', 'job__employer', 'physician__user').order_by('-applied_at')

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return success_response(data=self.get_serializer(queryset, many=True).data)


@extend_schema_view(
    delete=extend_schema(tags=['Jobs'], operation_id='application_withdraw',
                         summary='Withdraw a job application (physician only)',
                         responses={200: OpenApiTypes.OBJECT}),
)
class WithdrawApplicationView(APIView):
    permission_classes = [IsPhysician]

    def delete(self, request, pk):
        application = get_object_or_404(
            JobApplication, pk=pk, physician=request.user.physician_profile
        )
        if application.status in ('offered',):
            return success_response(
                message='Cannot withdraw an application with an active offer. Contact the employer.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        application.delete()
        return success_response(message='Application withdrawn successfully.')


@extend_schema_view(
    post=extend_schema(tags=['Jobs'], operation_id='job_save', summary="Save a job to the physician's saved list",
                       request=None, responses={201: SavedJobSerializer}),
)
class SaveJobView(APIView):
    permission_classes = [IsPhysician]

    def post(self, request, pk):
        job = get_object_or_404(Job, pk=pk, is_active=True, is_approved=True)
        physician = request.user.physician_profile
        saved, created = SavedJob.objects.get_or_create(physician=physician, job=job)
        if not created:
            return success_response(message='Job is already saved.')
        return success_response(data=SavedJobSerializer(saved).data, message='Job saved.',
                                status_code=status.HTTP_201_CREATED)


@extend_schema_view(
    delete=extend_schema(tags=['Jobs'], operation_id='job_unsave',
                         summary="Remove a job from the physician's saved list",
                         responses={200: OpenApiTypes.OBJECT}),
)
class UnsaveJobView(APIView):
    permission_classes = [IsPhysician]

    def delete(self, request, pk):
        saved = get_object_or_404(SavedJob, job_id=pk, physician=request.user.physician_profile)
        saved.delete()
        return success_response(message='Job removed from saved list.')


@extend_schema_view(
    get=extend_schema(tags=['Jobs'], operation_id='saved_jobs',
                      summary='List saved jobs for the authenticated physician',
                      responses=SavedJobSerializer),
)
class SavedJobsListView(generics.ListAPIView):
    permission_classes = [IsPhysician]
    serializer_class = SavedJobSerializer

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return SavedJob.objects.none()
        return SavedJob.objects.filter(
            physician=self.request.user.physician_profile
        ).select_related('job', 'job__employer').order_by('-saved_at')

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return success_response(data=self.get_serializer(queryset, many=True).data)


@extend_schema_view(
    get=extend_schema(tags=['Jobs'], operation_id='employer_job_applications',
                      summary='List all applications for a specific employer job',
                      responses=JobApplicationSerializer),
)
class JobApplicationsForEmployerView(generics.ListAPIView):
    permission_classes = [IsEmployer]
    serializer_class = JobApplicationSerializer

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return JobApplication.objects.none()
        job = get_object_or_404(Job, pk=self.kwargs['pk'], employer=self.request.user.employer_profile)
        return JobApplication.objects.filter(job=job).select_related(
            'physician', 'physician__user', 'job__employer'
        ).order_by('-applied_at')

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return success_response(data=self.get_serializer(queryset, many=True).data)


@extend_schema_view(
    patch=extend_schema(
        tags=['Jobs'], operation_id='application_status_update',
        summary='Update application status and/or employer notes (employer only)',
        request={'application/json': {
            'type': 'object',
            'properties': {
                'status': {'type': 'string', 'enum': ['pending', 'reviewed', 'shortlisted', 'interview', 'offered', 'rejected']},
                'employer_notes': {'type': 'string'},
            },
        }},
        responses=JobApplicationSerializer,
    ),
)
class UpdateApplicationStatusView(APIView):
    permission_classes = [IsEmployer]
    VALID_STATUSES = [
        choice[0] for choice in JobApplication.STATUS_CHOICES
        if choice[0] not in ('withdrawn', 'accepted', 'offer_declined')
    ]
    MAX_NOTES_LENGTH = 5_000

    def patch(self, request, pk):
        application = get_object_or_404(
            JobApplication.objects.select_related('job__employer__user', 'physician__user', 'physician'), pk=pk
        )
        if application.job.employer.user != request.user:
            return success_response(message='Permission denied.', status_code=status.HTTP_403_FORBIDDEN)

        update_fields = ['updated_at']
        new_status = request.data.get('status')
        if new_status:
            if new_status not in self.VALID_STATUSES:
                return success_response(
                    message=f'Invalid status. Choose from: {", ".join(self.VALID_STATUSES)}',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            application.status = new_status
            update_fields.append('status')

        employer_notes = request.data.get('employer_notes')
        if employer_notes is not None:
            if len(str(employer_notes)) > self.MAX_NOTES_LENGTH:
                return success_response(
                    message=f'Employer notes must not exceed {self.MAX_NOTES_LENGTH} characters.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            application.employer_notes = employer_notes
            update_fields.append('employer_notes')

        application.save(update_fields=update_fields)

        if new_status and new_status in ('reviewed', 'shortlisted', 'interview', 'offered', 'rejected'):
            from emails.tasks import send_application_status_email_task
            employer_name = getattr(application.job.employer, 'company_name', '') or request.user.full_name
            send_application_status_email_task.delay(
                application.physician.user.pk,
                application.job.title,
                employer_name,
                new_status,
            )

        return success_response(
            data=JobApplicationSerializer(application, context={'request': request}).data,
            message='Application updated.',
        )


class RespondToOfferView(APIView):
    """Physician accepts or declines a job offer."""
    permission_classes = [IsPhysician]

    def post(self, request, pk):
        action = str(request.data.get('action', '')).strip()
        if action not in ('accept', 'decline'):
            return success_response(
                message='action must be "accept" or "decline".',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        application = get_object_or_404(
            JobApplication.objects.select_related(
                'job__employer__user', 'job__employer', 'physician__user'
            ),
            pk=pk,
            physician=request.user.physician_profile,
        )

        if application.status != 'offered':
            return success_response(
                message='This application does not have an active offer.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        from notifications.signals import _notify_user
        from emails.tasks import (
            send_offer_accepted_email_task,
            send_offer_accepted_confirmation_task,
            send_offer_declined_email_task,
        )

        physician_name = request.user.full_name or request.user.email
        employer_user = application.job.employer.user
        employer_name = getattr(application.job.employer, 'company_name', '') or employer_user.full_name
        job_title = application.job.title

        with transaction.atomic():
            if action == 'accept':
                application.status = 'accepted'
                application.save(update_fields=['status', 'updated_at'])

                _notify_user(
                    employer_user,
                    'employer_offer_accepted',
                    f'Offer accepted — {job_title}',
                    f'{physician_name} accepted your offer for "{job_title}". If the position is filled, close the job posting from your dashboard.',
                    link=f'/dashboard/employer?tab=applications',
                )
                send_offer_accepted_email_task.delay(employer_user.pk, physician_name, job_title)
                send_offer_accepted_confirmation_task.delay(request.user.pk, job_title, employer_name)
                response_message = 'Congratulations! You have accepted the offer.'

            else:  # decline
                application.status = 'offer_declined'
                application.save(update_fields=['status', 'updated_at'])

                _notify_user(
                    employer_user,
                    'employer_offer_declined',
                    f'Offer declined — {job_title}',
                    f'{physician_name} has declined your offer for "{job_title}". The job remains active.',
                    link=f'/dashboard/employer?tab=applications',
                )
                send_offer_declined_email_task.delay(employer_user.pk, physician_name, job_title)
                response_message = 'You have declined the offer.'

        return success_response(
            data=JobApplicationSerializer(application, context={'request': request}).data,
            message=response_message,
        )


class SendApplicationEmailView(APIView):
    permission_classes = [IsEmployer]
    MAX_SUBJECT_LENGTH = 200
    MAX_MESSAGE_LENGTH = 5_000

    def post(self, request, pk):
        from emails.tasks import send_employer_custom_email_task
        application = get_object_or_404(
            JobApplication.objects.select_related('job__employer__user', 'physician__user', 'job__employer'),
            pk=pk,
        )
        if application.job.employer.user != request.user:
            return success_response(message='Permission denied.', status_code=status.HTTP_403_FORBIDDEN)

        subject = str(request.data.get('subject', '')).strip()
        message = str(request.data.get('message', '')).strip()

        if not subject or not message:
            return success_response(
                message='Both subject and message are required.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if len(subject) > self.MAX_SUBJECT_LENGTH or len(message) > self.MAX_MESSAGE_LENGTH:
            return success_response(
                message='Subject or message is too long.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        employer_name = getattr(application.job.employer, 'company_name', '') or request.user.full_name
        send_employer_custom_email_task.delay(
            application.physician.user.pk,
            employer_name,
            application.job.title,
            subject,
            message,
        )
        return success_response(message='Email queued and will be delivered shortly.')


@extend_schema_view(
    get=extend_schema(tags=['Jobs'], operation_id='specialties_list',
                      summary='List all specialty choices', responses={200: OpenApiTypes.OBJECT}),
)
class SpecialtiesListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return success_response(data=[{'value': v, 'label': l} for v, l in SPECIALTY_CHOICES])


@extend_schema_view(
    get=extend_schema(tags=['Jobs'], operation_id='sub_specialties_list',
                      summary='List all sub-specialty choices', responses={200: OpenApiTypes.OBJECT}),
)
class SubSpecialtiesListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return success_response(data=[{'value': v, 'label': l} for v, l in SUB_SPECIALTY_CHOICES])


@extend_schema_view(
    get=extend_schema(tags=['Jobs'], operation_id='provinces_list',
                      summary='List all Canadian province choices', responses={200: OpenApiTypes.OBJECT}),
)
class ProvincesListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return success_response(data=[{'value': v, 'label': l} for v, l in PROVINCE_CHOICES])


@extend_schema_view(
    get=extend_schema(tags=['Jobs'], operation_id='practice_settings_list',
                      summary='List all practice setting choices', responses={200: OpenApiTypes.OBJECT}),
)
class PracticeSettingsListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return success_response(data=[{'value': v, 'label': l} for v, l in PRACTICE_SETTING_CHOICES])


@extend_schema_view(
    get=extend_schema(tags=['Jobs'], operation_id='featured_recruiters',
                      summary='List featured recruiters/employers for the homepage',
                      responses={200: OpenApiTypes.OBJECT}),
)
class FeaturedRecruitersView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        active_jobs_q = Q(jobs__is_approved=True, jobs__is_active=True)
        recruiters = (
            EmployerProfile.objects
            .filter(active_jobs_q)
            .distinct()
            .annotate(active_jobs_count=Count('jobs', filter=active_jobs_q))
            .order_by('company_name')[:12]
        )
        data = [
            {
                'id': emp.id,
                'company_name': emp.company_name,
                'company_type': emp.company_type,
                'website': emp.website,
                'country': emp.country,
                'active_jobs_count': emp.active_jobs_count,
            }
            for emp in recruiters
        ]
        return success_response(data=data)


@extend_schema_view(
    get=extend_schema(
        tags=['Jobs'], operation_id='job_pdf_download',
        summary='Download a job posting as a professionally formatted PDF',
        responses={200: OpenApiTypes.BINARY},
    ),
)
class JobPDFView(APIView):
    permission_classes = [IsAuthenticated]

    # Brand colors
    NAVY = colors.HexColor('#0A1628')
    TEAL = colors.HexColor('#00D4AA')
    LIGHT_GRAY = colors.HexColor('#F5F5F5')
    MID_GRAY = colors.HexColor('#888888')
    DARK_GRAY = colors.HexColor('#444444')

    def get(self, request, pk):
        job = get_object_or_404(Job, pk=pk, is_approved=True, is_active=True)
        pdf_buffer = self._build_pdf(job)

        safe_title = ''.join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in job.title)
        filename = f'CandianMdJobs_{safe_title}_{job.id}.pdf'

        response = HttpResponse(pdf_buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Access-Control-Expose-Headers'] = 'Content-Disposition'
        return response

    def _build_pdf(self, job):
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )

        styles = getSampleStyleSheet()
        story = []

        # ---- Header ----
        header_style = ParagraphStyle(
            'Header',
            parent=styles['Normal'],
            fontSize=18,
            textColor=self.NAVY,
            fontName='Helvetica-Bold',
            alignment=TA_LEFT,
        )
        date_style = ParagraphStyle(
            'DateStyle',
            parent=styles['Normal'],
            fontSize=9,
            textColor=self.MID_GRAY,
            alignment=TA_RIGHT,
        )
        gen_date = dt.date.today().strftime('%B %d, %Y')
        header_table = Table(
            [[Paragraph('CandianMdJobs', header_style), Paragraph(f'Generated: {gen_date}', date_style)]],
            colWidths=['70%', '30%'],
        )
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 0.1 * inch))

        # Teal accent divider
        story.append(HRFlowable(width='100%', thickness=3, color=self.TEAL, spaceAfter=0.15 * inch))

        # ---- Job title ----
        title_style = ParagraphStyle(
            'JobTitle',
            parent=styles['Normal'],
            fontSize=22,
            textColor=self.NAVY,
            fontName='Helvetica-Bold',
            spaceAfter=4,
        )
        story.append(Paragraph(job.title, title_style))

        # Employer + location
        meta_style = ParagraphStyle(
            'Meta',
            parent=styles['Normal'],
            fontSize=11,
            textColor=self.DARK_GRAY,
            spaceAfter=2,
        )
        employer_name = getattr(job.employer, 'company_name', '') if job.employer else ''
        location_parts = [p for p in [getattr(job, 'city', ''), getattr(job, 'province', '')] if p]
        location_str = ', '.join(location_parts) or getattr(job, 'location_display', '')
        if employer_name:
            story.append(Paragraph(f'<b>{employer_name}</b>', meta_style))
        if location_str:
            story.append(Paragraph(f'Location: {location_str}', meta_style))
        story.append(Spacer(1, 0.15 * inch))

        # ---- Badges table ----
        badge_label_style = ParagraphStyle(
            'BadgeLabel', parent=styles['Normal'], fontSize=8,
            textColor=self.MID_GRAY, fontName='Helvetica-Bold',
        )
        badge_value_style = ParagraphStyle(
            'BadgeValue', parent=styles['Normal'], fontSize=10,
            textColor=self.NAVY, fontName='Helvetica-Bold',
        )

        def _badge_cell(label, value):
            return [Paragraph(label, badge_label_style), Paragraph(value or 'N/A', badge_value_style)]

        job_type_display = (job.job_type or '').replace('_', ' ').title()
        specialty_display = (getattr(job, 'specialty', '') or '').replace('_', ' ').title()
        setting_display = (getattr(job, 'practice_setting', '') or '').replace('_', ' ').title()
        comp_display = getattr(job, 'compensation_display', '') or getattr(job, 'compensation', '') or 'See description'

        badge_data = [[
            _badge_cell('JOB TYPE', job_type_display),
            _badge_cell('SPECIALTY', specialty_display),
            _badge_cell('SETTING', setting_display),
            _badge_cell('COMPENSATION', comp_display),
        ]]
        badge_table = Table(badge_data, colWidths=['25%', '25%', '25%', '25%'])
        badge_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), self.LIGHT_GRAY),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(badge_table)
        story.append(Spacer(1, 0.2 * inch))

        # ---- Sections ----
        section_title_style = ParagraphStyle(
            'SectionTitle', parent=styles['Normal'],
            fontSize=13, textColor=self.NAVY,
            fontName='Helvetica-Bold', spaceBefore=10, spaceAfter=4,
        )
        body_style = ParagraphStyle(
            'Body', parent=styles['Normal'],
            fontSize=10, textColor=self.DARK_GRAY,
            leading=15, spaceAfter=6,
        )

        def _add_section(title, text):
            if not text:
                return
            story.append(Paragraph(title, section_title_style))
            story.append(HRFlowable(width='100%', thickness=0.5, color=self.TEAL, spaceAfter=6))
            clean_text = (text or '').replace('\r\n', '<br/>').replace('\n', '<br/>')
            story.append(Paragraph(clean_text, body_style))

        _add_section('Position Overview', getattr(job, 'description', '') or '')
        _add_section('Requirements & Qualifications', getattr(job, 'requirements', '') or '')
        _add_section('Compensation & Benefits', getattr(job, 'benefits', '') or comp_display)
        _add_section('How to Apply', getattr(job, 'how_to_apply', '') or (
            f'Please apply through CandianMdJobs. '
            f'Contact {employer_name} for more information.' if employer_name else
            'Please apply through CandianMdJobs.'
        ))

        # ---- Footer ----
        story.append(Spacer(1, 0.3 * inch))
        story.append(HRFlowable(width='100%', thickness=0.5, color=self.LIGHT_GRAY, spaceAfter=6))
        footer_style = ParagraphStyle(
            'Footer', parent=styles['Normal'],
            fontSize=8, textColor=self.MID_GRAY, alignment=TA_CENTER,
        )
        story.append(Paragraph(
            'This document was generated by CandianMdJobs — connecting physicians with healthcare employers across Canada. '
            'Visit us at candianmdjobs.ca for more opportunities.',
            footer_style,
        ))

        doc.build(story)
        return buffer
