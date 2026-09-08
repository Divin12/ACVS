"""Per-app conftest for `verification/`.

Shared fixtures that don't belong in the top-level conftest. Keeping the
`make_certificate` factory here means `verification/tests.py` and
`verification/test_chain.py` share one source of truth.
"""

from __future__ import annotations

from certificates.models import Certificate
from institutions.models import Institution
from students.models import Student


def make_certificate(student: Student, institution: Institution, *, status_value: str) -> Certificate:
    """Build a Certificate in the given status with the standard test shape.

    The `f"ACVS-2026-{status_value[:8].upper()}"` ID format is the same
    pattern the production `generate_certificate_id()` uses, so IDs
    stay unique per status in the test DB.
    """
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
