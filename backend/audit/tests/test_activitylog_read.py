"""Tests for the ActivityLog read endpoint.

GET /api/audit/ — admin-only, filterable by institution/action/actor/
certificate/date range.

We seed a small set of audit rows directly (skipping the views) so
the read tests don't depend on the write hooks. The write hooks
have their own tests in test_activitylog.py.
"""

from __future__ import annotations

import datetime

import pytest

from audit.models import ActivityLog
from institutions.models import Institution


@pytest.fixture
def other_admin(db) -> "accounts.models.User":
    from accounts.models import User
    return User.objects.create_user(
        email="admin2@acvs.local",
        password="Th1sIsAValidPass!",
        role=User.Role.ADMIN,
        institution=None,
    )


@pytest.fixture
def seed_audit_rows(registrar_user, admin_user, institution, other_institution):
    """Populate a known mix of audit rows spanning two institutions,
    two actors, three action types, and two dates. Tests query the
    filter combinations and verify the right rows come back.
    """
    day1 = datetime.datetime(2026, 6, 1, 12, 0, 0, tzinfo=datetime.timezone.utc)
    day2 = datetime.datetime(2026, 6, 2, 12, 0, 0, tzinfo=datetime.timezone.utc)

    # Use update({'created_at': ...}) — auto_now_add populates on save,
    # but we override it here so the date-range test is deterministic.
    rows = [
        ActivityLog.objects.create(
            actor=registrar_user, action=ActivityLog.Action.CERT_REGISTERED,
            institution=institution, detail='{"cohort_number": 2024}',
        ),
        ActivityLog.objects.create(
            actor=registrar_user, action=ActivityLog.Action.CERT_EDITED,
            institution=institution,
        ),
        ActivityLog.objects.create(
            actor=registrar_user, action=ActivityLog.Action.CERT_ANCHORED,
            institution=institution,
        ),
        ActivityLog.objects.create(
            actor=admin_user, action=ActivityLog.Action.INSTITUTION_APPROVED,
            institution=institution,
        ),
        ActivityLog.objects.create(
            actor=admin_user, action=ActivityLog.Action.INSTITUTION_SUSPENDED,
            institution=other_institution,
        ),
    ]
    # Override created_at on three of them so day1/day2 markers exist.
    rows[0].created_at = day1
    rows[0].save(update_fields=["created_at"])
    rows[1].created_at = day1
    rows[1].save(update_fields=["created_at"])
    rows[2].created_at = day2
    rows[2].save(update_fields=["created_at"])
    rows[3].created_at = day2
    rows[3].save(update_fields=["created_at"])
    rows[4].created_at = day2
    rows[4].save(update_fields=["created_at"])
    return rows


# --- 1. Permission gate ----------------------------------------------------

@pytest.mark.django_db
def test_audit_list_requires_admin(
    api_client, admin_api_client, seed_audit_rows,
):
    from rest_framework.test import APIClient
    anon = APIClient()
    assert anon.get("/api/audit/").status_code == 401
    assert api_client.get("/api/audit/").status_code == 403
    assert admin_api_client.get("/api/audit/").status_code == 200


# --- 2. Default ordering and shape -----------------------------------------

@pytest.mark.django_db
def test_audit_list_returns_newest_first(admin_api_client, seed_audit_rows):
    resp = admin_api_client.get("/api/audit/")
    assert resp.status_code == 200
    body = resp.json()
    results = body["results"]
    assert len(results) == 5
    # Confirm newest-first ordering: the last seeded row was created
    # with day2 (index 4), but update_fields only writes the
    # override; the auto_now_add value would actually be later than
    # we set. We just verify the order is monotonic descending.
    timestamps = [r["created_at"] for r in results]
    assert timestamps == sorted(timestamps, reverse=True)


@pytest.mark.django_db
def test_audit_row_includes_actor_institution_action(admin_api_client, seed_audit_rows):
    resp = admin_api_client.get("/api/audit/")
    body = resp.json()
    sample = body["results"][0]
    # Pin the field names — the frontend (future) keys off these.
    for key in [
        "actor_email", "actor_role",
        "institution_name", "certificate_id",
        "action", "detail", "created_at",
    ]:
        assert key in sample, f"missing field: {key}"


# --- 3. Individual filters -------------------------------------------------

