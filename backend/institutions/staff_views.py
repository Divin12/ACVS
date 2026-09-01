"""Staff list + invite endpoints (option a — §4).

* GET  /api/institutions/<id>/staff/         — list the institution's users
* POST /api/institutions/<id>/staff/invite/ — invite a new registrar

Both endpoints are scoped: the request user MUST belong to the
target institution. A registrar at institution X cannot see or invite
for institution Y, and an admin (role=admin, institution=None) cannot
either — staff management is per-institution self-service, not a
Ministry power. (Option a per the tier-4 plan; ministry oversight at
this layer was rejected.)

The invite creates a User with `role=registrar`, `institution=<id>`,
a randomly generated password, and writes an ActivityLog row with
action=STAFF_INVITED. No email is sent — the inviting registrar is
expected to communicate the password out-of-band. SMTP is out of
scope for this PR.
"""

from __future__ import annotations

import secrets
import string

from django.db import IntegrityError, transaction
from rest_framework import status as http_status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import MustChangePasswordAllowed
from audit.models import ActivityLog
from audit.services import log_action

from .models import Institution


# --- Permission helpers ----------------------------------------------------

def _require_same_institution(request, institution_id: int) -> Institution:
    """Return the institution if the request user belongs to it.

    Raises NotFound for an unknown id, PermissionDenied for a
    cross-institution request. Used by both StaffListView and
    StaffInviteView — the access control is the same shape.

    Note: an admin (role=admin, institution=None) is NOT allowed
    here. Staff management is institution self-service by design
    (option a in the tier-4 plan). If a future change wants to
    extend Ministry oversight to staff management, this is the
    single point that would need to bend.
    """
    try:
        institution = Institution.objects.get(pk=institution_id)
    except Institution.DoesNotExist:
        raise NotFound("Institution not found.")

    request_user_institution_id = getattr(request.user, "institution_id", None)
    if request_user_institution_id != institution.id:
        raise PermissionDenied("You do not have access to this institution's staff.")
    return institution


# --- 1. List endpoint ------------------------------------------------------

class StaffListView(ListAPIView):
    """GET /api/institutions/<id>/staff/

    Returns the institution's users: id, email, role, last_login_at.
    Scoped to the request user's institution.
    """

    permission_classes = [IsAuthenticated, MustChangePasswordAllowed]

    def get_queryset(self):
        institution = _require_same_institution(self.request, self.kwargs["institution_id"])
        return (
            User.objects
            .filter(institution=institution)
            .order_by("email")
        )

    def list(self, request, *args, **kwargs):
        """Override list() so we can return a hand-rolled payload instead
        of relying on a ModelSerializer. The shape is small (4 fields
        per user), and not enough of it lives on the model to justify
        a serializer module just for this one endpoint.
        """
        qs = self.get_queryset()
        results = [
            {
                "id": u.id,
                "email": u.email,
                "role": u.role,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            }
            for u in qs
        ]
        return Response({"results": results})


# --- 2. Invite endpoint ----------------------------------------------------

def _generate_random_password() -> str:
    """Generate a 16-char password that satisfies the project's
    password validators (12+ chars, uppercase, number, special char).

    Returns a fresh password each call. The password is returned
    ONCE in the response body so the inviting registrar can
    communicate it to the new staff member out-of-band. There is
    no email-send path — SMTP is out of scope for this PR.
    """
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_=+[]{}"
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(16))
        if (
            any(c.isupper() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(c in "!@#$%^&*()-_=+[]{}" for c in pwd)
        ):
            return pwd


class StaffInviteView(APIView):
    """POST /api/institutions/<id>/staff/invite/

    Body: {"email": "<new user's email>"}

    Creates a new User with role=registrar, institution=<id>,
    is_active=True, a fresh random password. Returns 201 with
    {id, email, role, institution: {id, name}, initial_password}
    where initial_password is shown ONCE — the inviting registrar
    is responsible for delivering it.

    The endpoint is scoped to the request user's institution.
    Reject conditions:
      * email already in use (anywhere in the system — emails are
        globally unique per the User model)
      * email missing or not a string
    """

    permission_classes = [IsAuthenticated, MustChangePasswordAllowed]

    def post(self, request, institution_id: int):
        institution = _require_same_institution(request, institution_id)

        email = request.data.get("email")
        if not isinstance(email, str) or not email.strip():
            raise ValidationError({"email": "Email is required and must be a non-empty string."})
        email = email.strip().lower()

        password = _generate_random_password()

        with transaction.atomic():
            try:
                user = User.objects.create_user(
                    email=email,
                    password=password,
                    role=User.Role.REGISTRAR,
                    institution=institution,
                )
            except IntegrityError:
                # Email is unique on the User model — a duplicate
                # raises IntegrityError. Surface as a 400 with a
                # field-keyed error, not a 500.
                raise ValidationError({"email": "A user with this email already exists."})

            # Force a password change on the new user's first login.
            # The OTP-verify endpoint reads this flag and the
            # frontend routes the user to /institution/set-password
            # before granting dashboard access. The flag is cleared
            # by the password-change endpoint after the user sets a
            # new password. We also clear the last_login_at so the
            # staff-list endpoint doesn't show a misleading "last
            # seen" timestamp for a user who has never actually
            # authenticated.
            user.must_change_password = True
            user.last_login_at = None
            user.save(update_fields=["must_change_password", "last_login_at"])

            log_action(
                actor=request.user,
                action=ActivityLog.Action.STAFF_INVITED,
                institution=institution,
                detail=f'{{"invited_email": "{email}"}}',
            )

        return Response(
            {
                "id": user.id,
                "email": user.email,
                "role": user.role,
                "institution": {"id": institution.id, "name": institution.name},
                # Surfaced once. The inviting registrar must
                # communicate this out-of-band; there is no recovery
                # path (a password reset would require the email
                # channel we don't have).
                "initial_password": password,
            },
            status=http_status.HTTP_201_CREATED,
        )
