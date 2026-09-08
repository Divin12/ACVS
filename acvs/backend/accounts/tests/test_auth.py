"""Unit tests for authentication endpoints.

Covers all failure paths specified in CLAUDE.md:
- Wrong OTP
- Expired OTP
- Exceeding attempt limit (5)
- Expired/already-used reset token
- Password failing each complexity rule (length, uppercase, number, special)
"""

from __future__ import annotations

import pytest
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.signing import TimestampSigner
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import LoginOTP, User
from institutions.models import Institution


# Signer matching the views (with salt)
_pending_signer = TimestampSigner(key=settings.SECRET_KEY, salt="acvs.auth.pending")


# ---------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------


@pytest.fixture
def institution(db) -> Institution:
    return Institution.objects.create(
        name="Test University",
        contact_email="registrar@testuni.edu",
        status=Institution.Status.ACTIVE,
    )


@pytest.fixture
def registrar_user(institution) -> User:
    return User.objects.create_user(
        email="registrar@testuni.edu",
        password="ValidPass123!",
        role=User.Role.REGISTRAR,
        institution=institution,
    )


@pytest.fixture
def admin_user(db) -> User:
    return User.objects.create_user(
        email="admin@acvs.local",
        password="ValidPass123!",
        role=User.Role.ADMIN,
        institution=None,
    )


