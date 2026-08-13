from django.db import models


class ContactSubmission(models.Model):
    STATUS_CHOICES = [
        ('new', 'New'),
        ('read', 'Read'),
        ('replied', 'Replied'),
    ]

    full_name = models.CharField(max_length=255)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    subject = models.CharField(max_length=255)
    message = models.TextField()
    submitted_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='new')
    # Predates `status` and still backs the dashboard's unread count, the
    # Django-admin filter and the CSV export, so it stays a real column and is
    # kept in step by save() rather than being set by hand anywhere.
    is_responded = models.BooleanField(default=False)

    class Meta:
        ordering = ['-submitted_at']

    def save(self, *args, **kwargs):
        self.is_responded = self.status == 'replied'
        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            kwargs['update_fields'] = set(update_fields) | {'is_responded'}
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.full_name} — {self.subject}'
