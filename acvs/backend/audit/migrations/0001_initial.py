"""Initial migration for audit.ActivityLog.

Generated to match audit/models.py:ActivityLog exactly. If the model
changes, regenerate via `python manage.py makemigrations audit` rather
than editing this file by hand.
"""

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("certificates", "__first__"),
        ("institutions", "__first__"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ActivityLog",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("action", models.CharField(choices=[("cert_registered", "Certificate registered"), ("cert_edited", "Certificate edited"), ("cert_anchored", "Certificate anchored"), ("cert_disabled", "Certificate disabled"), ("institution_approved", "Institution approved"), ("institution_suspended", "Institution suspended"), ("staff_invited", "Staff invited")], max_length=32)),
                ("detail", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        on_delete=models.PROTECT,
                        related_name="activity_log_entries",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "certificate",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.PROTECT,
                        related_name="activity_log_entries",
                        to="certificates.certificate",
                    ),
                ),
                (
                    "institution",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.PROTECT,
                        related_name="activity_log_entries",
                        to="institutions.institution",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(
                        fields=["institution", "-created_at"],
                        name="audit_activ_institu_a3f9c2_idx",
                    ),
                    models.Index(
                        fields=["actor", "-created_at"],
                        name="audit_activ_actor_i_e0b8d1_idx",
                    ),
                    models.Index(
                        fields=["action", "-created_at"],
                        name="audit_activ_action_4c7a6e_idx",
                    ),
                    models.Index(
                        fields=["-created_at"],
                        name="audit_activ_created_d2b5f8_idx",
                    ),
                ],
            },
        ),
    ]
