"""Tests for the staff list + invite endpoints (option a).

Permissions model: any registrar at institution X can list/invite for
institution X; nobody else can. Admins do NOT have access — staff
management is institution self-service, not Ministry oversight.

The list endpoint exposes id, email, role, last_login_at. The invite
endpoint creates a User with role=registrar, institution=<id>, a
fresh random password returned once in the response body, and writes
an ActivityLog row.
"""

from __future__ import annotations

import pytest

from accounts.models import User
from audit.models import ActivityLog


# --- 1. List endpoint — scoping --------------------------------------------

@pytest.mark.django_db
def test_staff_list_returns_only_callers_institution(
    api_client, registrar_user, other_registrar, institution,
):
    """Registrar X sees institution X's users, not institution Y's."""
    response = api_client.get(f"/api/institutions/{institution.id}/staff/")
    assert response.status_code == 200
    emails = {row["email"] for row in response.json()["results"]}
    assert registrar_user.email in emails
    assert other_registrar.email not in emails


@pytest.mark.django_db
def test_staff_list_rejects_cross_institution(api_client, other_institution):
    """A registrar from institution X trying to read institution Y's
    staff list must be forbidden.
    """
    response = api_client.get(f"/api/institutions/{other_institution.id}/staff/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_staff_list_rejects_admin(admin_api_client, institution):
    """Admins are NOT staff-management users (option a). 403."""
    response = admin_api_client.get(f"/api/institutions/{institution.id}/staff/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_staff_list_rejects_anonymous(institution):
    from rest_framework.test import APIClient
    anon = APIClient()
    response = anon.get(f"/api/institutions/{institution.id}/staff/")
    assert response.status_code == 401


@pytest.mark.django_db
def test_staff_list_404_for_unknown_institution(api_client):
    response = api_client.get("/api/institutions/999999/staff/")
    assert response.status_code == 404


@pytest.mark.django_db
def test_staff_list_includes_last_login_at(api_client, registrar_user, institution):
    """last_login_at is null until the user has logged in via OTP."""
    response = api_client.get(f"/api/institutions/{institution.id}/staff/")
    assert response.status_code == 200
    rows = response.json()["results"]
    assert len(rows) >= 1
    me = next(r for r in rows if r["email"] == registrar_user.email)
    assert "last_login_at" in me
    # Never logged in via OTP in this test → null.
    assert me["last_login_at"] is None


# --- 2. Invite endpoint — happy path --------------------------------------

@pytest.mark.django_db
def test_staff_invite_creates_user_with_random_password(
    api_client, registrar_user, institution,
):
    """Inviting a new email creates a User (role=registrar,
    institution=<id>, is_active=True) with a strong random password.
    Returns 201 with the password in the response (one-shot).
    """
    new_email = "newstaff@testuni.edu"

    response = api_client.post(
        f"/api/institutions/{institution.id}/staff/invite/",
        {"email": new_email},
        format="json",
    )
    assert response.status_code == 201, response.content

    body = response.json()
    assert body["email"] == new_email
    assert body["role"] == User.Role.REGISTRAR
    assert body["institution"]["id"] == institution.id
    assert body["institution"]["name"] == institution.name
    # Password is returned ONCE.
    pwd = body["initial_password"]
    assert isinstance(pwd, str)
    assert len(pwd) >= 12
    assert any(c.isupper() for c in pwd)
    assert any(c.isdigit() for c in pwd)
    assert any(c in "!@#$%^&*()-_=+[]{}" for c in pwd)

    # Verify the user exists and the password works.
    new_user = User.objects.get(email=new_email)
    assert new_user.check_password(pwd)
    assert new_user.institution == institution
    assert new_user.role == User.Role.REGISTRAR
    assert new_user.is_active is True


@pytest.mark.django_db
def test_staff_invite_writes_activity_log_row(
    api_client, registrar_user, institution,
):
    """Every successful invite writes an ActivityLog row with
    action=STAFF_INVITED, actor=inviting registrar, institution=<id>,
    detail={"invited_email": ...}.
    """
    response = api_client.post(
        f"/api/institutions/{institution.id}/staff/invite/",
        {"email": "audit-target@testuni.edu"},
        format="json",
    )
    assert response.status_code == 201

    rows = ActivityLog.objects.filter(
        action=ActivityLog.Action.STAFF_INVITED,
        institution=institution,
    )
    assert rows.count() == 1
    row = rows.first()
    assert row.actor == registrar_user
    assert row.certificate is None
    assert "audit-target@testuni.edu" in row.detail


@pytest.mark.django_db
def test_staff_invite_allows_subsequent_invites(
    api_client, institution,
):
    """Two sequential invites both succeed and create distinct users."""
    emails = ["first@testuni.edu", "second@testuni.edu"]
    for email in emails:
        response = api_client.post(
            f"/api/institutions/{institution.id}/staff/invite/",
            {"email": email},
            format="json",
        )
        assert response.status_code == 201

    assert User.objects.filter(email__in=emails).count() == 2


# --- 3. Invite endpoint — error paths --------------------------------------

@pytest.mark.django_db
def test_staff_invite_rejects_duplicate_email(
    api_client, registrar_user, institution,
):
    """An email already in use anywhere in the system returns 400
    with a field-keyed error (not 500).
    """
    # registrar_user already has email registrar@testuni.edu.
    response = api_client.post(
        f"/api/institutions/{institution.id}/staff/invite/",
        {"email": registrar_user.email},
        format="json",
    )
    assert response.status_code == 400
    assert "email" in response.json().get("details", {})


@pytest.mark.django_db
def test_staff_invite_rejects_missing_email(api_client, institution):
    response = api_client.post(
        f"/api/institutions/{institution.id}/staff/invite/",
        {},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_staff_invite_rejects_blank_email(api_client, institution):
    response = api_client.post(
        f"/api/institutions/{institution.id}/staff/invite/",
        {"email": "   "},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_staff_invite_rejects_non_string_email(api_client, institution):
    response = api_client.post(
        f"/api/institutions/{institution.id}/staff/invite/",
        {"email": 42},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_staff_invite_rejects_cross_institution(api_client, other_institution):
    """A registrar at institution X cannot invite for institution Y."""
    response = api_client.post(
        f"/api/institutions/{other_institution.id}/staff/invite/",
        {"email": "sneaky@otheruni.edu"},
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_staff_invite_rejects_admin(admin_api_client, institution):
    response = admin_api_client.post(
        f"/api/institutions/{institution.id}/staff/invite/",
        {"email": "admin-invited@testuni.edu"},
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_staff_invite_404_for_unknown_institution(api_client):
    response = api_client.post(
        "/api/institutions/999999/staff/invite/",
        {"email": "x@example.com"},
        format="json",
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_staff_invite_normalizes_email_case(api_client, institution):
    """Mixed-case emails normalize to lowercase (matches the User
    model's normalize_email behavior).
    """
    response = api_client.post(
        f"/api/institutions/{institution.id}/staff/invite/",
        {"email": "  NEWStaff@TestUni.edu  "},
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["email"] == "newstaff@testuni.edu"