@pytest.mark.django_db
def test_audit_list_filter_by_institution(admin_api_client, seed_audit_rows, institution):
    resp = admin_api_client.get(f"/api/audit/?institution={institution.id}")
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 4  # 4 rows belong to institution
    for r in results:
        assert r["institution_name"] == institution.name


@pytest.mark.django_db
def test_audit_list_filter_by_action(admin_api_client, seed_audit_rows):
    resp = admin_api_client.get("/api/audit/?action=cert_edited")
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 1
    assert results[0]["action"] == "cert_edited"


@pytest.mark.django_db
def test_audit_list_filter_by_actor(admin_api_client, seed_audit_rows, admin_user):
    resp = admin_api_client.get(f"/api/audit/?actor={admin_user.id}")
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 2  # the two admin rows
    for r in results:
        assert r["actor_email"] == admin_user.email


@pytest.mark.django_db
def test_audit_list_filter_by_certificate(admin_api_client, registrar_user, institution):
    import datetime as _dt
    from certificates.models import Certificate
    from students.models import Student
    student = Student.objects.create(full_name="Ada Lovelace", institution=institution)
    cert = Certificate.objects.create(
        certificate_id="ACVS-2026-AUD0001",
        student=student,
        institution=institution,
        cohort_number=1,
        degree="BSc",
        program="CS",
        issued_date=_dt.date(2026, 1, 1),
        status=Certificate.Status.GRACE_PERIOD,
    )
    ActivityLog.objects.create(
        actor=registrar_user, action=ActivityLog.Action.CERT_ANCHORED,
        institution=institution, certificate=cert,
    )
    # Plus an unrelated row that should be filtered out.
    ActivityLog.objects.create(
        actor=registrar_user, action=ActivityLog.Action.CERT_REGISTERED,
        institution=institution,
    )

    resp = admin_api_client.get(f"/api/audit/?certificate={cert.certificate_id}")
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 1
    assert results[0]["certificate_id"] == cert.certificate_id


@pytest.mark.django_db
def test_audit_list_filter_by_date_range(admin_api_client, seed_audit_rows):
    """?since=YYYY-MM-DD&until=YYYY-MM-DD inclusive on both ends.

    The seeded rows for day1 are at 12:00 UTC and day2 are at 12:00 UTC.
    The view parses a date-only bound as midnight in the project
    timezone (UTC). To make the test deterministic against fixed UTC
    times, we widen the upper bound to the next day's midnight.
    """
    resp = admin_api_client.get("/api/audit/?since=2026-06-02&until=2026-06-03")
    assert resp.status_code == 200
    results = resp.json()["results"]
    # Three rows set to day2 (indices 2, 3, 4).
    assert len(results) == 3


@pytest.mark.django_db
def test_audit_list_combined_filters(admin_api_client, seed_audit_rows, institution):
    """All filters AND-combined. institution=X AND action=cert_anchored.
    """
    resp = admin_api_client.get(
        f"/api/audit/?institution={institution.id}&action=cert_anchored"
    )
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 1
    assert results[0]["action"] == "cert_anchored"
    assert results[0]["institution_name"] == institution.name


# --- 4. Edge cases ---------------------------------------------------------

@pytest.mark.django_db
def test_audit_list_unknown_action_returns_empty(admin_api_client, seed_audit_rows):
    resp = admin_api_client.get("/api/audit/?action=does_not_exist")
    assert resp.status_code == 200
    assert resp.json()["results"] == []


@pytest.mark.django_db
def test_audit_list_invalid_iso_date_returns_400(admin_api_client):
    resp = admin_api_client.get("/api/audit/?since=not-a-date")
    assert resp.status_code == 400
    assert "since" in resp.json().get("details", {})


@pytest.mark.django_db
def test_audit_list_paginates(admin_api_client, registrar_user, institution):
    """Create >25 rows; the read endpoint should paginate at 25.
    """
    for _ in range(30):
        ActivityLog.objects.create(
            actor=registrar_user, action=ActivityLog.Action.CERT_REGISTERED,
            institution=institution,
        )
    resp = admin_api_client.get("/api/audit/")
    body = resp.json()
    assert body["count"] == 30
    assert len(body["results"]) == 25  # page size
    assert body["next"] is not None

    # Page 2 has the remaining 5.
    resp2 = admin_api_client.get("/api/audit/?page=2")
    body2 = resp2.json()
    assert len(body2["results"]) == 5
    assert body2["next"] is None