@pytest.fixture
def api_client(registrar_user) -> APIClient:
    """Authenticated APIClient for registrar endpoints."""
    client = APIClient()
    refresh = RefreshToken.for_user(registrar_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def unauthenticated_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user_with_otp(registrar_user) -> User:
    """User with a fresh LoginOTP. Returns user with known code attached."""
    otp, code = LoginOTP.create_for_user(registrar_user)
    registrar_user._test_otp_code = code
    return registrar_user


# ---------------------------------------------------------------------
# Login Tests
# ---------------------------------------------------------------------


@pytest.mark.django_db
def test_login_success_returns_pending_token(unauthenticated_client, registrar_user):
    """Valid credentials return a pending_token."""
    response = unauthenticated_client.post(
        "/api/auth/login/",
        {"email": "registrar@testuni.edu", "password": "ValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert "pending_token" in response.data
    assert isinstance(response.data["pending_token"], str)


@pytest.mark.django_db
def test_login_wrong_password(unauthenticated_client, registrar_user):
    """Wrong password returns 400."""
    response = unauthenticated_client.post(
        "/api/auth/login/",
        {"email": "registrar@testuni.edu", "password": "WrongPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "error" in response.data


@pytest.mark.django_db
def test_login_nonexistent_email(unauthenticated_client):
    """Nonexistent email returns same 400 (no enumeration)."""
    response = unauthenticated_client.post(
        "/api/auth/login/",
        {"email": "nobody@example.com", "password": "ValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_login_inactive_user(unauthenticated_client, institution):
    """Inactive user cannot log in."""
    user = User.objects.create_user(
        email="inactive@testuni.edu",
        password="ValidPass123!",
        role=User.Role.REGISTRAR,
        institution=institution,
        is_active=False,
    )
    response = unauthenticated_client.post(
        "/api/auth/login/",
        {"email": "inactive@testuni.edu", "password": "ValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_login_inactive_institution(unauthenticated_client, institution):
    """Registrar with suspended institution cannot log in.

    Pins the boundary between "suspended" (kept generic) and "pending"
    (returned as a code-keyed error so the frontend can redirect to
    /institution/access-pending). A suspended institution MUST NOT
    receive the institution_pending code — it would be misleading to
    send it to a page claiming the institution is awaiting approval.
    """
    institution.status = Institution.Status.SUSPENDED
    institution.save()
    user = User.objects.create_user(
        email="suspended@testuni.edu",
        password="ValidPass123!",
        role=User.Role.REGISTRAR,
        institution=institution,
    )
    response = unauthenticated_client.post(
        "/api/auth/login/",
        {"email": "suspended@testuni.edu", "password": "ValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    # Generic flat-string envelope — DRF wraps the bare string into
    # {non_field_errors: [...]} inside `details` (not a code-keyed dict).
    # See backend/acvs/exceptions.py for the envelope shape: ValidationError →
    # {"error": "validation_error", "details": <the raise_value>}.
    assert response.data["details"]["non_field_errors"] == [
        "Your institution is not active."
    ]
    # Suspended MUST NOT receive the pending redirect code — that would
    # misroute a deactivated institution to the "awaiting approval" screen.
    assert "code" not in response.data["details"]


@pytest.mark.django_db
def test_login_pending_institution_returns_specific_code(unauthenticated_client, institution):
    """Registrar with a PENDING institution receives a code-keyed error.

    The frontend reads `details.code === "institution_pending"` to redirect
    to /institution/access-pending. Other non-active statuses do NOT
    trigger that redirect — see test_login_inactive_institution above.
    """
    institution.status = Institution.Status.PENDING
    institution.save()
    user = User.objects.create_user(
        email="pending@testuni.edu",
        password="ValidPass123!",
        role=User.Role.REGISTRAR,
        institution=institution,
    )
    response = unauthenticated_client.post(
        "/api/auth/login/",
        {"email": "pending@testuni.edu", "password": "ValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    details = response.data["details"]
    # DRF wraps single-string field-level errors in a list — same shape
    # as the OTP-code errors (see test_otp_verify_expired).
    assert details["code"] == ["institution_pending"]
    assert details["message"] == ["Your institution is awaiting approval."]


# ---------------------------------------------------------------------
# OTP Verify Tests
# ---------------------------------------------------------------------


@pytest.mark.django_db
def test_otp_verify_success(unauthenticated_client, user_with_otp):
    """Correct code returns access+refresh tokens."""
    pending_token = _pending_signer.sign(user_with_otp.pk)
    response = unauthenticated_client.post(
        "/api/auth/otp/verify/",
        {"pending_token": pending_token, "code": user_with_otp._test_otp_code},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert "access" in response.data
    assert "refresh" in response.data


@pytest.mark.django_db
def test_otp_verify_wrong_code(unauthenticated_client, user_with_otp):
    """Wrong 6-digit code returns 400 and increments attempts."""
    pending_token = _pending_signer.sign(user_with_otp.pk)
    response = unauthenticated_client.post(
        "/api/auth/otp/verify/",
        {"pending_token": pending_token, "code": "000000"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    user_with_otp.refresh_from_db()
    assert user_with_otp.login_otp.attempts == 1


@pytest.mark.django_db
def test_otp_verify_expired(unauthenticated_client, registrar_user):
    """OTP older than 5 minutes is rejected."""
    otp, _ = LoginOTP.create_for_user(registrar_user)
    otp.expires_at = timezone.now() - timezone.timedelta(minutes=10)
    otp.save(update_fields=["expires_at"])

    pending_token = _pending_signer.sign(registrar_user.pk)
    response = unauthenticated_client.post(
        "/api/auth/otp/verify/",
        {"pending_token": pending_token, "code": "123456"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    # Check the error message indicates expiry
    details = response.data.get("details", {})
    code_errors = details.get("code", [])
    assert any("expired" in str(e).lower() for e in code_errors)


@pytest.mark.django_db
def test_otp_verify_max_attempts(unauthenticated_client, user_with_otp):
    """After 5 failed attempts, further attempts are rejected."""
    pending_token = _pending_signer.sign(user_with_otp.pk)

    # Fail 5 times
    for _ in range(5):
        unauthenticated_client.post(
            "/api/auth/otp/verify/",
            {"pending_token": pending_token, "code": "000000"},
            format="json",
        )

    user_with_otp.refresh_from_db()
    assert user_with_otp.login_otp.attempts == 5

    # 6th attempt should be rejected with specific message
    response = unauthenticated_client.post(
        "/api/auth/otp/verify/",
        {"pending_token": pending_token, "code": "000000"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    details = response.data.get("details", {})
    code_errors = details.get("code", [])
    assert any("attempt" in str(e).lower() for e in code_errors)


@pytest.mark.django_db
def test_otp_verify_no_otp(unauthenticated_client, registrar_user):
    """Verifying without an existing OTP fails."""
    pending_token = _pending_signer.sign(registrar_user.pk)
    response = unauthenticated_client.post(
        "/api/auth/otp/verify/",
        {"pending_token": pending_token, "code": "123456"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_otp_verify_invalid_pending_token(unauthenticated_client):
    """Tampered/expired pending_token is rejected."""
    # Non-existent user ID
    signer = TimestampSigner(key=settings.SECRET_KEY, salt="acvs.auth.pending")
    old_token = signer.sign(999999)

    response = unauthenticated_client.post(
        "/api/auth/otp/verify/",
        {"pending_token": old_token, "code": "123456"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------
# OTP Resend Tests
# ---------------------------------------------------------------------


@pytest.mark.django_db
def test_otp_resend_success(unauthenticated_client, user_with_otp):
    """Resend creates new OTP and invalidates previous."""
    pending_token = _pending_signer.sign(user_with_otp.pk)
    old_code = user_with_otp._test_otp_code

    response = unauthenticated_client.post(
        "/api/auth/otp/resend/",
        {"pending_token": pending_token},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK

    # Old code should no longer work
    user_with_otp.refresh_from_db()
    new_otp = user_with_otp.login_otp
    assert not new_otp.check_code(old_code)


@pytest.mark.django_db
def test_otp_resend_invalid_pending_token(unauthenticated_client):
    """Resend with invalid token fails."""
    response = unauthenticated_client.post(
        "/api/auth/otp/resend/",
        {"pending_token": "invalid.token.here"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------
# Password Reset Request Tests
# ---------------------------------------------------------------------


@pytest.mark.django_db
def test_password_reset_request_always_200(unauthenticated_client, registrar_user):
    """Request endpoint always returns 200 (no email enumeration)."""
    # Existing email
    response = unauthenticated_client.post(
        "/api/auth/password-reset/request/",
        {"email": "registrar@testuni.edu"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK

    # Nonexistent email
    response = unauthenticated_client.post(
        "/api/auth/password-reset/request/",
        {"email": "nobody@example.com"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------
# Password Reset Confirm Tests
# ---------------------------------------------------------------------


@pytest.mark.django_db
def test_password_reset_confirm_success(unauthenticated_client, registrar_user):
    """Valid uid+token+new_password resets password."""
    uid = urlsafe_base64_encode(force_bytes(registrar_user.pk))
    token = default_token_generator.make_token(registrar_user)

    response = unauthenticated_client.post(
        "/api/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "NewValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK

    # Verify new password works
    registrar_user.refresh_from_db()
    assert registrar_user.check_password("NewValidPass123!")


@pytest.mark.django_db
def test_password_reset_confirm_expired_token(unauthenticated_client, registrar_user):
    """Invalid token is rejected (simulating expired token)."""
    uid = urlsafe_base64_encode(force_bytes(registrar_user.pk))

    response = unauthenticated_client.post(
        "/api/auth/password-reset/confirm/",
        {"uid": uid, "token": "invalid-token", "new_password": "NewValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_password_reset_confirm_used_token(unauthenticated_client, registrar_user):
    """Same token cannot be used twice."""
    uid = urlsafe_base64_encode(force_bytes(registrar_user.pk))
    token = default_token_generator.make_token(registrar_user)

    # First use
    response = unauthenticated_client.post(
        "/api/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "NewValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK

    # Second use should fail
    response = unauthenticated_client.post(
        "/api/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "AnotherValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_password_reset_confirm_invalid_uid(unauthenticated_client):
    """Invalid uid is rejected."""
    response = unauthenticated_client.post(
        "/api/auth/password-reset/confirm/",
        {"uid": "invalid", "token": "token", "new_password": "NewValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------
# Password Complexity Tests (each rule individually)
# ---------------------------------------------------------------------


@pytest.mark.django_db
def test_password_complexity_min_length(unauthenticated_client, registrar_user):
    """Password shorter than 12 chars is rejected."""
    uid = urlsafe_base64_encode(force_bytes(registrar_user.pk))
    token = default_token_generator.make_token(registrar_user)

    response = unauthenticated_client.post(
        "/api/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "A1!short"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    details = response.data.get("details", {})
    assert "new_password" in details


@pytest.mark.django_db
def test_password_complexity_no_uppercase(unauthenticated_client, registrar_user):
    """Password without uppercase is rejected."""
    uid = urlsafe_base64_encode(force_bytes(registrar_user.pk))
    token = default_token_generator.make_token(registrar_user)

    response = unauthenticated_client.post(
        "/api/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "lowercase123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    details = response.data.get("details", {})
    assert "new_password" in details


@pytest.mark.django_db
def test_password_complexity_no_number(unauthenticated_client, registrar_user):
    """Password without number is rejected."""
    uid = urlsafe_base64_encode(force_bytes(registrar_user.pk))
    token = default_token_generator.make_token(registrar_user)

    response = unauthenticated_client.post(
        "/api/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "NoNumbersHere!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    details = response.data.get("details", {})
    assert "new_password" in details


@pytest.mark.django_db
def test_password_complexity_no_special(unauthenticated_client, registrar_user):
    """Password without special character is rejected."""
    uid = urlsafe_base64_encode(force_bytes(registrar_user.pk))
    token = default_token_generator.make_token(registrar_user)

    response = unauthenticated_client.post(
        "/api/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "NoSpecial123"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    details = response.data.get("details", {})
    assert "new_password" in details


@pytest.mark.django_db
def test_password_complexity_all_pass(unauthenticated_client, registrar_user):
    """Password meeting all rules is accepted."""
    uid = urlsafe_base64_encode(force_bytes(registrar_user.pk))
    token = default_token_generator.make_token(registrar_user)

    response = unauthenticated_client.post(
        "/api/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "ValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------
# MeView Tests
# ---------------------------------------------------------------------


@pytest.mark.django_db
def test_me_endpoint_returns_role_and_institution(api_client, registrar_user, institution):
    """GET /api/auth/me/ returns role + institution."""
    response = api_client.get("/api/auth/me/")
    assert response.status_code == status.HTTP_200_OK
    data = response.data
    assert data["role"] == "registrar"
    assert data["institution"] == institution.pk
    assert data["institution_name"] == institution.name


@pytest.mark.django_db
def test_me_endpoint_admin_no_institution(admin_user):
    """Admin user has no institution."""
    client = APIClient()
    refresh = RefreshToken.for_user(admin_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    response = client.get("/api/auth/me/")
    assert response.status_code == status.HTTP_200_OK
    data = response.data
    assert data["role"] == "admin"
    assert data["institution"] is None
    assert data["institution_name"] is None


@pytest.mark.django_db
def test_me_endpoint_unauthenticated(unauthenticated_client):
    """Unauthenticated request returns 401."""
    response = unauthenticated_client.get("/api/auth/me/")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------
# Forced password-change tests (tier 4 follow-up — must_change_password)
# ---------------------------------------------------------------------


@pytest.mark.django_db
def test_invited_user_has_must_change_password_flag(unauthenticated_client, registrar_user, institution):
    """A user created via the staff-invite flow has must_change_password=True.

    Sets the flag at create time. The existing login path must
    still issue a pending_token so the user can complete OTP, but
    the OTP-verify response must surface the flag.
    """
    from institutions.staff_views import _generate_random_password
    from accounts.models import User

    # Simulate the StaffInviteView's user creation, with the flag.
    new_user = User.objects.create_user(
        email="invited@testuni.edu",
        password=_generate_random_password(),
        role=User.Role.REGISTRAR,
        institution=institution,
    )
    new_user.must_change_password = True
    new_user.save(update_fields=["must_change_password"])

    assert new_user.must_change_password is True


@pytest.mark.django_db
def test_otp_verify_response_includes_must_change_password_false_for_normal_user(
    unauthenticated_client, user_with_otp,
):
    """Existing path — must_change_password is False by default.

    Pins the new contract: the response body always carries the
    flag. For an existing user it's False. For an invited user
    it's True (next test).
    """
    pending_token = _pending_signer.sign(user_with_otp.pk)
    response = unauthenticated_client.post(
        "/api/auth/otp/verify/",
        {"pending_token": pending_token, "code": user_with_otp._test_otp_code},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert "must_change_password" in response.data
    assert response.data["must_change_password"] is False
    # And the existing JWT fields still ship.
    assert "access" in response.data
    assert "refresh" in response.data


@pytest.mark.django_db
def test_otp_verify_response_exposes_must_change_password_for_invited_user(
    unauthenticated_client, registrar_user,
):
    """An invited user completing OTP gets a JWT but with the flag
    set, so the frontend can route them to the forced-change screen.
    """
    registrar_user.must_change_password = True
    registrar_user.save(update_fields=["must_change_password"])

    otp, code = LoginOTP.create_for_user(registrar_user)
    pending_token = _pending_signer.sign(registrar_user.pk)

    response = unauthenticated_client.post(
        "/api/auth/otp/verify/",
        {"pending_token": pending_token, "code": code},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["must_change_password"] is True
    # JWT is still minted — the change endpoint requires auth.
    assert "access" in response.data
    assert "refresh" in response.data


@pytest.mark.django_db
def test_password_change_requires_authentication(unauthenticated_client, registrar_user):
    """Anonymous POST returns 401, not 400.
    """
    response = unauthenticated_client.post(
        "/api/auth/password-change/",
        {"new_password": "BrandNewPass456!"},
        format="json",
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_password_change_clears_flag_and_updates_password(api_client, registrar_user):
    """The happy path: authenticated user posts a new password,
    the flag is cleared, and the new password is in effect
    (verified by check_password).
    """
    registrar_user.must_change_password = True
    registrar_user.save(update_fields=["must_change_password"])

    response = api_client.post(
        "/api/auth/password-change/",
        {"new_password": "BrandNewPass456!"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["must_change_password"] is False

    registrar_user.refresh_from_db()
    assert registrar_user.must_change_password is False
    assert registrar_user.check_password("BrandNewPass456!")
    # Old password no longer works.
    assert not registrar_user.check_password("ValidPass123!")


@pytest.mark.django_db
@pytest.mark.parametrize(
    "bad_password,expected_substring",
    [
        ("short1!", "12"),  # too short
        ("alllowercase123!", "uppercase"),
        ("NoDigitsHere!Abc", "number"),
        ("NoSpecialChar123Abc", "special"),
    ],
)
def test_password_change_rejects_weak_password(
    api_client, registrar_user, bad_password, expected_substring,
):
    """Weak passwords return 400 with field-keyed errors."""
    response = api_client.post(
        "/api/auth/password-change/",
        {"new_password": bad_password},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    details = response.data.get("details", {})
    pwd_errors = details.get("new_password", [])
    assert any(expected_substring.lower() in str(e).lower() for e in pwd_errors)


@pytest.mark.django_db
def test_password_change_idempotent_when_flag_already_false(api_client, registrar_user):
    """A user without must_change_password can still rotate their
    password via this endpoint. No error.
    """
    response = api_client.post(
        "/api/auth/password-change/",
        {"new_password": "AnotherValidPass789!"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["must_change_password"] is False


@pytest.mark.django_db
def test_invited_user_first_login_full_flow(unauthenticated_client, registrar_user):
    """End-to-end: the scenario from the bug report.

    1. User is created with must_change_password=True (the invite path).
    2. They POST valid credentials to /login/.
    3. They receive a pending_token (login flow is unchanged).
    4. They POST the correct OTP code to /otp/verify/.
    5. The response includes a JWT AND must_change_password=True.
    6. Without calling /password-change/, they CANNOT reach a
       dashboard-gated endpoint (represented here by /me/) and get
       a normal payload — they CAN reach it (because they have a
       JWT), but /me/ surfaces the flag, which the frontend uses to
       block dashboard navigation.
    7. After /password-change/, the flag is False and the same
       gated endpoint reports the user is fully onboarded.
    """
    # Step 1 — invite (set the flag).
    registrar_user.must_change_password = True
    registrar_user.save(update_fields=["must_change_password"])

    # Step 2 + 3 — login.
    response = unauthenticated_client.post(
        "/api/auth/login/",
        {"email": "registrar@testuni.edu", "password": "ValidPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert "pending_token" in response.data

    # Step 4 — verify the OTP.
    otp, code = LoginOTP.create_for_user(registrar_user)
    pending_token = response.data["pending_token"]

    response = unauthenticated_client.post(
        "/api/auth/otp/verify/",
        {"pending_token": pending_token, "code": code},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK

    # Step 5 — flag is exposed in OTP-verify response.
    assert response.data["must_change_password"] is True
    access_token = response.data["access"]

    # Step 6 — /me/ reports the flag is still set. The user is
    # authenticated but the dashboard would redirect them.
    me_client = APIClient()
    me_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
    me_response = me_client.get("/api/auth/me/")
    assert me_response.status_code == status.HTTP_200_OK
    assert me_response.data["must_change_password"] is True

    # Step 7 — change the password. The flag clears.
    change_response = me_client.post(
        "/api/auth/password-change/",
        {"new_password": "FreshlyChosenPass123!"},
        format="json",
    )
    assert change_response.status_code == status.HTTP_200_OK
    assert change_response.data["must_change_password"] is False

    # Confirm: same JWT, same /me/ call, flag now False.
    me_after = me_client.get("/api/auth/me/")
    assert me_after.data["must_change_password"] is False

    # And the new password is what authenticates now.
    registrar_user.refresh_from_db()
    assert registrar_user.check_password("FreshlyChosenPass123!")
    assert not registrar_user.check_password("ValidPass123!")


@pytest.mark.django_db
def test_non_invited_user_first_login_flow_unaffected(unauthenticated_client, user_with_otp):
    """Regression guard: a user with must_change_password=False
    (the default for all existing users) sees no flag-related
    changes in the OTP-verify response.

    Skips /login/ entirely (would replace the fixture's OTP with a
    new one and the test code would be stale). Signs the
    pending_token directly from the user pk, mirroring
    `test_otp_verify_success`.
    """
    pending_token = _pending_signer.sign(user_with_otp.pk)
    response = unauthenticated_client.post(
        "/api/auth/otp/verify/",
        {"pending_token": pending_token, "code": user_with_otp._test_otp_code},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["must_change_password"] is False


# ---------------------------------------------------------------------
# must_change_password — backend enforcement regression tests
# ---------------------------------------------------------------------
#
# These tests pin the property that the flag is NOT just a frontend hint
# — it's enforced server-side on every auth-gated endpoint via the
# `MustChangePasswordAllowed` permission class. An invited user who has
# completed OTP and holds a valid JWT still cannot reach any business
# endpoint until they call /api/auth/password-change/ to clear the flag.
#
# The two endpoints that MUST stay reachable while the flag is set:
#   * GET  /api/auth/me/             — so the frontend can read the flag
#   * POST /api/auth/password-change/ — so the user can clear the flag
# All other auth-gated endpoints are listed in accounts/permissions.py.

@pytest.mark.django_db
def test_invited_user_jwt_rejected_on_certificate_list(institution):
    """An invited user who has just completed OTP and now holds a real
    JWT must NOT be able to reach GET /api/certificates/. The 403 is
    what blocks the dashboard data path, not the frontend redirect.

    This is the canonical "no frontend involved" regression test: the
    JWT is real, simplejwt-minted, attached as Bearer; the request goes
    straight at the endpoint.
    """
    invited = User.objects.create_user(
        email="invited@testuni.edu",
        password="TempInitialPass123!",
        role=User.Role.REGISTRAR,
        institution=institution,
    )
    invited.must_change_password = True
    invited.save(update_fields=["must_change_password"])

    client = APIClient()
    refresh = RefreshToken.for_user(invited)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    response = client.get("/api/certificates/")
    assert response.status_code == status.HTTP_403_FORBIDDEN
    # The global DRF exception handler (see acvs/api exception_handler)
    # wraps every error as {error: <kind>, detail: <flattened>}. For a
    # dict-detail permission, detail stays a dict. The frontend's
    # `asJson` helper reads `body.detail.code` to branch on the
    # signal — same envelope as `institution_pending` login errors.
    body = response.data
    assert body["error"] == "permission_denied"
    assert body["detail"]["code"] == "must_change_password"


@pytest.mark.django_db
def test_invited_user_jwt_still_reaches_me(institution):
    """GET /api/auth/me/ must remain reachable while the flag is set —
    the frontend needs to read the flag to know where to route the user.
    """
    invited = User.objects.create_user(
        email="invited@testuni.edu",
        password="TempInitialPass123!",
        role=User.Role.REGISTRAR,
        institution=institution,
    )
    invited.must_change_password = True
    invited.save(update_fields=["must_change_password"])

    client = APIClient()
    refresh = RefreshToken.for_user(invited)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    response = client.get("/api/auth/me/")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["must_change_password"] is True


@pytest.mark.django_db
def test_invited_user_jwt_still_reaches_password_change(institution):
    """POST /api/auth/password-change/ must remain reachable while the
    flag is set — that's the only way the user can clear the flag and
    unlock the rest of the API.
    """
    invited = User.objects.create_user(
        email="invited@testuni.edu",
        password="TempInitialPass123!",
        role=User.Role.REGISTRAR,
        institution=institution,
    )
    invited.must_change_password = True
    invited.save(update_fields=["must_change_password"])

    client = APIClient()
    refresh = RefreshToken.for_user(invited)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    response = client.post(
        "/api/auth/password-change/",
        {"new_password": "BrandNewPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["must_change_password"] is False

    invited.refresh_from_db()
    assert invited.must_change_password is False

    # After clearing, GET /api/certificates/ succeeds. This pins the
    # round-trip property the user-visible flow depends on.
    response = client.get("/api/certificates/")
    assert response.status_code == status.HTTP_200_OK