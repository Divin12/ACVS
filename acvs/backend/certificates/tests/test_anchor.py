"""Anchor-recording endpoint tests.

POST /api/certificates/<id>/anchor/

The endpoint is registrar-scoped + institution-scoped, and trusts the
chain (not the client) for `chain_hash`. These tests pin:

* the status gate (only grace_period rows can be anchored);
* the chain confirmation (chain must actually report an anchor);
* the chain-trust model (client-supplied chain_hash is ignored — the
  on-chain value wins);
* the content-hash mismatch check (on-chain hash must equal
  compute_content_hash(cert) for the current row);
* the audit field (`tx_hash` is required, stored verbatim);
* the happy path (status flips, chain_hash and tx_hash persist);
* idempotency (concurrent calls cannot double-write);
* scoping (other registrars cannot anchor);
* 404 for unknown certs.

The chain reader is monkeypatched through the `chain_anchored_with`
fixture (positive case) or the default `_DisabledReader` (negative case).
No real web3 or Ganache is involved.
"""

from __future__ import annotations

import datetime

import pytest

from certificates.hashing import compute_content_hash
from certificates.models import Certificate
from institutions.models import Institution
from students.models import Student


@pytest.fixture
def grace_cert(student, institution) -> Certificate:
    return Certificate.objects.create(
        certificate_id="ACVS-2026-ANCHOR01",
        student=student,
        institution=institution,
        cohort_number=1,
        degree="BSc",
        program="CS",
        issued_date=datetime.date(2026, 1, 1),
        status=Certificate.Status.GRACE_PERIOD,
    )


# Fake-but-valid-looking tx hash; we don't check format on the way in,
# just that we round-trip exactly what the client sent.
SAMPLE_TX_HASH = "0x" + "ab" * 32


# --- 1. Status gate -------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.parametrize(
    "status_value",
    [Certificate.Status.ANCHORED, Certificate.Status.DISABLED],
)
def test_anchor_rejects_non_grace_period_row(
    api_client, student, institution, status_value,
):
    cert = Certificate.objects.create(
        certificate_id=f"ACVS-2026-{status_value[:8].upper()}",
        student=student,
        institution=institution,
        cohort_number=1,
        degree="BSc",
        program="CS",
        issued_date="2026-01-01",
        status=status_value,
    )

    response = api_client.post(
        f"/api/certificates/{cert.certificate_id}/anchor/",
        {"tx_hash": SAMPLE_TX_HASH},
        format="json",
    )

    assert response.status_code == 400
    assert "status" in response.json().get("details", {})
    cert.refresh_from_db()
    assert cert.status == status_value  # unchanged
    assert cert.tx_hash == ""  # unchanged


# --- 2. Chain says "not anchored" → 400, nothing changes ------------------

@pytest.mark.django_db
def test_anchor_rejects_when_chain_does_not_show_anchored(api_client, grace_cert):
    """Default _DisabledReader stub → get_anchored_hash returns None.

    The endpoint must 400 with a clear "wait for the MetaMask tx to
    confirm and retry" message, and must NOT change the cert row.
    """
    response = api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/anchor/",
        {"tx_hash": SAMPLE_TX_HASH},
        format="json",
    )

    assert response.status_code == 400
    body = response.json()
    assert "chain" in body.get("details", {})

    grace_cert.refresh_from_db()
    assert grace_cert.status == Certificate.Status.GRACE_PERIOD
    assert grace_cert.chain_hash == ""
    assert grace_cert.tx_hash == ""


# --- 3. Trust the chain, not the client ----------------------------------

@pytest.mark.django_db
def test_anchor_stores_real_on_chain_hash_not_client_supplied(
    api_client, grace_cert, chain_anchored_with,
):
    """If the client sends `chain_hash` in the body, the endpoint must
    ignore it and store what the chain returned instead. Pinning the
    trust-the-chain contract: only the on-chain hash becomes `chain_hash`.
    """
    real_on_chain_hash = compute_content_hash(grace_cert)
    chain_anchored_with(bytes(real_on_chain_hash))

    # Note the deliberately-wrong client value. It must not appear in
    # any field of the persisted row.
    response = api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/anchor/",
        {
            "tx_hash": SAMPLE_TX_HASH,
            "chain_hash": "0x" + "ee" * 32,  # ignored / rejected
        },
        format="json",
    )

    assert response.status_code == 200, response.content
    grace_cert.refresh_from_db()
    assert grace_cert.chain_hash == real_on_chain_hash.hex()
    assert grace_cert.chain_hash != "ee" * 32


# --- 4. Happy path -------------------------------------------------------

