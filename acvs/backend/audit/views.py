"""ActivityLog read endpoint (admin-only).

GET /api/audit/ — list view, filterable by institution, action, actor,
certificate, and a date range. All filters are AND-combined. Unknown
filter values yield an empty page rather than a 400 (same convention
as the certificate list's `?status=` filter).

The endpoint is read-only. There is no way to write ActivityLog rows
through the API — they are written only by `audit.services.log_action()`
at the action points. There is no PATCH/DELETE on this resource.
"""

from __future__ import annotations

from datetime import datetime

from django.db.models import Q
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView

from accounts.permissions import MustChangePasswordAllowed



from rest_framework.permissions import IsAuthenticated



from .models import ActivityLog
from .serializers import ActivityLogReadSerializer



# Status choices forwarded to the frontend as-is. We don't reject
# unknown values at the view layer — `?action=foo` just returns an
# empty page, same as the certificate list's `?status=` filter.
_VALID_ACTIONS = {choice for choice, _label in ActivityLog.Action.choices}


def _parse_iso(value: str, field: str) -> datetime:
    """Parse a YYYY-MM-DD (or full ISO 8601) date string. Raises
    ValidationError on parse failure so the API returns 400 with a
    field-keyed detail, not a 500 from an unhandled ValueError.
    """
    try:
        # fromisoformat accepts both `YYYY-MM-DD` and `YYYY-MM-DDTHH:MM:SS[.ffffff][+HH:MM]`
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError({field: f"Invalid ISO 8601 datetime: {value!r}"})


class ActivityLogListView(ListAPIView):
    """GET /api/audit/

    Query params (all optional, all AND-combined):
      * ?institution=<id>      filter by institution FK
      * ?action=<choice>       filter by action choice
      * ?actor=<id>            filter by actor
      * ?certificate=<cert_id> filter by certificate (the public id, not the pk)
      * ?since=<iso8601>       inclusive lower bound on created_at
      * ?until=<iso8601>       inclusive upper bound on created_at

    Pagination: project default (CertificatePageNumberPagination, 25/page).
    Default ordering: `-created_at` (newest first).
    """

    serializer_class = ActivityLogReadSerializer
    permission_classes = [IsAuthenticated, MustChangePasswordAllowed]

    def get_queryset(self):
        qs = ActivityLog.objects.select_related("actor", "institution", "certificate")
        params = self.request.query_params

        if (institution_id := params.get("institution")):
            qs = qs.filter(institution_id=institution_id)
        if (action := params.get("action")):
            # Note: we don't reject unknown actions — `?action=foo` returns
            # empty. The convention here matches the certificate list's
            # `?status=` filter.
            if action in _VALID_ACTIONS:
                qs = qs.filter(action=action)
            else:
                qs = qs.none()
        if (actor_id := params.get("actor")):
            qs = qs.filter(actor_id=actor_id)
        if (cert_id := params.get("certificate")):
           
            qs = qs.filter(certificate__certificate_id__icontains=cert_id)
        if (since := params.get("since")):
            qs = qs.filter(created_at__gte=_parse_iso(since, "since"))
        if (until := params.get("until")):
            qs = qs.filter(created_at__lte=_parse_iso(until, "until"))

        return qs.order_by("-created_at")
