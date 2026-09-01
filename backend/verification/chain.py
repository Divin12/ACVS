"""Read-only web3 client for the CertificateRegistry contract.

Single function surface: getCertificate(bytes32) -> (bytes32, bool, bool).
Maps the (disabled, anchored) tuple to a chain_state string the verify
endpoint can return to the frontend. Never signs or submits transactions.

The grace-period short-circuit ("not_yet_anchored") lives in the view, not
here — the reader only emits chain-driven values.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from eth_typing import ChecksumAddress
from web3 import Web3
from web3.exceptions import Web3Exception

log = logging.getLogger(__name__)

# ABI path: defaults to a sibling of backend/ in the monorepo. Override
# via settings.CONTRACTS_ABI_PATH (e.g. for a different checkout layout).
# If the file is missing we fail fast with a clear message, not a vague
# web3 error.
_DEFAULT_ABI_PATH = (
    Path(settings.BASE_DIR).parent
    / "contracts"
    / "build"
    / "contracts"
    / "CertificateRegistry.abi.json"
)


@lru_cache(maxsize=1)
def _load_abi() -> list[dict]:
    path = Path(getattr(settings, "CONTRACTS_ABI_PATH", _DEFAULT_ABI_PATH))
    if not path.exists():
        raise FileNotFoundError(
            f"CertificateRegistry ABI not found at {path}. "
            f"Run `npm run compile` in the contracts/ directory and "
            f"re-export the ABI to build/contracts/CertificateRegistry.abi.json."
        )
    with path.open() as f:
        artifact = json.load(f)
    # Accept either {"abi": [...]} (minimal) or full Truffle artifact.
    return artifact["abi"] if isinstance(artifact, dict) and "abi" in artifact else artifact


# chain_state values. The reader emits the four chain-driven values; the
# view's grace_period short-circuit emits NOT_YET_ANCHORED directly.
NOT_YET_ANCHORED = "not_yet_anchored"
UNKNOWN = "unknown"
DISABLED = "disabled"
CONFIRMED = "confirmed"
UNREACHABLE = "unreachable"


class _DisabledReader:
    """Used when CHAIN_REGISTRY_ADDRESS is empty — never touches the network.

    Always reports UNREACHABLE so the frontend knows we couldn't ask.
    NOT_YET_ANCHORED is a per-cert status, not a per-config state.
    """

    def get_chain_state(self, certificate_id: str) -> str:
        return UNREACHABLE

    def get_anchored_hash(self, certificate_id: str) -> bytes | None:
        """No chain is configured — can never confirm an anchor.

        Always returns None so the anchor endpoint surfaces a clear "chain
        not reachable / configured" error instead of pretending the cert
        isn't on chain.
        """
        return None


class _Web3Reader:
    def __init__(self, rpc_url: str, address: ChecksumAddress, timeout: int):
        self._w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
        self._contract = self._w3.eth.contract(address=address, abi=_load_abi())

    def get_chain_state(self, certificate_id: str) -> str:
        try:
            cert_id_bytes32 = Web3.keccak(text=certificate_id)
            _hash, disabled, anchored = self._contract.functions.getCertificate(
                cert_id_bytes32
            ).call()
        except (Web3Exception, ValueError, OSError) as exc:
            log.warning("Chain read failed for %s: %s", certificate_id, exc)
            return UNREACHABLE
        if not anchored:
            return UNKNOWN
        if disabled:
            return DISABLED
        return CONFIRMED

    def get_anchored_hash(self, certificate_id: str) -> bytes | None:
        """Return the 32-byte hash the chain has stored for this cert.

        Returns None when:
          * the chain confirms the cert was never anchored (the contract
            returns zero + `anchored=False`); or
          * the RPC call fails for any reason (same broad-fail policy as
            `get_chain_state` — network glitches must not flip a record's
            status; the registrar retries).

        Returns the raw 32-byte hash when the contract says `anchored=True`,
        regardless of the `disabled` flag — once anchored, the hash is what
        it is. The anchor endpoint re-validates that the hash matches the
        cert's current recomputed content before accepting it.
        """
        try:
            cert_id_bytes32 = Web3.keccak(text=certificate_id)
            on_chain_hash, _disabled, anchored = self._contract.functions.getCertificate(
                cert_id_bytes32
            ).call()
        except (Web3Exception, ValueError, OSError) as exc:
            log.warning("Chain read failed for %s: %s", certificate_id, exc)
            return None
        if not anchored:
            return None
        return on_chain_hash


@lru_cache(maxsize=1)
def make_reader() -> _Web3Reader | _DisabledReader:
    """Pick the right reader based on settings, cached at module scope.

    The reader is stateless (no per-request data) and the config it reads
    doesn't change at runtime, so we build it once and reuse it. This also
    reuses HTTPProvider's underlying requests.Session, keeping TCP/TLS
    keep-alive alive across requests.

    Empty CHAIN_REGISTRY_ADDRESS = chain disabled = _DisabledReader.
    A non-empty but malformed address is treated the same way: we fall
    back to _DisabledReader, log a warning, and the verify endpoint
    returns chain_state="unreachable" instead of 500-ing on every request.
    """
    address = settings.CHAIN_REGISTRY_ADDRESS
    if not address:
        return _DisabledReader()
    try:
        checksum_address = Web3.to_checksum_address(address)
    except ValueError as exc:
        log.warning(
            "CHAIN_REGISTRY_ADDRESS=%r is not a valid Ethereum address (%s); "
            "chain reads are disabled. Fix the env var to enable them.",
            address, exc,
        )
        return _DisabledReader()
    return _Web3Reader(
        rpc_url=settings.WEB3_RPC_URL,
        address=checksum_address,
        timeout=settings.WEB3_RPC_TIMEOUT,
    )
