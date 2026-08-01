from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0001_initial"),
    ]

    operations = [
        # Add new notification type choices (employer offer + enterprise + custom plan)
        migrations.AlterField(
            model_name="notification",
            name="notification_type",
            field=models.CharField(
                choices=[
                    ("admin_job", "New Job Submitted"),
                    ("admin_physician", "New Physician Registered"),
                    ("admin_employer", "New Employer Registered"),
                    ("admin_assessment", "New Assessment Submitted"),
                    ("admin_contact", "New Contact Message"),
                    ("employer_application", "New Job Application"),
                    ("employer_job_approved", "Job Approved"),
                    ("employer_job_rejected", "Job Rejected"),
                    ("employer_offer_accepted", "Offer Accepted"),
                    ("employer_offer_declined", "Offer Declined"),
                    ("employer_custom_plan_payment", "Custom Plan Payment Link Ready"),
                    ("employer_custom_plan_active", "Custom Plan Activated"),
                    ("physician_app_status", "Application Status Changed"),
                    ("physician_assessment_status", "Assessment Status Updated"),
                    ("admin_enterprise_request", "New Enterprise Plan Request"),
                ],
                max_length=40,
            ),
        ),
        # Add query-optimized indexes
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(
                fields=["user", "is_read"], name="notif_user_read_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(
                fields=["user", "-created_at"], name="notif_user_created_idx"
            ),
        ),
    ]
