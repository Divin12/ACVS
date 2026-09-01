"""Bulk-create atomicity + student-creation tests.

The bulk endpoint must be all-or-nothing: a single DB error rolls back the
whole batch. The simplest way to force a DB error is to make
`generate_certificate_id` return an ID that already exists.

Students do NOT pre-exist. Each row carries `student_name`, and the view
creates one Student per unique name (scoped to the registrar's institution)
inside the same atomic block. These tests pin both behaviors.
"""

from __future__ import annotations

import pytest

from certificates import ids as ids_module
from certificates.models import Certificate
from students.models import Student


URL = "/api/certificates/bulk-create/"


def _payload(*names: str, cohort: int = 7) -> dict:
    """Build a well-formed bulk-create payload with one row per name."""

    return {
        "items": [
            {
                "student_name": name,
                "cohort_number": cohort,
                "degree": "BSc",
                "program": "Math",
                "issued_date": "2026-06-01",
            }
            for name in names
        ]
    }


@pytest.mark.django_db
def test_bulk_create_atomic_on_duplicate_id(api_client, institution, student, monkeypatch):
    """A duplicate certificate_id in the batch must roll back the whole batch.

    Concretely: when the generator collides, neither new Student rows nor
    new Certificate rows may persist.
    """

    # Pre-create a cert with a known id; force the generator to emit that
    # exact id for every row in the upcoming batch.
    existing = Certificate.objects.create(
        certificate_id="ACVS-2026-AAAAAAAA",
        student=student,
        institution=institution,
        cohort_number=1,
        degree="BSc",
        program="CS",
        issued_date="2026-01-01",
    )

    def fake_id() -> str:
        return "ACVS-2026-AAAAAAAA"

    monkeypatch.setattr(ids_module, "generate_certificate_id", fake_id)

    response = api_client.post(URL, _payload(*(["Alice Smith"] * 5)), format="json")

    assert response.status_code == 400, response.content
    # Atomicity: only the pre-created cert remains — no new rows from the batch.
    assert Certificate.objects.count() == 1
    assert Certificate.objects.filter(pk=existing.pk).exists()
    # And no Student was created either — the whole transaction rolled back.
    assert not Student.objects.filter(full_name="Alice Smith").exists()


@pytest.mark.django_db
def test_bulk_create_resolves_new_student_names(api_client, institution):
    """Posting raw names must create Student rows and return nested {id, full_name}.

    Two rows with the same name share one Student; two rows with different
    names get two distinct Students. All created students are scoped to
    the registrar's institution.
    """

    response = api_client.post(
        URL,
        _payload("Alice Smith", "Alice Smith", "Bob Jones"),
        format="json",
    )

    assert response.status_code == 201, response.content
    body = response.json()
    assert len(body) == 3

    # Exactly two distinct students were created.
    assert Student.objects.filter(institution=institution).count() == 2

    # Every row in the response carries a nested student object, not a bare PK.
    student_objs = {row["student"]["full_name"] for row in body}
    assert student_objs == {"Alice Smith", "Bob Jones"}
    for row in body:
        assert isinstance(row["student"], dict)
        assert set(row["student"].keys()) == {"id", "full_name"}
        assert isinstance(row["student"]["id"], int)


@pytest.mark.django_db
def test_bulk_create_does_not_duplicate_existing_student(
    api_client, institution, student,
):
    """Re-using a name that already exists in this institution reuses the Student row."""

    response = api_client.post(
        URL,
        _payload("Ada Lovelace"),  # `student` fixture already has this name
        format="json",
    )

    assert response.status_code == 201, response.content
    # Same Student PK as the fixture.
    assert response.json()[0]["student"]["id"] == student.pk
    assert Student.objects.filter(full_name="Ada Lovelace", institution=institution).count() == 1


@pytest.mark.django_db
def test_bulk_create_students_are_scoped_per_institution(
    api_client, other_api_client, institution, other_institution,
):
    """Two institutions posting the same name get distinct Student rows.

    Mirrors `test_bulk_create_resolves_new_student_names` but on the
    cross-institution axis: the (institution, full_name) pair is what
    identifies a Student, not the name alone.
    """

    own = api_client.post(URL, _payload("Carol Danvers"), format="json")
    other = other_api_client.post(URL, _payload("Carol Danvers"), format="json")
    assert own.status_code == 201
    assert other.status_code == 201

    own_student_id = own.json()[0]["student"]["id"]
    other_student_id = other.json()[0]["student"]["id"]
    assert own_student_id != other_student_id
    assert Student.objects.filter(full_name="Carol Danvers").count() == 2