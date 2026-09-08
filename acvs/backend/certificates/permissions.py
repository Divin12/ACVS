"""DRF permissions for the certificates app.

IsRegistrar / IsAdmin gate entire views (request-level). ScopeToInstitution
is object-level — it cross-checks the target Certificate's institution
against the request user's, and short-circuits for admins (who see all).
"""

from __future__ import annotations

from rest_framework.permissions import BasePermission


class IsRegistrar(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "is_registrar", False))


class IsAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "is_administrator", False))


class ScopeToInstitution(BasePermission):
    """Object-level: target cert must belong to the request user's institution.

    Admins (role=admin) see all institutions.
    """

    def has_object_permission(self, request, view, obj) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_administrator", False):
            return True
        return obj.institution_id == user.institution_id
