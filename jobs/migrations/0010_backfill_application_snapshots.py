from django.db import migrations


def fill_snapshots(apps, schema_editor):
    """Give applications made before this release the same snapshot new ones get.

    Without it every existing application would show a blank title the moment
    its job was archived or removed — the exact gap the snapshot exists to
    close, left open for precisely the rows that predate it.
    """
    JobApplication = apps.get_model('jobs', 'JobApplication')

    rows = JobApplication.objects.filter(
        job__isnull=False, job_title_snapshot='',
    ).select_related('job', 'job__employer')

    updated = []
    for application in rows.iterator(chunk_size=500):
        application.job_title_snapshot = application.job.title
        application.job_location_snapshot = application.job.location_display
        application.employer_name_snapshot = application.job.employer.company_name
        updated.append(application)
        if len(updated) >= 500:
            JobApplication.objects.bulk_update(updated, [
                'job_title_snapshot', 'job_location_snapshot', 'employer_name_snapshot',
            ])
            updated = []

    if updated:
        JobApplication.objects.bulk_update(updated, [
            'job_title_snapshot', 'job_location_snapshot', 'employer_name_snapshot',
        ])


def fill_jobs_posted_count(apps, schema_editor):
    """Seed the lifetime post counter from the jobs each employer already has.

    It undercounts anyone who has deleted a job in the past — those are gone
    and cannot be recovered. Undercounting is the right way to be wrong here:
    it hands an existing employer a spare post rather than locking them out of
    an allowance they had already been using.
    """
    EmployerProfile = apps.get_model('accounts', 'EmployerProfile')
    Job = apps.get_model('jobs', 'Job')
    from django.db.models import Count

    counts = (
        Job.objects.values('employer_id')
        .annotate(total=Count('id'))
        .order_by()
    )
    for row in counts:
        EmployerProfile.objects.filter(pk=row['employer_id']).update(
            jobs_posted_count=row['total']
        )


def noop(apps, schema_editor):
    """Reversing leaves the data in place — the columns go away with the
    schema migration, and nothing here is worth undoing on its own."""


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0009_job_archived_at_and_more'),
        ('accounts', '0005_employerprofile_jobs_posted_count'),
    ]

    operations = [
        migrations.RunPython(fill_snapshots, noop),
        migrations.RunPython(fill_jobs_posted_count, noop),
    ]
