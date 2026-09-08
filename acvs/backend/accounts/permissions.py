"""Permission classes for accounts.

`MustChangePasswordAllowed` rejects any authenticated request from a user
whose `must_change_password` flag is still True. It is composed alongside
the existing IsAuthenticated / IsRegistrar / IsAdmin classes on every
view that should be unreachable to a freshly-invited user.

The two views it must NOT be composed with:
  * `MeView`           — `/api/auth/me/` — so the frontend can read the
                         flag and route the user to the change page.
  * `PasswordChangeView` — `/api/auth/password-change/` — so the user can
                         actually clear the flag.

The 403 response shape mirrors the `institution_pending` envelope used
elsewhere in this codebase (DRF raises PermissionDenied with a dict
detail, which the api wrapper renders as `{error, details: {detail: [...]}}`
— `code: "must_change_password"` is the machine-readable signal the
frontend branches on, matching the existing convention).
"""

from __future__ import annotations

from rest_framework.permissions import BasePermission


class MustChangePasswordAllowed(BasePermission):
    """Reject the request if the authenticated user must change their password.

    On reject, sets `message` so DRF wraps the response as
    `{detail: {"code": "must_change_password", "message": "..."}}`,
    which the frontend's asJson-like wrapper renders with the code
    visible to the error parser. The frontend branches on the code
    and routes the user to /institution/set-password — the same
    redirect pattern used for institution_pending logins.
    """

    message = {"code": "must_change_password", "message": "You must change your password before accessing this resource."}

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            # Let IsAuthenticated (or AllowAny) handle the unauth case.
            # Returning True here means "I have no opinion"; the next
            # class in the chain makes the final call.
            return True
        return not bool(getattr(user, "must_change_password", False))