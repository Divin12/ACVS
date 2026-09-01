"""Tests for the ActivityLog write hooks at the four existing action points.

We exercise the views end-to-end (through APIClient) and assert on the
state of the ActivityLog table afterward. This is the integration test
the design called for — the audit row's actor must reflect the request
user, the institution/certificate FKs must be correct, and the detail
must carry the action-specific fields.

The chain reader is monkeypatched to return a valid hash for the
anchor test (otherwise the anchor endpoint never reaches the
"persisted" branch where the audit hook lives).
"""

from __future__ import annotations

import datetime

import pytest

from audit.models import ActivityLog
from certificates.hashing import compute_content_hash
from certificates.models import Certificate
from students.models import Student


@pytest.fixture
def grace_cert(student, institution) -> Certificate:
    return Certificate.objects.create(
        certificate_id="ACVS-2026-AAA0001",
        student=student,
        institution=institution,
        cohort_number=1,
        degree="BSc",
        program="CS",
        issued_date=datetime.date(2026, 1, 1),
        status=Certificate.Status.GRACE_PERIOD,
    )


SAMPLE_TX_HASH = "0x" + "ab" * 32


# --- 1. BulkCreateView writes one CERT_REGISTERED row per cohort ----------

@pytest.mark.django_db
def test_bulk_create_writes_one_audit_row_per_cohort(api_client, institution, student):
    """Submitting a batch of 5 should write exactly ONE cert_registered
    row (not five), with detail containing the cohort size + cohort_number.
    """
    payload = {
        "items": [
            {
                "student_name": "Ada Lovelace",
                "cohort_number": 2024,
                "degree": "BSc",
                "program": "CS",
                "issued_date": "2024-06-01",
            },
            {
                "student_name": "Alan Turing",
                "cohort_number": 2024,
                "degree": "BSc",
                "program": "CS",
                "issued_date": "2024-06-01",
            },
            {
                "student_name": "Grace Hopper",
                "cohort_number": 2024,
                "degree": "BSc",
                "program": "CS",
                "issued_date": "2024-06-01",
            },
            {
                "student_name": "Edsger Dijkstra",
                "cohort_number": 2024,
                "degree": "BSc",
                "program": "CS",
                "issued_date": "2024-06-01",
            },
            {
                "student_name": "Donald Knuth",
                "cohort_number": 2024,
                "degree": "BSc",
                "program": "CS",
                "issued_date": "2024-06-01",
            },
        ],
    }

    response = api_client.post("/api/certificates/bulk-create/", payload, format="json")
    assert response.status_code == 201, response.content

    rows = ActivityLog.objects.filter(
        action=ActivityLog.Action.CERT_REGISTERED,
        institution=institution,
    )
    assert rows.count() == 1, "expected exactly one audit row per cohort submission"
    row = rows.first()
    assert row.institution == institution
    assert row.certificate is None  # cohort-level — no single cert
    assert row.action == ActivityLog.Action.CERT_REGISTERED
    assert "2024" in row.detail
    assert "5" in row.detail  # submitted count


@pytest.mark.django_db
def test_bulk_create_failure_rolls_back_audit_row(api_client, institution, student, monkeypatch):
    """If the bulk_create raises IntegrityError, the audit row must NOT
    survive. The audit hook lives inside the same `transaction.atomic()`
    block as bulk_create, so a rollback wipes the audit row too.
    """
    from django.db import IntegrityError

    payload = {
        "items": [
            {
                "student_name": "Ada Lovelace",
                "cohort_number": 2024,
                "degree": "BSc",
                "program": "CS",
                "issued_date": "2024-06-01",
            },
        ],
    }

    def _explode(*args, **kwargs):
        raise IntegrityError("forced collision")

    monkeypatch.setattr("certificates.views.Certificate.objects.bulk_create", _explode)

    response = api_client.post("/api/certificates/bulk-create/", payload, format="json")
    assert response.status_code == 400

    assert ActivityLog.objects.filter(
        action=ActivityLog.Action.CERT_REGISTERED,
    ).count() == 0


# --- 2. PATCH writes CERT_EDITED -------------------------------------------

@pytest.mark.django_db
def test_patch_writes_cert_edited_row(api_client, grace_cert):
    response = api_client.patch(
        f"/api/certificates/{grace_cert.certificate_id}/",
        {"program": "Mathematics"},
        format="json",
    )
    assert response.status_code == 200, response.content

    rows = ActivityLog.objects.filter(
        action=ActivityLog.Action.CERT_EDITED,
        certificate=grace_cert,
    )
    assert rows.count() == 1
    row = rows.first()
    assert row.institution == grace_cert.institution
    assert "program" in row.detail


