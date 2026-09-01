"""Content-hash tests.

These pin the canonical-string contract in `certificates/hashing.py`:

* Same content → same hash (deterministic).
* Each editable field is included (changing any one → different hash).
* `institution` is intentionally NOT included (changing the FK → same hash).
* Wire format matches what the contract stores (Web3.keccak round-trip).
* `CertificateReadSerializer.pending_hash` is null outside grace_period,
  populated (0x-hex) inside it.
"""

from __future__ import annotations

import datetime

import pytest
from web3 import Web3

from certificates.hashing import compute_content_hash, content_hash_hex
from certificates.models import Certificate
from certificates.serializers import CertificateReadSerializer
from institutions.models import Institution
from students.models import Student


@pytest.fixture
def other_institution_2(db) -> Institution:
    return Institution.objects.create(
        name="Other Test University",
        contact_email="registrar2@testuni.edu",
        status=Institution.Status.ACTIVE,
    )


@pytest.fixture
def other_student(institution) -> Student:
    return Student.objects.create(full_name="Grace Hopper", institution=institution)


def _make_cert(student, institution) -> Certificate:
    return Certificate.objects.create(
        certificate_id="ACVS-2026-TEST0001",
        student=student,
        institution=institution,
        cohort_number=1,
        degree="BSc",
        program="CS",
        issued_date=datetime.date(2026, 1, 1),
        status=Certificate.Status.GRACE_PERIOD,
    )


# --- 1. Determinism -------------------------------------------------------

@pytest.mark.django_db
def test_content_hash_is_stable_for_unchanged_cert(institution, student):
    cert = _make_cert(student, institution)
    assert compute_content_hash(cert) == compute_content_hash(cert)
    # Re-fetch — proves the function doesn't depend on identity or in-memory
    # state, only on the field values that survived a round-trip to Postgres.
    cert.refresh_from_db()
    assert compute_content_hash(cert) == compute_content_hash(cert)


# --- 2. Every included field actually contributes -------------------------

@pytest.mark.django_db
@pytest.mark.parametrize(
    ("field", "new_value_factory"),
    [
        pytest.param("full_name", lambda s: "Augusta Lovelace", id="student_full_name"),
        pytest.param("degree", lambda s: "PhD", id="degree"),
        pytest.param("program", lambda s: "Math", id="program"),
        pytest.param("issued_date", lambda s: datetime.date(2026, 6, 15), id="issued_date"),
        pytest.param("cohort_number", lambda s: 7, id="cohort_number"),
    ],
)
def test_content_hash_changes_when_any_field_changes(
    institution, student, other_student, field, new_value_factory,
):
    """Each parameter is one of the editable-content fields. If you add a
    field to the canonical string in hashing.py, add a corresponding case
    here — the parametrize list is the contract.
    """
    cert = _make_cert(student, institution)
    before = compute_content_hash(cert)

    new_value = new_value_factory(student if field != "full_name" else other_student)
    if field == "full_name":
        # Reassign the cert's student via the FK to a different student
        # record so .student.full_name actually changes.
        cert.student = other_student
        cert.save(update_fields=["student"])
    else:
        setattr(cert, field, new_value)
        cert.save(update_fields=[field])

    cert.refresh_from_db()
    after = compute_content_hash(cert)
    assert before != after, (
        f"changing {field} did not change the content hash — "
        f"either the field is missing from the canonical string in "
        f"hashing.py, or this test was added with the wrong factory."
    )


# --- 3. institution is deliberately excluded ------------------------------

@pytest.mark.django_db
def test_content_hash_excludes_institution(
    institution, student, other_institution_2, other_student,
):
    """Changing the cert's institution FK must NOT change the content hash.

    Pins the design decision in `hashing.py`: the registrar's auth scope
    already pins the institution, so coupling every on-chain hash to an
    internal Postgres PK buys nothing and adds a coupling surface.
    """
    cert = _make_cert(student, institution)
    before = compute_content_hash(cert)

    cert.institution = other_institution_2
    cert.save(update_fields=["institution"])

    cert.refresh_from_db()
    after = compute_content_hash(cert)
    assert before == after, (
        "changing institution must not change the content hash — "
        "institution is intentionally excluded from the canonical string."
    )


# --- 4. Wire-format pin against Web3.keccak ------------------------------

@pytest.mark.django_db
def test_content_hash_matches_chain_reader_format(institution, student):
    """The hash is exactly Web3.keccak(text=canonical_string).

    Pins the wire format against silent edits to `hashing.py` — if someone
    swaps the delimiter, swaps Web3.keccak for hashlib.sha256, or reorders
    fields, this test fails.
    """
    cert = _make_cert(student, institution)
    cert.refresh_from_db()  # ensure dates/FKs are fully loaded

    canonical = (
        f"{cert.certificate_id}|"
        f"{cert.student.full_name}|"
        f"{cert.degree}|"
        f"{cert.program}|"
        f"{cert.issued_date.isoformat()}|"
        f"{cert.cohort_number}"
    )
    expected = Web3.keccak(text=canonical)
    assert compute_content_hash(cert) == expected
    # Hex form: 0x + 64 lowercase hex chars.
    h = content_hash_hex(cert)
    assert h.startswith("0x")
    assert len(h) == 66
    assert h == "0x" + expected.hex()


# --- 5. Serializer field shape per status --------------------------------

@pytest.mark.django_db
@pytest.mark.parametrize(
    ("status_value", "expect_populated"),
    [
        pytest.param(Certificate.Status.GRACE_PERIOD, True, id="grace_period_populated"),
        pytest.param(Certificate.Status.ANCHORED, False, id="anchored_null"),
        pytest.param(Certificate.Status.DISABLED, False, id="disabled_null"),
    ],
)
def test_pending_hash_field_only_present_when_grace_period(
    institution, student, status_value, expect_populated,
):
    cert = _make_cert(student, institution)
    cert.status = status_value
    cert.save(update_fields=["status"])

    body = CertificateReadSerializer(cert).data
    if expect_populated:
        assert isinstance(body["pending_hash"], str)
        assert body["pending_hash"].startswith("0x")
        assert len(body["pending_hash"]) == 66
        # And it must equal what the helper produces directly — same
        # contract, no drift allowed between the helper and the field.
        assert body["pending_hash"] == content_hash_hex(cert)
    else:
        assert body["pending_hash"] is None