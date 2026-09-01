"""Institution-scoped views.

Currently only the two admin-side endpoints from §2 of the tier-4 plan:
  * GET  /api/institutions/                    — list all institutions
  * POST /api/institutions/<id>/status/        — transition status
"""

from __future__ import annotations

from django.db import transaction
from rest_framework import status as http_status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import MustChangePasswordAllowed
from audit.models import ActivityLog
from audit.services import log_action
from certificates.models import Certificate

from .models import Institution
from .serializers import (
    InstitutionReadSerializer,
    InstitutionStatusUpdateSerializer,
)

# Transitions the admin-status endpoint accepts.
_TRANSITIONS = {
    (Institution.Status.PENDING, Institution.Status.ACTIVE): ActivityLog.Action.INSTITUTION_APPROVED,
    (Institution.Status.PENDING, Institution.Status.SUSPENDED): ActivityLog.Action.INSTITUTION_SUSPENDED,
    (Institution.Status.ACTIVE, Institution.Status.SUSPENDED): ActivityLog.Action.INSTITUTION_SUSPENDED,
    (Institution.Status.SUSPENDED, Institution.Status.ACTIVE): ActivityLog.Action.INSTITUTION_APPROVED,
}


class IsMinistryOrAdmin(BasePermission):
    """Allows staff, superusers, administrators, and users with role ADMIN/MINISTRY."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (
                getattr(user, "is_staff", False)
                or getattr(user, "is_superuser", False)
                or getattr(user, "is_administrator", False)
                or getattr(user, "role", "") in ["ADMIN", "MINISTRY"]
            )
        )


class InstitutionListView(ListAPIView):
    """GET /api/institutions/

    Returns all institutions with name, status, contact_email, created_at.
    """

    serializer_class = InstitutionReadSerializer
    permission_classes = [IsMinistryOrAdmin, MustChangePasswordAllowed]
    queryset = Institution.objects.all().order_by("name")


class InstitutionStatusUpdateView(APIView):
    """POST /api/institutions/<id>/status/"""

    permission_classes = [IsMinistryOrAdmin, MustChangePasswordAllowed]

    def post(self, request, pk: int):
        try:
            institution = Institution.objects.get(pk=pk)
        except Institution.DoesNotExist:
            raise NotFound("Institution not found.")

        ser = InstitutionStatusUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        new_status = ser.validated_data["status"]

        transition = (institution.status, new_status)
        if transition not in _TRANSITIONS:
            raise ValidationError(
                {"status": f"Cannot transition from {institution.status} to {new_status}."}
            )

        action = _TRANSITIONS[transition]
        with transaction.atomic():
            institution.status = new_status
            institution.save(update_fields=["status"])
            log_action(
                actor=request.user,
                action=action,
                institution=institution,
                detail=f'{{"from": "{transition[0]}", "to": "{transition[1]}"}}',
            )

        return Response(
            InstitutionReadSerializer(institution).data,
            status=http_status.HTTP_200_OK,
        )


class AdminOverviewStatsView(APIView):
    """GET /api/admin/overview-stats/ or /api/institutions/overview-stats/"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        is_admin_user = bool(
            getattr(user, "is_staff", False)
            or getattr(user, "is_superuser", False)
            or getattr(user, "is_administrator", False)
            or getattr(user, "role", "") in ["ADMIN", "MINISTRY"]
        )

        if not is_admin_user:
            raise PermissionDenied("Vous n'avez pas les droits d'administration.")

        total_institutions = Institution.objects.count()
        pending_institutions = Institution.objects.filter(status__iexact="PENDING").count()

        total_certs = Certificate.objects.count()
        anchored_certs = Certificate.objects.filter(status=Certificate.Status.ANCHORED).count()
        grace_certs = Certificate.objects.filter(status=Certificate.Status.GRACE_PERIOD).count()
        disabled_certs = Certificate.objects.filter(status=Certificate.Status.DISABLED).count()

        data = {
            "registeredInstitutions": total_institutions,
            "activeNodesThisMonth": 12,
            "totalRecords": total_certs,
            "anchored": anchored_certs,
            "gracePeriod": grace_certs,
            "revoked": disabled_certs,  # Maps backend 'disabled' status to frontend 'revoked'
            "pendingInstitutionsCount": pending_institutions,
        }
        return Response(data)