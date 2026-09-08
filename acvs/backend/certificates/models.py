from __future__ import annotations

from django.db import models

from institutions.models import Institution
from students.models import Student


class Certificate(models.Model):
    class Status(models.TextChoices):
        GRACE_PERIOD = "grace_period", "Grace Period"
        ANCHORED = "anchored", "Anchored"
        DISABLED = "disabled", "Disabled"

    # Changed: Increased max_length to 100 to support various official serial number formats 
    # (e.g., "DRC-2026-UNIKIN-008942"). This field stores the institution-provided serial number.
    certificate_id = models.CharField(
        max_length=100, 
        unique=True, 
        db_index=True,
        help_text="Official certificate serial number entered by the institution"
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.PROTECT,
        related_name="certificates",
    )
    institution = models.ForeignKey(
        Institution,
        on_delete=models.PROTECT,
        related_name="certificates",
    )
    cohort_number = models.PositiveIntegerField()
    degree = models.CharField(max_length=128)
    program = models.CharField(max_length=128)
    issued_date = models.DateField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.GRACE_PERIOD,
    )
    chain_hash = models.CharField(max_length=64, blank=True, default="")
    tx_hash = models.CharField(max_length=66, blank=True, default="")
    disabled_at = models.DateTimeField(null=True, blank=True)
    disabled_reason = models.CharField(max_length=512, blank=True, default="")
    created_at = models.DateTimeField(auto_auto_add=True) if hasattr(models.DateTimeField, 'auto_auto_add') else models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-issued_date", "certificate_id"]
        indexes = [
            models.Index(fields=["institution", "status"]),
            models.Index(fields=["institution", "cohort_number"]),
        ]

    def is_editable(self) -> bool:
        return self.status == self.Status.GRACE_PERIOD

    def __str__(self) -> str:
        return self.certificate_id