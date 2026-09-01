"""Tests for the admin-scoped institution endpoints.

Two endpoints: list (`GET /api/institutions/`) and status-update
(`POST /api/institutions/<id>/status/`). Both are admin-only.

The list endpoint checks the standard permission gate (registrar 403,
anonymous 401, admin 200). The status-update endpoint checks the
four allowed transitions and the four disallowed ones, and verifies
the audit-log row is written on every successful transition.
"""

from __future__ import annotations

import pytest

from audit.models import ActivityLog
from institutions.models import Institution


# --- 1. List endpoint requires admin --------------------------------------

@pytest.mark.django_db
def test_institution_list_requires_admin(
    api_client, admin_api_client, institution, other_institution,
):
    """Registrar (api_client) is forbidden, anonymous is unauthorized,
    admin sees both institutions.
    """
    # Anonymous
    from rest_framework.test import APIClient
    anon = APIClient()
    resp = anon.get("/api/institutions/")
    assert resp.status_code == 401

    # Registrar
    resp = api_client.get("/api/institutions/")
    assert resp.status_code == 403

    # Admin
    resp = admin_api_client.get("/api/institutions/")
    assert resp.status_code == 200
    body = resp.json()
    ids = {row["id"] for row in body["results"]}
    assert institution.id in ids
    assert other_institution.id in ids


@pytest.mark.django_db
def test_institution_list_returns_status(admin_api_client, institution, other_institution):
    institution.status = Institution.Status.PENDING
    institution.save()
    other_institution.status = Institution.Status.SUSPENDED
    other_institution.save()

    resp = admin_api_client.get("/api/institutions/")
    assert resp.status_code == 200
    by_id = {row["id"]: row for row in resp.json()["results"]}
    assert by_id[institution.id]["status"] == "pending"
    assert by_id[other_institution.id]["status"] == "suspended"


# --- 2. Status update — four allowed transitions --------------------------

@pytest.mark.django_db
@pytest.mark.parametrize(
    "from_status,to_status,expected_action",
    [
        (Institution.Status.PENDING, Institution.Status.ACTIVE, ActivityLog.Action.INSTITUTION_APPROVED),
        (Institution.Status.PENDING, Institution.Status.SUSPENDED, ActivityLog.Action.INSTITUTION_SUSPENDED),
        (Institution.Status.ACTIVE, Institution.Status.SUSPENDED, ActivityLog.Action.INSTITUTION_SUSPENDED),
        (Institution.Status.SUSPENDED, Institution.Status.ACTIVE, ActivityLog.Action.INSTITUTION_APPROVED),
    ],
)
def test_institution_status_update_allowed_transitions(
    admin_api_client, institution, from_status, to_status, expected_action,
):
    institution.status = from_status
    institution.save()

    resp = admin_api_client.post(
        f"/api/institutions/{institution.id}/status/",
        {"status": to_status},
        format="json",
    )
    assert resp.status_code == 200, resp.content

    institution.refresh_from_db()
    assert institution.status == to_status

    rows = ActivityLog.objects.filter(
        action=expected_action,
        institution=institution,
    )
    assert rows.count() == 1
    assert from_status in rows.first().detail
    assert to_status in rows.first().detail


# --- 3. Disallowed transitions --------------------------------------------

@pytest.mark.django_db
@pytest.mark.parametrize(
    "from_status,to_status",
    [
        # No backwards-from-active to pending
        (Institution.Status.ACTIVE, Institution.Status.PENDING),
        # Already-active on re-POST with active
        (Institution.Status.ACTIVE, Institution.Status.ACTIVE),
        # Already-suspended on re-POST with suspended
        (Institution.Status.SUSPENDED, Institution.Status.SUSPENDED),
        # Pending → pending is a no-op
        (Institution.Status.PENDING, Institution.Status.PENDING),
    ],
)
def test_institution_status_update_rejects_invalid_transitions(
    admin_api_client, institution, from_status, to_status,
):
    institution.status = from_status
    institution.save()

    resp = admin_api_client.post(
        f"/api/institutions/{institution.id}/status/",
        {"status": to_status},
        format="json",
    )
    assert resp.status_code == 400

    institution.refresh_from_db()
    assert institution.status == from_status  # unchanged

    # No audit row should be written for a rejected transition.
    assert ActivityLog.objects.filter(
        institution=institution,
        action__in=[
            ActivityLog.Action.INSTITUTION_APPROVED,
            ActivityLog.Action.INSTITUTION_SUSPENDED,
        ],
    ).count() == 0


# --- 4. Status update requires admin ---------------------------------------

@pytest.mark.django_db
def test_institution_status_update_requires_admin(api_client, institution):
    resp = api_client.post(
        f"/api/institutions/{institution.id}/status/",
        {"status": Institution.Status.SUSPENDED},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_institution_status_update_404_for_unknown_id(admin_api_client):
    resp = admin_api_client.post(
        "/api/institutions/999999/status/",
        {"status": Institution.Status.ACTIVE},
        format="json",
    )
    assert resp.status_code == 404


@pytest.mark.django_db
def test_institution_status_update_rejects_invalid_status_choice(admin_api_client, institution):
    """`status` field's ChoiceField rejects unknown values with 400.
    """
    resp = admin_api_client.post(
        f"/api/institutions/{institution.id}/status/",
        {"status": "bogus"},
        format="json",
    )
    assert resp.status_code == 400
    assert "status" in resp.json().get("details", {})
