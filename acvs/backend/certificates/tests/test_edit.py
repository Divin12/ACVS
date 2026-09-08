"""Edit-endpoint lifecycle tests.

A certificate is editable only while it is in grace_period. PATCHing an
anchored or disabled cert must 400, not 404, with a clear field error.
"""

from __future__ import annotations

import pytest

from certificates.models import Certificate


def _make_cert(student, institution, *, status_value: str) -> Certificate:
    return Certificate.objects.create(
        certificate_id=f"ACVS-2026-{status_value[:8].upper()}",
        student=student,
        institution=institution,
        cohort_number=1,
        degree="BSc",
        program="CS",
        issued_date="2026-01-01",
        status=status_value,
    )


@pytest.mark.django_db
def test_edit_blocked_when_anchored(api_client, student, institution):
    cert = _make_cert(student, institution, status_value=Certificate.Status.ANCHORED)
    response = api_client.patch(
        f"/api/certificates/{cert.certificate_id}/",
        {"degree": "PhD"},
        format="json",
    )
    assert response.status_code == 400
    assert "status" in response.json().get("details", {})

    cert.refresh_from_db()
    assert cert.degree == "BSc"  # unchanged


@pytest.mark.django_db
def test_edit_blocked_when_disabled(api_client, student, institution):
    cert = _make_cert(student, institution, status_value=Certificate.Status.DISABLED)
    response = api_client.patch(
        f"/api/certificates/{cert.certificate_id}/",
        {"degree": "PhD"},
        format="json",
    )
    assert response.status_code == 400
    cert.refresh_from_db()
    assert cert.degree == "BSc"


@pytest.mark.django_db
def test_edit_allowed_in_grace_period(api_client, student, institution):
    cert = _make_cert(student, institution, status_value=Certificate.Status.GRACE_PERIOD)
    response = api_client.patch(
        f"/api/certificates/{cert.certificate_id}/",
        {"degree": "PhD"},
        format="json",
    )
    assert response.status_code == 200, response.content
    cert.refresh_from_db()
    assert cert.degree == "PhD"


@pytest.mark.django_db
def test_edit_returns_404_for_unknown_id(api_client):
    response = api_client.patch(
        "/api/certificates/ACVS-2026-DOESNTEX/",
        {"degree": "PhD"},
        format="json",
    )
    assert response.status_code == 404
