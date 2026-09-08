"""Views for the authentication endpoints.

Flow (per CLAUDE.md):
1. POST /login/          → email+password → creates LoginOTP, returns pending_token
2. POST /otp/verify/     → pending_token+code → validates → returns access+refresh JWTs
3. POST /otp/resend/     → pending_token → invalidates old OTP, issues new one
4. POST /password-reset/request/  → email → sends reset link (stateless token)
4. POST /password-reset/confirm/ → uid+token+new_password → validates → sets password
5. GET  /me/             → authenticated → returns role + institution
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.core.signing import TimestampSigner
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import LoginOTP
from .serializers import (
    LoginSerializer,
    MeSerializer,
    OTPResendSerializer,
    OTPVerifySerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
)

User = get_user_model()

_pending_signer = TimestampSigner(key=settings.SECRET_KEY, salt="acvs.auth.pending")


def _send_otp_email(user: User, code: str) -> None:
    """Send OTP via console email backend (for pilot/demo)."""
    send_mail(
        subject="Your ACVS Login Code",
        message=f"Your verification code is: {code}\n\nThis code expires in 5 minutes.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )



def _send_reset_email(user: User, uid: str, token: str) -> None:
    """Send password reset link via console email backend."""
    reset_url = f"{settings.FRONTEND_URL}/reset-password/confirm?uid={uid}&token={token}"
    send_mail(
        subject="ACVS Password Reset",
        message=f"Click to reset your password: {reset_url}\n\nThis link expires in 3 days.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


class LoginView(APIView):
    """POST /api/auth/login/

    Validates email+password via Django's check_password.
    On success: creates/replaces LoginOTP, "sends" code via console email,
    returns short-lived signed pending_token.
    """

    permission_classes = [AllowAny]
    serializer_class = LoginSerializer

    def post(self, request):
        ser = LoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.validated_data["user"]

        # Create or replace OTP
        otp, code = LoginOTP.create_for_user(user)

        # "Send" via console backend (shows in server logs)
        _send_otp_email(user, code)

        # Return signed pending_token (carries user_id, max_age=300 matches OTP TTL)
        pending_token = _pending_signer.sign(user.pk)

        return Response({"pending_token": pending_token}, status=status.HTTP_200_OK)


class OTPVerifyView(APIView):
    """POST /api/auth/otp/verify/

    Validates pending_token + 6-digit code. On success: deletes OTP,
    mints access+refresh JWTs via simplejwt, returns both, AND
    surfaces `must_change_password` in the response body so the
    frontend can route a freshly-invited user to the forced-change
    screen before granting dashboard access.

    Note: the JWT is always minted, even when must_change_password
    is True. The change endpoint is auth-gated, so refusing the JWT
    would create a deadlock (the user couldn't authenticate to the
    very endpoint that clears the flag). The contract is:
      * `must_change_password=True` → user is authenticated but the
        frontend must redirect to /institution/set-password before
        letting them reach any other page.
      * `must_change_password=False` → normal flow.
    """

    permission_classes = [AllowAny]
    serializer_class = OTPVerifySerializer

    def post(self, request):
        ser = OTPVerifySerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        user = ser.validated_data["user"]
        otp = ser.validated_data["otp"]

        # Success — delete OTP and issue JWTs
        otp.delete()

        # Stamp last_login_at. We do this AFTER otp.delete() and
        # BEFORE the JWT mint so the timestamp on the staff-list
        # endpoint matches the moment of authentication, not the
        # moment of OTP creation. update_fields=[...] keeps the write
        # to a single column.
        user.last_login_at = timezone.now()
        user.save(update_fields=["last_login_at"])

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "must_change_password": user.must_change_password,
            },
            status=status.HTTP_200_OK,
        )


class OTPResendView(APIView):
    """POST /api/auth/otp/resend/

    Invalidates previous OTP (if any), generates new code,
    "sends" via console email. Returns 200 with no body.
    """

    permission_classes = [AllowAny]
    serializer_class = OTPResendSerializer

    def post(self, request):
        ser = OTPResendSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        user = ser.context["user"]

        # Create new OTP (replaces any existing)
        otp, code = LoginOTP.create_for_user(user)

        _send_otp_email(user, code)
        return Response(status=status.HTTP_200_OK)


class PasswordResetRequestView(APIView):
    """POST /api/auth/password-reset/request/

    Takes {email}. Always returns 200 (no enumeration). If user exists,
    generates stateless reset token via Django's default_token_generator
    and "emails" link via console backend.
    """

    permission_classes = [AllowAny]
    serializer_class = PasswordResetRequestSerializer

    def post(self, request):
        ser = PasswordResetRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        email = ser.validated_data["email"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Always 200 — don't leak existence
            return Response(status=status.HTTP_200_OK)

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)

        _send_reset_email(user, uid, token)
        return Response(status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """POST /api/auth/password-reset/confirm/

    Takes {uid, token, new_password}. Validates token via
    default_token_generator.check_token(), runs password through
    custom validators (12 chars, uppercase, number, special char), then
    calls set_password() and saves.
    """

    permission_classes = [AllowAny]
    serializer_class = PasswordResetConfirmSerializer

    def post(self, request):
        ser = PasswordResetConfirmSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.validated_data["user"]
        new_password = ser.validated_data["new_password"]

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response(status=status.HTTP_200_OK)


class MeView(APIView):
    """GET /api/auth/me/

    Returns current user's role, institution, and `must_change_password`
    flag for frontend routing. Frontend reads the flag after OTP verify
    and after every MeView fetch; while True, any attempt to navigate
    to a non-change endpoint is rerouted to /institution/set-password.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = MeSerializer

    def get(self, request):
        ser = MeSerializer(request.user)
        return Response(ser.data)


class PasswordChangeView(APIView):
    """POST /api/auth/password-change/

    Auth-gated. Body: {"new_password": "..."}.

    Sets the user's password to the supplied value and clears the
    `must_change_password` flag. The user is taken from the request
    JWT — there's no email/token dance here. After success, the
    existing JWT remains valid (it's tied to the user's id, not
    their password hash), so the user can continue navigating
    immediately without re-authenticating.

    Returns 200 with `{"must_change_password": false}` so the
    frontend can refresh its local auth state without a second
    round-trip to /me/.

    Use case:
      * A registrar invited via StaffInviteView logs in. They
        complete OTP. OTP-verify's response body says
        must_change_password=true. Frontend routes them to
        /institution/set-password which posts here. The flag is
        cleared. The user is now fully onboarded.

    Idempotency note: the same endpoint can be called by a user
    who is NOT in the must-change state (e.g. they decided to
    rotate their password mid-session). The flag is unconditionally
    cleared and the password is set; no error.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = PasswordChangeSerializer

    def post(self, request):
        ser = PasswordChangeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        new_password = ser.validated_data["new_password"]

        user = request.user
        user.set_password(new_password)
        user.must_change_password = False
        # Stamping last_login_at here would be misleading — the
        # user hasn't really "logged in" again, they've just
        # completed the forced-change step. Leave last_login_at
        # alone (it was stamped at OTP-verify).
        user.save(update_fields=["password", "must_change_password"])

        return Response(
            {"must_change_password": False},
            status=status.HTTP_200_OK,
        )




