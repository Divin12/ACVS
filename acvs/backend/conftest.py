"""Test fixtures and pytest-django configuration."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from institutions.models import Institution
from students.models import Student


@pytest.fixture
def unauthenticated_client() -> APIClient:
    """An APIClient with no authentication (for public endpoints)."""
    return APIClient()


@pytest.fixture
def institution(db) -> Institution:
    return Institution.objects.create(
        name="Test University",
        contact_email="registrar@testuni.edu",
        status=Institution.Status.ACTIVE,
    )


@pytest.fixture
def other_institution(db) -> Institution:
    return Institution.objects.create(
        name="Other University",
        contact_email="registrar@otheruni.edu",
        status=Institution.Status.ACTIVE,
    )


@pytest.fixture
def registrar_user(institution) -> User:
    return User.objects.create_user(
        email="registrar@testuni.edu",
        password="Th1sIsAValidPass!",
        role=User.Role.REGISTRAR,
        institution=institution,
    )


@pytest.fixture
def admin_user(db) -> User:
    return User.objects.create_user(
        email="admin@acvs.local",
        password="Th1sIsAValidPass!",
        role=User.Role.ADMIN,
        institution=None,
    )


@pytest.fixture
def other_registrar(other_institution) -> User:
    return User.objects.create_user(
        email="registrar@otheruni.edu",
        password="Th1sIsAValidPass!",
        role=User.Role.REGISTRAR,
        institution=other_institution,
    )


@pytest.fixture
def api_client(registrar_user) -> APIClient:
    """An APIClient authenticated as the registrar, with a fresh JWT."""

    client = APIClient()
    refresh = RefreshToken.for_user(registrar_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def admin_api_client(admin_user) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(admin_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def other_api_client(other_registrar) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(other_registrar)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def student(institution) -> Student:
    return Student.objects.create(full_name="Ada Lovelace", institution=institution)


# --- Chain / web3 test fixtures -----------------------------------------
# The reader is constructed lazily at request time inside the views that
# call it, so we monkeypatch the bound name each view uses. This keeps
# the chain code path fully under test control: no real Web3, no real
# Ganache.
#
# `_patch_make_reader_at(path, replacement)` takes the dotted path to
# the bound name (e.g. "verification.views.make_reader" or
# "certificates.views.make_reader") and installs the replacement there.
# Tests pick which path matches the view they're exercising.

def _patch_make_reader_at(monkeypatch, path: str, replacement) -> None:
    monkeypatch.setattr(path, replacement)


# Path used by the verify endpoint (`verification.views.PublicVerifyView`).
_PATCH_VERIFY = "verification.views.make_reader"
# Path used by the anchor endpoint (`certificates.views.AnchorCertificateView`).
_PATCH_ANCHOR = "certificates.views.make_reader"


@pytest.fixture
def chain_state(monkeypatch):
    """Force the verify endpoint to return a specific chain_state.

    Usage: `chain_state("confirmed")` — the stub reader always reports
    the configured value for any certificate_id. Tests that need the
    default behavior (DisabledReader stub, "unreachable") do not call
    this fixture.
    """

    class _Stub:
        def __init__(self, value: str) -> None:
            self._value = value

        def get_chain_state(self, _cert_id: str) -> str:
            return self._value

    def _set(value: str) -> None:
        _patch_make_reader_at(monkeypatch, _PATCH_VERIFY, lambda: _Stub(value))

    return _set


@pytest.fixture
def chain_state_must_not_be_called(monkeypatch):
    """Sentinel that raises if the verify endpoint ever asks the chain.

    Used by the grace-period short-circuit test: a grace-period cert
    should never touch make_reader(); if it does, this fixture fires.
    """

    def _explode():
        raise AssertionError("make_reader() was called for a grace_period cert")

    _patch_make_reader_at(monkeypatch, _PATCH_VERIFY, _explode)


@pytest.fixture
def clear_reader_cache():
    """Clear make_reader()'s lru_cache before and after the test.

    Use this in any test that mutates `settings.CHAIN_REGISTRY_ADDRESS`
    or other chain config and wants make_reader() to actually re-read
    the new values. Without clearing, a reader built by a prior test
    (or by the test's own first call) survives in the cache and the
    new config has no effect.
    """
    from verification import chain as chain_module

    chain_module.make_reader.cache_clear()
    yield
    chain_module.make_reader.cache_clear()


@pytest.fixture
def chain_anchored_with(monkeypatch):
    """Force the chain reader to report a specific anchored hash.

    Usage: `chain_anchored_with(b"\\xaa" * 32)` — the stub reader returns
    that exact 32-byte hash from `get_anchored_hash`, and reports
    `chain_state="confirmed"` so other verify-path callers stay happy.

    The anchor-recording endpoint uses this to test the happy path without
    running Ganache: it asks the chain for the hash, gets the stubbed
    value, then verifies it matches `compute_content_hash(cert)` before
    flipping the cert's status.

    Tests that need a chain that says "not yet anchored" (None) use the
    default `_DisabledReader` fallback (don't call this fixture).

    Tests that need a chain that says "anchored with a mismatching hash"
    (to exercise the content-hash-mismatch rejection path) just pass any
    bytes here that don't equal `compute_content_hash(cert)` — the same
    fixture works either way; the test's choice of bytes is what sets up
    the scenario.
    """

    class _Stub:
        def __init__(self, on_chain_hash: bytes) -> None:
            self._hash = on_chain_hash

        def get_anchored_hash(self, _cert_id: str):
            return self._hash

        def get_chain_state(self, _cert_id: str) -> str:
            return CONFIRMED

    # Imported here (not at module top) to avoid a circular import on
    # verification.chain — same lazy pattern existing fixtures use.
    from verification.chain import CONFIRMED

    def _set(on_chain_hash: bytes) -> None:
        _patch_make_reader_at(monkeypatch, _PATCH_ANCHOR, lambda: _Stub(on_chain_hash))

    return _set
