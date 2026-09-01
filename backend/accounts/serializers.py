"""Serializers for authentication endpoints."""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers

from accounts.models import LoginOTP


from django.contrib.auth.password_validation import validate_password




User = get_user_model()

# Signer for short-lived pending_token (5 min TTL matches OTP expiry)
_pending_signer = TimestampSigner(key=settings.SECRET_KEY, salt="acvs.auth.pending")


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs["email"].strip().lower()
        password = attrs["password"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Same error for nonexistent email to avoid enumeration
            raise serializers.ValidationError("Invalid credentials.")

        if not user.check_password(password):
            raise serializers.ValidationError("Invalid credentials.")

        if not user.is_active:
            raise serializers.ValidationError("Account is disabled.")

        if user.role == User.Role.REGISTRAR and user.institution is not None:
            # PENDING is a distinct user-facing state with its own copy and
            # frontend redirect (→ /institution/access-pending). Other non-
            # active statuses (suspended, future ones) keep the generic
            # message — bucketing them under "awaiting approval" would be
            # misleading for an institution that was actually deactivated.
            if user.institution.status == user.institution.Status.PENDING:
                raise serializers.ValidationError(
                    {
                        "code": "institution_pending",
                        "message": "Your institution is awaiting approval.",
                    }
                )
            if user.institution.status != user.institution.Status.ACTIVE:
                raise serializers.ValidationError("Your institution is not active.")

        attrs["user"] = user
        return attrs


class OTPVerifySerializer(serializers.Serializer):
    pending_token = serializers.CharField()
    code = serializers.CharField(min_length=6, max_length=6)

    def validate_pending_token(self, value):
        try:
            user_id = _pending_signer.unsign(value, max_age=300)
        except SignatureExpired:
            raise serializers.ValidationError("OTP has expired. Please request a new one.")
        except BadSignature:
            raise serializers.ValidationError("Invalid or tampered token.")

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid pending token.")

        self.context["user"] = user
        return value

    def validate(self, attrs):
        user = self.context["user"]
        code = attrs["code"]

        try:
            otp = user.login_otp
        except LoginOTP.DoesNotExist:
            raise serializers.ValidationError({"code": "No pending OTP. Please log in again."})

        from django.utils import timezone

        if otp.expires_at < timezone.now():
            raise serializers.ValidationError({"code": "OTP expired. Please request a new one."})

        if otp.attempts >= 5:
            raise serializers.ValidationError(
                {"code": "Too many failed attempts. Please log in again."}
            )

        if not otp.check_code(code):
            otp.attempts += 1
            otp.save(update_fields=["attempts"])
            raise serializers.ValidationError({"code": "Invalid code."})

        attrs["user"] = user
        attrs["otp"] = otp
        return attrs


class OTPResendSerializer(serializers.Serializer):
    pending_token = serializers.CharField()

    def validate_pending_token(self, value):
        try:
            user_id = _pending_signer.unsign(value, max_age=300)
        except (SignatureExpired, BadSignature):
            raise serializers.ValidationError("Invalid or expired token.")

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid pending token.")

        self.context["user"] = user
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        # Always return success — don't leak whether email exists
        return value.lower().strip()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        # Run all AUTH_PASSWORD_VALIDATORS (12-char min, uppercase, number, special)
        from django.contrib.auth.password_validation import validate_password

        validate_password(value)
        return value

    def validate(self, attrs):
        try:
            uid = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=uid)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            raise serializers.ValidationError({"uid": "Invalid reset link."})

        if not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError({"token": "Invalid or expired reset token."})

        attrs["user"] = user
        return attrs


class MeSerializer(serializers.ModelSerializer):
    institution_name = serializers.CharField(source="institution.name", allow_null=True)

    class Meta:
        model = User
        fields = ("role", "institution", "institution_name", "must_change_password")
        read_only_fields = fields


class PasswordChangeSerializer(serializers.Serializer):
    """Body for POST /api/auth/password-change/.

    Takes only `new_password`. The user is taken from the JWT (the
    endpoint is auth-gated). The same `validate_password` chain used
    by the email-reset flow runs here, so the rules are identical
    (12+ chars, uppercase, number, special). Returning the same
    error shape (`{"new_password": [...]}`) means the frontend can
    reuse the same error-parsing code.
    """

    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        from django.contrib.auth.password_validation import validate_password

        validate_password(value)
        return value,








