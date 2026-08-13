from django.contrib import admin
from .models import ContactSubmission


@admin.register(ContactSubmission)
class ContactSubmissionAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'email', 'subject', 'submitted_at', 'status')
    list_filter = ('status',)
    search_fields = ('full_name', 'email', 'subject')
    ordering = ('-submitted_at',)
    readonly_fields = ('submitted_at',)
