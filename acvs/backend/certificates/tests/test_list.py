"""List / filter tests.

* ?status=<choice> filters by lifecycle status.
* Registrars are scoped to their own institution (security-critical).
* Admins see all institutions and may filter by ?institution=<id>.
"""

from __future__ import annotations

import pytest

from certificates.models import Certificate
from institutions.models import Institution
from students.models import Student


@pytest.fixture
def other_student(other_institution) -> Student:
    return Student.objects.create(full_name="Grace Hopper", institution=other_institution)


def _make(institution, student, *, label: str, status_value: str) -> Certificate:
    return Certificate.objects.create(
        certificate_id=f"ACVS-2026-{label.upper():<8}"[:18],
        student=student,
        institution=institution,
        cohort_number=1,
        degree="BSc",
        program="CS",
        issued_date="2026-01-01",
        status=status_value,
    )


@pytest.mark.django_db
def test_list_filter_by_status(api_client, institution, student):
    _make(institution, student, label="GP0000001", status_value=Certificate.Status.GRACE_PERIOD)
    anchored = _make(institution, student, label="AN0000002", status_value=Certificate.Status.ANCHORED)
    _make(institution, student, label="DI0000003", status_value=Certificate.Status.DISABLED)

    response = api_client.get("/api/certificates/?status=anchored")
    assert response.status_code == 200
    body = response.json()
    # Paginated response has 'results'.
    ids = [c["certificate_id"] for c in body["results"]]
    assert ids == [anchored.certificate_id]


@pytest.mark.django_db
def test_list_filter_by_institution_for_registrar(
    api_client, other_api_client, institution, student, other_institution, other_student,
):
    """Security-critical: a registrar must not see other institutions' certs."""

    # `api_client` is the registrar of `institution` (fixture default).
    own = _make(institution, student, label="OWN000001", status_value=Certificate.Status.GRACE_PERIOD)
    _make(other_institution, other_student, label="OTH000002", status_value=Certificate.Status.GRACE_PERIOD)

    response = api_client.get("/api/certificates/")
    assert response.status_code == 200
    ids = [c["certificate_id"] for c in response.json()["results"]]
    assert ids == [own.certificate_id]


@pytest.mark.django_db
def test_admin_sees_all_institutions(admin_api_client, institution, student, other_institution, other_student):
    own = _make(institution, student, label="OWN00000A", status_value=Certificate.Status.GRACE_PERIOD)
    other = _make(other_institution, other_student, label="OTH00000B", status_value=Certificate.Status.GRACE_PERIOD)

    response = admin_api_client.get("/api/certificates/")
    assert response.status_code == 200
    ids = {c["certificate_id"] for c in response.json()["results"]}
    assert {own.certificate_id, other.certificate_id} <= ids


@pytest.mark.django_db
def test_list_returns_nested_student_with_full_name(api_client, institution, student):
    """The list endpoint must surface the resolved name, not a bare PK.

    Pins the public contract the frontend CertificateList table depends on:
    `row.student` is `{id, full_name}`, never an integer.
    """

    _make(institution, student, label="NAME00001", status_value=Certificate.Status.GRACE_PERIOD)

    response = api_client.get("/api/certificates/")
    assert response.status_code == 200
    row = response.json()["results"][0]
    assert isinstance(row["student"], dict), f"student must be nested object, got {type(row['student']).__name__}"
    assert row["student"] == {"id": student.pk, "full_name": "Ada Lovelace"}


@pytest.mark.django_db
def test_status_all_sentinel_does_not_filter(api_client, institution, student):
    """`?status=all` is the frontend's "no filter" sentinel — the backend
    must NOT apply a `WHERE status = 'all'` clause, which would match zero
    rows and silently break the default "show everything" state.

    Regression: this used to return count=0 even when the user's institution
    owned real certificates in every state. Pinning the contract here so a
    future refactor of the filter logic can't reintroduce the bug without
    a failing test.
    """
    _make(institution, student, label="GP0000001", status_value=Certificate.Status.GRACE_PERIOD)
    _make(institution, student, label="AN0000002", status_value=Certificate.Status.ANCHORED)
    _make(institution, student, label="DI0000003", status_value=Certificate.Status.DISABLED)

    response = api_client.get("/api/certificates/?status=all")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 3, (
        f"`?status=all` must return every cert in scope, got count={body['count']} "
        "(the literal sentinel must be treated as 'no filter')."
    )
    assert {c["status"] for c in body["results"]} == {
        Certificate.Status.GRACE_PERIOD,
        Certificate.Status.ANCHORED,
        Certificate.Status.DISABLED,
    }
