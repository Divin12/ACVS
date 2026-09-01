"""Public verify endpoint tests.

The endpoint is anonymous (no auth), so we use the bare APIClient.
We assert both the response shape and that an Employer (verification log)
row is created for every call — including not_found.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from certificates.models import Certificate
from verification.conftest import make_certificate
from verification.models import Employer


def _make(student, institution, *, status_value: str) -> Certificate:
    return make_certificate(student, institution, status_value=status_value)


@pytest.mark.django_db
def test_public_verify_anchored_returns_valid(student, institution):
    client = APIClient()  # no auth
    cert = _make(student, institution, status_value=Certificate.Status.ANCHORED)

    response = client.get(f"/api/verify/{cert.certificate_id}/")

    assert response.status_code == 200
    body = response.json()
    assert body["result"] == "valid"
    assert body["certificate_id"] == cert.certificate_id
    assert body["student"] == student.full_name
    assert body["institution"] == institution.name
    assert Employer.objects.filter(certificate=cert, result="valid").exists()


@pytest.mark.django_db
def test_public_verify_disabled_returns_disabled(student, institution):
    client = APIClient()
    cert = _make(student, institution, status_value=Certificate.Status.DISABLED)

    response = client.get(f"/api/verify/{cert.certificate_id}/")

    assert response.status_code == 200
    assert response.json()["result"] == "disabled"
    assert Employer.objects.filter(certificate=cert, result="disabled").exists()


@pytest.mark.django_db
def test_public_verify_unknown_id_returns_not_found():
    client = APIClient()

    response = client.get("/api/verify/ACVS-2026-NOPE0000/")

    assert response.status_code == 404
    assert response.json()["result"] == "not_found"
    # Log row still created, with NULL certificate.
    log = Employer.objects.get(result="not_found")
    assert log.certificate_id is None


@pytest.mark.django_db
def test_public_verify_records_organization_name(student, institution):
    client = APIClient()
    cert = _make(student, institution, status_value=Certificate.Status.ANCHORED)

    client.get(f"/api/verify/{cert.certificate_id}/?organization_name=ACME%20HR")
    log = Employer.objects.get(certificate=cert)
    assert log.organization_name == "ACME HR"


@pytest.mark.django_db
def test_public_verify_grace_period_surfaces_not_yet_anchored(student, institution):
    """A grace-period cert is on record in Postgres but has never been
    sealed on-chain. The verify endpoint must surface this distinction
    via `chain_state == "not_yet_anchored"` (NOT collapse it into the
    anchored chain_state), so the public frontend can render honest
    copy instead of falsely claiming the record is "permanently anchored".

    Regression: the view used to apply the same chain_state to both
    grace_period and anchored certs (or skip the field entirely for
    grace rows), which made the frontend silently render the
    "Anchored" badge for a never-sealed record. Pinning the contract
    here so the distinction can't be lost without a failing test.
    """
    client = APIClient()
    grace = _make(student, institution, status_value=Certificate.Status.GRACE_PERIOD)
    anchored = _make(student, institution, status_value=Certificate.Status.ANCHORED)

    grace_resp = client.get(f"/api/verify/{grace.certificate_id}/")
    anchored_resp = client.get(f"/api/verify/{anchored.certificate_id}/")
    assert grace_resp.status_code == 200
    assert anchored_resp.status_code == 200

    grace_body = grace_resp.json()
    anchored_body = anchored_resp.json()

    # Both are top-level "valid" (DESIGN.md §4B: three outcomes only).
    assert grace_body["result"] == "valid"
    assert anchored_body["result"] == "valid"

    # The grace-period row carries the explicit not_yet_anchored signal
    # the frontend branches its Valid-state copy on.
    assert grace_body["status"] == "grace_period"
    assert grace_body["chain_state"] == "not_yet_anchored"

    # And the two states must NOT collapse to identical responses — that
    # collapse is exactly the bug this test pins. `chain_state` is the
    # least-falsifiable discriminator (status differs in the DB; chain_state
    # is what the wire contract carries).
    assert grace_body["chain_state"] != anchored_body["chain_state"], (
        f"grace_period and anchored must report different chain_state; "
        f"both reported {grace_body['chain_state']!r}"
    )
