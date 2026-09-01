"""ActivityLog — authenticated-action audit trail.

One row per meaningful event, written from `audit.services.log_action()`
at the four existing action points (BulkCreateView, CertificateDetailView
PATCH, AnchorCertificateView, DisableCertificateView) plus the future
institution-status and staff-invite endpoints (§2 and §4).

Schema notes:
  * `actor` is on_delete=PROTECT so deleting a user never erases the
    trail of what they did. The User model already uses PROTECT for
    the same reason on the institution FK.
  * `institution` and `certificate` are nullable by design. An
    institution-level action (approve, suspend) carries no certificate;
    a future Ministry-level action would carry neither. No GenericFK
    is needed — the schema is fixed and small.
  * `detail` is free-text. Different actions carry different shapes
    (a disable has a reason, an anchor has tx_hash, a bulk-registration
    has a cohort size). A per-action schema table would be premature
    and would not survive the next action choice.
  * Indexes target the read patterns in `audit.views.ActivityLogListView`:
    filter by institution, by actor, by action — all ordered by created_at
    descending. The single-column `-created_at` index covers the
    unfiltered list.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models


class ActivityLog(models.Model):
    class Action(models.TextChoices):
        # Certificate-level actions (per-record, except CERT_REGISTERED
        # which is per-cohort — see BulkCreateView hook).
        CERT_REGISTERED = "cert_registered", "Certificate registered"
        CERT_EDITED = "cert_edited", "Certificate edited"
        CERT_ANCHORED = "cert_anchored", "Certificate anchored"
        CERT_DISABLED = "cert_disabled", "Certificate disabled"
        # Institution-level actions. Currently only triggered by the
        # institution-status endpoint (§2).
        INSTITUTION_APPROVED = "institution_approved", "Institution approved"
        INSTITUTION_SUSPENDED = "institution_suspended", "Institution suspended"
        # Staff management (§4). Per-cohort semantics if/when bulk staff
        # invites are added later.
        STAFF_INVITED = "staff_invited", "Staff invited"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="activity_log_entries",
    )
    institution = models.ForeignKey(
        "institutions.Institution",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="activity_log_entries",
    )
    certificate = models.ForeignKey(
        "certificates.Certificate",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="activity_log_entries",
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    detail = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["institution", "-created_at"]),
            models.Index(fields=["actor", "-created_at"]),
            models.Index(fields=["action", "-created_at"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.action} actor={self.actor_id}"