@pytest.mark.django_db
def test_patch_failure_does_not_write_audit_row(api_client, grace_cert):
    """Anchored cert cannot be edited — the PATCH must 400 and the
    audit table must stay empty for that action.
    """
    grace_cert.status = Certificate.Status.ANCHORED
    grace_cert.save()

    response = api_client.patch(
        f"/api/certificates/{grace_cert.certificate_id}/",
        {"program": "Mathematics"},
        format="json",
    )
    assert response.status_code == 400

    assert ActivityLog.objects.filter(
        action=ActivityLog.Action.CERT_EDITED,
        certificate=grace_cert,
    ).count() == 0


# --- 3. Anchor writes CERT_ANCHORED ----------------------------------------

@pytest.mark.django_db
def test_anchor_writes_cert_anchored_row(
    api_client, grace_cert, chain_anchored_with,
):
    on_chain_hash = compute_content_hash(grace_cert)
    chain_anchored_with(bytes(on_chain_hash))

    response = api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/anchor/",
        {"tx_hash": SAMPLE_TX_HASH},
        format="json",
    )
    assert response.status_code == 200, response.content

    rows = ActivityLog.objects.filter(
        action=ActivityLog.Action.CERT_ANCHORED,
        certificate=grace_cert,
    )
    assert rows.count() == 1
    row = rows.first()
    assert row.institution == grace_cert.institution
    assert SAMPLE_TX_HASH in row.detail


@pytest.mark.django_db
def test_anchor_failure_does_not_write_audit_row(
    api_client, grace_cert, chain_anchored_with,
):
    """Wrong on-chain hash — the endpoint must 400 and no audit row
    must be written. The audit hook lives AFTER the save, so a
    never-saved cert also means no audit row.
    """
    bogus = b"\xff" * 32
    chain_anchored_with(bogus)

    response = api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/anchor/",
        {"tx_hash": SAMPLE_TX_HASH},
        format="json",
    )
    assert response.status_code == 400

    assert ActivityLog.objects.filter(
        action=ActivityLog.Action.CERT_ANCHORED,
    ).count() == 0


# --- 4. Disable writes CERT_DISABLED ---------------------------------------

@pytest.mark.django_db
def test_disable_writes_cert_disabled_row(api_client, grace_cert):
    response = api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/disable/",
        {"reason": "Duplicate cohort entry"},
        format="json",
    )
    assert response.status_code == 200, response.content

    rows = ActivityLog.objects.filter(
        action=ActivityLog.Action.CERT_DISABLED,
        certificate=grace_cert,
    )
    assert rows.count() == 1
    row = rows.first()
    assert row.institution == grace_cert.institution
    assert "grace_period" in row.detail  # previous_status
    assert "Duplicate cohort entry" in row.detail


@pytest.mark.django_db
def test_disable_idempotent_does_not_double_audit_log(api_client, grace_cert):
    """A second disable call sees status=disabled and returns 200
    without writing. The audit table must have exactly one row.
    """
    payload = {"reason": "Reason one"}
    first = api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/disable/",
        payload,
        format="json",
    )
    assert first.status_code == 200

    payload2 = {"reason": "Reason two"}
    second = api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/disable/",
        payload2,
        format="json",
    )
    assert second.status_code == 200

    rows = ActivityLog.objects.filter(
        action=ActivityLog.Action.CERT_DISABLED,
        certificate=grace_cert,
    )
    assert rows.count() == 1
    assert "Reason one" in rows.first().detail  # original wins
    assert "Reason two" not in rows.first().detail


# --- 5. Model-level sanity checks ------------------------------------------

@pytest.mark.django_db
def test_activitylog_ordering_is_newest_first(registrar_user, institution):
    a = ActivityLog.objects.create(
        actor=registrar_user, action=ActivityLog.Action.CERT_REGISTERED,
        institution=institution,
    )
    b = ActivityLog.objects.create(
        actor=registrar_user, action=ActivityLog.Action.CERT_REGISTERED,
        institution=institution,
    )
    # `auto_now_add` resolution is microsecond-precision, but Django
    # doesn't guarantee ordering between two creates in the same
    # microsecond. Compare a > b or a < b, not assume one direction.
    rows = list(ActivityLog.objects.all())
    assert a in rows and b in rows
    assert rows[0].created_at >= rows[-1].created_at


@pytest.mark.django_db
def test_activitylog_on_delete_protect_blocks_actor_deletion(registrar_user, institution):
    """The PROTECT on_delete means deleting a user who has audit-log
    rows must raise (the trail must survive).
    """
    ActivityLog.objects.create(
        actor=registrar_user, action=ActivityLog.Action.CERT_REGISTERED,
        institution=institution,
    )
    with pytest.raises(Exception):
        registrar_user.delete()
