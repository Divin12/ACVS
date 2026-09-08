"""Content hashing for the on-chain anchor.

Single responsibility: produce a deterministic 32-byte keccak256 over the
editable content fields of a Certificate. The on-chain contract stores this
hash; re-running this function and comparing its output is how we detect
content tampering after anchoring.

The canonical string is part of the wire contract — changing its order,
delimiters, or included fields would invalidate every previously anchored
certificate. New fields added to the editable surface in
`CertificateEditSerializer` (degree, program, issued_date) must also be
added here, AND a test must be added that exercises a change to that field.

`institution` is intentionally NOT in the canonical string. The registrar
who anchors a cert already belongs to one institution by auth-scope, and
including `institution` here would couple every on-chain hash to a Postgres
PK that is an internal implementation detail. Anchoring integrity is about
content, not chain-of-custody of the DB row.
"""

from __future__ import annotations

from web3 import Web3


def compute_content_hash(cert) -> bytes:
    """keccak256 over the canonical pipe-delimited string of editable content.

    Canonical string:
        {certificate_id}|{student.full_name}|{degree}|{program}|
        {issued_date.isoformat()}|{cohort_number}

    Returns raw 32 bytes (the form the contract's `bytes32` parameter
    consumes). For the 0x-prefixed 66-char hex form the wire carries, use
    `content_hash_hex`.
    """
    canonical = (
        f"{cert.certificate_id}|"
        f"{cert.student.full_name}|"
        f"{cert.degree}|"
        f"{cert.program}|"
        f"{cert.issued_date.isoformat()}|"
        f"{cert.cohort_number}"
    )
    return Web3.keccak(text=canonical)


def content_hash_hex(cert) -> str:
    """0x-prefixed lowercase hex of `compute_content_hash(cert)`.

    The form the public verify endpoint exposes to the frontend, the form
    the registrar's "pending_hash" pre-anchor preview displays, and the
    form tests assert against. Note this is *not* what `chain_hash`
    stores: the model stores the unprefixed 64-char form so historical
    callers (and the `max_length=64` field) keep working.
    """
    return "0x" + compute_content_hash(cert).hex()
