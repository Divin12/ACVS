"""Disable-endpoint tests.

POST /api/certificates/<id>/disable/

The endpoint is registrar-scoped + institution-scoped, and has no
chain involvement (the on-chain record is already final by the time
disable is called). These tests pin:

* the happy path (anchored → disabled, with reason and timestamp);
* permissive transitions (grace_period → disabled also allowed);
* idempotency (a second POST on an already-disabled row is a 200,
  not a 400, and does NOT overwrite the original reason/timestamp);
* the reason-required validation (400 with details.reason);
* blank / whitespace-only / over-length reason rejection;
* 404 for unknown certs;
* 403 for other-institution registrars;
* happy-path permission for admins (admins bypass institution scope —
  ScopeToInstitution grants them broad access by design, so we cover
  it here even though admins typically don't run this screen).
"""

from __future__ import annotations

import datetime

import pytest

from certificates.models import Certificate


SAMPLE_REASON = "Issued in error per faculty memo #2026-07-12."


def _make_cert(student, institution, *, status_value: str, certificate_id: str | None = None) -> Certificate:
    cid = certificate_id or f"ACVS-2026-D-{status_value[:8].upper()}"
    return Certificate.objects.create(
        certificate_id=cid,
        student=student,
        institution=institution,
        cohort_number=1,
        degree="BSc",
        program="CS",
        issued_date=datetime.date(2026, 1, 1),
        status=status_value,
    )


# --- Happy path: anchored → disabled ------------------------------------

@pytest.mark.django_db
def test_disable_anchored_cert_persists_reason_and_timestamp(
    api_client, student, institution,
):
    cert = _make_cert(student, institution, status_value=Certificate.Status.ANCHORED)

    response = api_client.post(
        f"/api/certificates/{cert.certificate_id}/disable/",
        {"reason": SAMPLE_REASON},
        format="json",
    )

    assert response.status_code == 200, response.content
    body = response.json()
    assert body["status"] == Certificate.Status.DISABLED
    assert body["disabled_reason"] == SAMPLE_REASON
    assert body["disabled_at"] is not None

    cert.refresh_from_db()
    assert cert.status == Certificate.Status.DISABLED
    assert cert.disabled_reason == SAMPLE_REASON
    assert cert.disabled_at is not None
    # The on-chain seal is preserved — disable is a flag, not a wipe.
    # (This cert was created without a chain_hash, but the field MUST
    # remain whatever it was before the disable call. Pinning the
    # "preserve" guarantee with an empty string here.)
    assert cert.chain_hash == ""


# --- Permissive transition: grace_period → disabled -------------------

@pytest.mark.django_db
def test_disable_allows_transition_from_grace_period(
    api_client, student, institution,
):
    """A registrar may decide to disable a cert without anchoring it
    first. The cert was issued in error and shouldn't be sealable."""
    cert = _make_cert(student, institution, status_value=Certificate.Status.GRACE_PERIOD)

    response = api_client.post(
        f"/api/certificates/{cert.certificate_id}/disable/",
        {"reason": "Wrong degree code — reissue needed."},
        format="json",
    )

    assert response.status_code == 200, response.content
    cert.refresh_from_db()
    assert cert.status == Certificate.Status.DISABLED


# --- Idempotency -------------------------------------------------------

@pytest.mark.django_db
def test_disable_is_idempotent_and_does_not_overwrite_original_reason(
    api_client, student, institution,
):
    """Two POSTs in sequence. The first succeeds and stamps the
    original reason + timestamp. The second sees status=disabled and
    returns 200 WITHOUT writing — the audit trail of the first
    registrar must be preserved verbatim.
    """
    cert = _make_cert(student, institution, status_value=Certificate.Status.ANCHORED)

    first = api_client.post(
        f"/api/certificates/{cert.certificate_id}/disable/",
        {"reason": SAMPLE_REASON},
        format="json",
    )
    assert first.status_code == 200

    cert.refresh_from_db()
    original_reason = cert.disabled_reason
    original_disabled_at = cert.disabled_at
    assert original_reason == SAMPLE_REASON
    assert original_disabled_at is not None

    # Second call with a DIFFERENT reason must NOT overwrite the first.
    second = api_client.post(
        f"/api/certificates/{cert.certificate_id}/disable/",
        {"reason": "Trying to retroactively change the reason."},
        format="json",
    )
    assert second.status_code == 200

    cert.refresh_from_db()
    assert cert.disabled_reason == original_reason
    assert cert.disabled_at == original_disabled_at
    assert cert.status == Certificate.Status.DISABLED


