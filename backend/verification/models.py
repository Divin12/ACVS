"""Employer / verification-attempt log.

Per CLAUDE.md, an Employer is NOT a login-holding account — verification is
public and anonymous. This table logs verification attempts so admins can
audit who is checking which certificates. The public verify endpoint writes
exactly one row per call.
"""

from __future__ import annotations

from django.db import models

from certificates.models import Certificate


class Employer(models.Model):
    class Result(models.TextChoices):
        VALID = "valid", "Valid"
        DISABLED = "disabled", "Disabled"
        NOT_FOUND = "not_found", "Not Found"

    organization_name = models.CharField(max_length=255, blank=True, default="")
    certificate = models.ForeignKey(
        Certificate,
        on_delete=models.SET_NULL,    # log rows must survive cert cleanup
        null=True,
        blank=True,
        related_name="verification_attempts",
    )
    verified_at = models.DateTimeField(auto_now_add=True)
    result = models.CharField(max_length=16, choices=Result.choices)

    class Meta:
        ordering = ["-verified_at"]
        indexes = [models.Index(fields=["certificate", "result"])]

    def __str__(self) -> str:
        return f"{self.verified_at:%Y-%m-%d %H:%M} {self.result} {self.certificate_id or '-'}"
