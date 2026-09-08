"""Institution serializers — exposed only by admin-scoped endpoints.

* InstitutionReadSerializer — list/detail output. Includes the four
  fields the admin list endpoint needs: name, status, contact_email,
  created_at. No nested relationships (registered users / certs) —
  those are separate admin concerns, not in scope here.
* InstitutionStatusUpdateSerializer — input shape for the status
  transition endpoint. Validates status is one of the allowed-new
  values (active or suspended); the view layer validates the
  *transition* (the source-status constraint).
"""

from __future__ import annotations

from rest_framework import serializers

from .models import Institution


class InstitutionReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Institution
        fields = (
            "id",
            "name",
            "status",
            "contact_email",
            "created_at",
        )
        read_only_fields = fields


class InstitutionStatusUpdateSerializer(serializers.Serializer):
    """Body for the POST /api/institutions/<id>/status/ endpoint.

    `status` is the new value. The view checks the *transition*:
    pending → active, pending → suspended, active → suspended,
    suspended → active. Anything else (e.g. active → pending,
    active → active on a re-POST) returns 400.

    Not a ModelSerializer because we explicitly want to reject the
    "no change" case at the serializer layer as well — a no-op POST
    is a registrar/admin bug, not a legitimate operation.
    """

    # Re-using Institution.Status.choices gives the frontend an
    # authoritative list of legal values without duplicating the
    # choices in two places.
    STATUS_CHOICES = [
        (Institution.Status.ACTIVE, "Active"),
        (Institution.Status.SUSPENDED, "Suspended"),
    ]

    status = serializers.ChoiceField(choices=STATUS_CHOICES)