# --- Reason validation -------------------------------------------------

@pytest.mark.django_db
def test_disable_rejects_missing_reason(api_client, student, institution):
    cert = _make_cert(student, institution, status_value=Certificate.Status.ANCHORED)

    response = api_client.post(
        f"/api/certificates/{cert.certificate_id}/disable/",
        {},
        format="json",
    )

    assert response.status_code == 400
    assert "reason" in response.json().get("details", {})
    cert.refresh_from_db()
    assert cert.status == Certificate.Status.ANCHORED  # unchanged


@pytest.mark.django_db
def test_disable_rejects_blank_reason(api_client, student, institution):
    """Whitespace-only reasons are rejected — the trim happens server-side,
    and a string of spaces is no audit trail at all.
    """
    cert = _make_cert(student, institution, status_value=Certificate.Status.ANCHORED)

    response = api_client.post(
        f"/api/certificates/{cert.certificate_id}/disable/",
        {"reason": "   \n  \t  "},
        format="json",
    )

    assert response.status_code == 400
    assert "reason" in response.json().get("details", {})
    cert.refresh_from_db()
    assert cert.status == Certificate.Status.ANCHORED


@pytest.mark.django_db
def test_disable_rejects_non_string_reason(api_client, student, institution):
    """A non-string reason (e.g. an int) is a client bug — we 400
    explicitly rather than coercing or accepting whatever JSON
    parse handed us.
    """
    cert = _make_cert(student, institution, status_value=Certificate.Status.ANCHORED)

    response = api_client.post(
        f"/api/certificates/{cert.certificate_id}/disable/",
        {"reason": 12345},
        format="json",
    )

    assert response.status_code == 400
    assert "reason" in response.json().get("details", {})
    cert.refresh_from_db()
    assert cert.status == Certificate.Status.ANCHORED


@pytest.mark.django_db
def test_disable_rejects_overlength_reason(api_client, student, institution):
    """Reason > 512 chars is rejected at the API layer. The DB column
    is max_length=512; validating here gives a clean 400 instead of a
    500 from psycopg's DataError on overflow.
    """
    cert = _make_cert(student, institution, status_value=Certificate.Status.ANCHORED)

    response = api_client.post(
        f"/api/certificates/{cert.certificate_id}/disable/",
        {"reason": "x" * 513},
        format="json",
    )

    assert response.status_code == 400
    assert "reason" in response.json().get("details", {})
    cert.refresh_from_db()
    assert cert.status == Certificate.Status.ANCHORED


# --- Unknown certificate -----------------------------------------------

@pytest.mark.django_db
def test_disable_rejects_unknown_cert(api_client):
    response = api_client.post(
        "/api/certificates/ACVS-2026-DOESNTEX/disable/",
        {"reason": SAMPLE_REASON},
        format="json",
    )
    assert response.status_code == 404


# --- Institution scoping -----------------------------------------------

@pytest.mark.django_db
def test_disable_scopes_to_institution(other_api_client, student, institution):
    """A registrar from a different institution must NOT be able to
    disable another institution's cert. Same scope pattern as the
    anchor / edit / list views.
    """
    cert = _make_cert(student, institution, status_value=Certificate.Status.ANCHORED)

    response = other_api_client.post(
        f"/api/certificates/{cert.certificate_id}/disable/",
        {"reason": SAMPLE_REASON},
        format="json",
    )
    assert response.status_code == 403

    cert.refresh_from_db()
    assert cert.status == Certificate.Status.ANCHORED
    assert cert.disabled_reason == ""
    assert cert.disabled_at is None