@pytest.mark.django_db
def test_anchor_flips_status_and_records_hash(
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
    body = response.json()
    assert body["status"] == Certificate.Status.ANCHORED
    # After anchoring, pending_hash is no longer meaningful — null.
    assert body["pending_hash"] is None

    grace_cert.refresh_from_db()
    assert grace_cert.status == Certificate.Status.ANCHORED
    assert grace_cert.chain_hash == on_chain_hash.hex()
    assert grace_cert.tx_hash == SAMPLE_TX_HASH


# --- 5. Content-hash mismatch rejection ----------------------------------

@pytest.mark.django_db
def test_anchor_rejects_hash_mismatch_between_chain_and_recomputed_content(
    api_client, grace_cert, chain_anchored_with,
):
    """The chain says this cert is anchored with hash H, but H does NOT
    match `compute_content_hash(cert)` for the current row.

    Likely causes: the registrar copied a stale `pending_hash` (a PATCH
    landed between the time they read pending_hash and the time they
    signed in MetaMask), or they signed a different value out-of-band.

    The endpoint MUST 400 with a clear "hash" message, MUST NOT flip
    status, and MUST NOT write any of chain_hash / tx_hash. This is the
    one moment where we can still refuse to permanently record drift.
    """
    # Any 32 bytes that don't match compute_content_hash(grace_cert).
    bogus = b"\\xff" * 32
    assert bogus != bytes(compute_content_hash(grace_cert))
    chain_anchored_with(bogus)

    response = api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/anchor/",
        {"tx_hash": SAMPLE_TX_HASH},
        format="json",
    )

    assert response.status_code == 400
    assert "hash" in response.json().get("details", {})

    grace_cert.refresh_from_db()
    assert grace_cert.status == Certificate.Status.GRACE_PERIOD
    assert grace_cert.chain_hash == ""
    assert grace_cert.tx_hash == ""


# --- 6. Concurrent idempotency ------------------------------------------

@pytest.mark.django_db
def test_anchor_is_idempotent_under_concurrent_calls(
    api_client, grace_cert, chain_anchored_with,
):
    """Two POSTs in sequence. The first succeeds and flips status. The
    second sees status != grace_period and 400s. No double-write possible.
    """
    on_chain_hash = compute_content_hash(grace_cert)
    chain_anchored_with(bytes(on_chain_hash))

    first = api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/anchor/",
        {"tx_hash": SAMPLE_TX_HASH},
        format="json",
    )
    assert first.status_code == 200

    grace_cert.refresh_from_db()
    chain_hash_after_first = grace_cert.chain_hash
    tx_hash_after_first = grace_cert.tx_hash

    second = api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/anchor/",
        {"tx_hash": "0x" + "99" * 32},  # different tx hash to prove it was ignored
        format="json",
    )
    assert second.status_code == 400
    assert "status" in second.json().get("details", {})

    grace_cert.refresh_from_db()
    assert grace_cert.chain_hash == chain_hash_after_first
    assert grace_cert.tx_hash == tx_hash_after_first


# --- 7. tx_hash is required ----------------------------------------------

@pytest.mark.django_db
def test_anchor_requires_tx_hash(api_client, grace_cert, chain_anchored_with):
    on_chain_hash = compute_content_hash(grace_cert)
    chain_anchored_with(bytes(on_chain_hash))

    response = api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/anchor/",
        {},  # no tx_hash
        format="json",
    )

    assert response.status_code == 400
    assert "tx_hash" in response.json().get("details", {})

    grace_cert.refresh_from_db()
    assert grace_cert.status == Certificate.Status.GRACE_PERIOD
    assert grace_cert.tx_hash == ""


# --- 8. Unknown certificate -----------------------------------------------

@pytest.mark.django_db
def test_anchor_rejects_unknown_cert(api_client):
    response = api_client.post(
        "/api/certificates/ACVS-2026-DOESNTEX/anchor/",
        {"tx_hash": SAMPLE_TX_HASH},
        format="json",
    )
    assert response.status_code == 404


# --- 9. Institution scoping ----------------------------------------------

@pytest.mark.django_db
def test_anchor_scopes_to_institution(other_api_client, grace_cert):
    """A registrar from a different institution must NOT be able to
    anchor another institution's cert. Same scope pattern as the
    edit/list views.
    """
    response = other_api_client.post(
        f"/api/certificates/{grace_cert.certificate_id}/anchor/",
        {"tx_hash": SAMPLE_TX_HASH},
        format="json",
    )
    assert response.status_code == 403

    grace_cert.refresh_from_db()
    assert grace_cert.status == Certificate.Status.GRACE_PERIOD
    assert grace_cert.chain_hash == ""
    assert grace_cert.tx_hash == ""