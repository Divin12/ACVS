"""chain_state field on the public verify endpoint.

Per the approved plan, the verify endpoint returns a `chain_state` field
with one of: not_yet_anchored, unknown, disabled, confirmed, unreachable.

These tests pin the contract:
  * grace_period certs short-circuit to "not_yet_anchored" (no chain call)
  * empty CHAIN_REGISTRY_ADDRESS → "unreachable" (no Web3 constructed)
  * the three chain-driven values come back from a stubbed reader
  * not_found still 404s without touching the chain

The reader is monkeypatched through conftest fixtures; no real web3 or
Ganache is involved. `CHAIN_REGISTRY_ADDRESS=""` is set in settings_test.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from certificates.models import Certificate
from verification.conftest import make_certificate


# --- 1. Grace-period short-circuit (the new distinction) ----------------
# This is the test that fails if "unreachable" leaks in for grace_period.
# The sentinel fixture raises if make_reader() is ever called; the test
# passing proves the short-circuit runs.

@pytest.mark.django_db
def test_chain_state_not_yet_anchored_for_grace_period_cert(
    student, institution, chain_state_must_not_be_called,
):
    client = APIClient()
    cert = make_certificate(student, institution, status_value=Certificate.Status.GRACE_PERIOD)

    response = client.get(f"/api/verify/{cert.certificate_id}/")

    assert response.status_code == 200
    body = response.json()
    assert body["chain_state"] == "not_yet_anchored"
    assert body["result"] == "valid"  # grace_period still presents as valid
    assert body["status"] == "grace_period"


# --- 2. Chain disabled in config → "unreachable" -------------------------
# The default for tests is CHAIN_REGISTRY_ADDRESS="", so make_reader()
# returns the _DisabledReader stub. No chain_state fixture is set here;
# this asserts the default-disabled behavior directly.

@pytest.mark.django_db
def test_chain_state_unreachable_when_chain_disabled(student, institution):
    client = APIClient()
    cert = make_certificate(student, institution, status_value=Certificate.Status.ANCHORED)

    response = client.get(f"/api/verify/{cert.certificate_id}/")

    assert response.status_code == 200
    body = response.json()
    assert body["chain_state"] == "unreachable"
    assert body["result"] == "valid"


# --- 3-5. Stubbed reader: confirmed / disabled / unknown -----------------
# The three chain-driven values differ only in the stubbed value and the
# expected string. Postgres `result` stays "valid" for the disabled and
# unknown cases — the chain_state carries the chain's signal, the
# frontend can compare the two and flag divergence.

@pytest.mark.django_db
@pytest.mark.parametrize(
    ("stubbed_chain_state", "expected_chain_state"),
    [
        pytest.param("confirmed", "confirmed", id="confirmed"),
        pytest.param("disabled", "disabled", id="disabled_on_chain_overrides_postgres"),
        pytest.param("unknown", "unknown", id="unknown_when_chain_says_unknown"),
    ],
)
def test_chain_state_from_stubbed_reader(
    student, institution, chain_state, stubbed_chain_state, expected_chain_state,
):
    chain_state(stubbed_chain_state)
    client = APIClient()
    cert = make_certificate(student, institution, status_value=Certificate.Status.ANCHORED)

    response = client.get(f"/api/verify/{cert.certificate_id}/")

    assert response.status_code == 200
    body = response.json()
    assert body["chain_state"] == expected_chain_state
    assert body["result"] == "valid"


# --- 6. not_found path: 404, no chain call -------------------------------
# The view's not_found branch must not invoke make_reader() at all.

@pytest.mark.django_db
def test_chain_read_skipped_on_not_found(chain_state_must_not_be_called):
    client = APIClient()

    response = client.get("/api/verify/ACVS-2026-NOPE0000/")

    assert response.status_code == 404
    assert response.json()["result"] == "not_found"


# --- 7. Malformed CHAIN_REGISTRY_ADDRESS degrades to "unreachable" -------
# A misconfigured address (operator typo in .env) must not 500 every
# request. make_reader() catches the ValueError from to_checksum_address
# and returns _DisabledReader; the verify endpoint then reports
# chain_state="unreachable" with HTTP 200.
#
# Two tests pin this contract:
#  * the module-level test exercises the factory directly
#  * the HTTP-level test exercises the view (the actual production path)
#    and proves the wireup is intact under a bad config


@pytest.mark.django_db
def test_make_reader_falls_back_to_disabled_on_malformed_address(
    settings, clear_reader_cache,
):
    settings.CHAIN_REGISTRY_ADDRESS = "not-a-real-address"

    from verification import chain as chain_module
    reader = chain_module.make_reader()

    assert isinstance(reader, chain_module._DisabledReader)
    assert reader.get_chain_state("any-id") == "unreachable"


@pytest.mark.django_db
def test_chain_state_unreachable_when_address_malformed(
    student, institution, settings, clear_reader_cache,
):
    # With the cache cleared, the view's call to make_reader() rebuilds
    # the reader from current settings; the bad address triggers the
    # _DisabledReader fallback in the factory.
    settings.CHAIN_REGISTRY_ADDRESS = "not-a-real-address"

    client = APIClient()
    cert = make_certificate(student, institution, status_value=Certificate.Status.ANCHORED)

    response = client.get(f"/api/verify/{cert.certificate_id}/")

    assert response.status_code == 200
    body = response.json()
    assert body["chain_state"] == "unreachable"
    assert body["result"] == "valid"  # Postgres still says valid
