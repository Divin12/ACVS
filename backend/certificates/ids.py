"""Certificate ID generation.

Format: ACVS-{YYYY}-{XXXXXXXX} (18 chars, ASCII). The 8-char suffix uses
`secrets` (not `random`) for collision resistance; 36^8 ≈ 2.8×10¹², more
than enough for a pilot. The total length stays under 32 bytes UTF-8, so
keccak256(utf8(certificate_id)) fits in a Solidity bytes32.

Server-side only. Clients never supply certificate_id; they receive it
in the bulk-create response and reference it on subsequent reads.
"""

from __future__ import annotations

import datetime as _dt
import secrets
import string

_ALPHABET = string.ascii_uppercase + string.digits
_RAND_LEN = 8


def generate_certificate_id() -> str:
    year = _dt.date.today().year
    rand = "".join(secrets.choice(_ALPHABET) for _ in range(_RAND_LEN))
    return f"ACVS-{year}-{rand}"
