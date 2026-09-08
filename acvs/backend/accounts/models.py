"""Custom user model.

Extends Django's AbstractUser with two additions:
  * `role` (registrar / admin) — single CharField; no Django groups framework.
  * `institution` FK — null for admins, required for registrars.
"""

from __future__ import annotations

import random

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """Manager that treats email as the primary identity.

    `create_user` requires email; we set username=email by default to avoid
    two unique fields on the same identity (and to line up with the future
    LoginOTP flow, which keys on email).
    """

    use_in_migrations = True

    def _normalize_email(self, email: str) -> str:
        return (email or "").strip().lower()

    def _create_user(self, email: str, password: str | None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self._normalize_email(email)
        username = extra_fields.pop("username", email)
        user = self.model(email=email, username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        REGISTRAR = "registrar", "Registrar"
        ADMIN = "admin", "Administrator"

    role = models.CharField(
        max_length=16,
        choices=Role.choices,
        default=Role.REGISTRAR,
    )
    email = models.EmailField(unique=True)
    institution = models.ForeignKey(
        "institutions.Institution",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="users",
    )
    # Stamped on each successful OTP verification (see LoginView /
    # OTPVerifyView). Used by the staff-list endpoint to surface
    # "last seen" without scraping LoginOTP's auto_now_add timestamps.
    # Nullable because legacy users (created before this field existed)
    # never logged in via the OTP flow.
    last_login_at = models.DateTimeField(null=True, blank=True)
    # Set to True on accounts created via the staff-invite flow
    # (StaffInviteView). The OTP-verify endpoint refuses to mint a
    # full JWT when this flag is set; the frontend sees the flag in
    # the /me/ response and routes the user to a forced password-
    # change screen before granting dashboard access. The flag is
    # cleared by the password-change endpoint, not by staff/admin
    # action — the user must complete the change themselves.
    must_change_password = models.BooleanField(default=False)

    EMAIL_FIELD = "email"
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    objects = UserManager()

    @property
    def is_registrar(self) -> bool:
        return self.role == self.Role.REGISTRAR

    @property
    def is_administrator(self) -> bool:
        return self.role == self.Role.ADMIN

    class Meta:
        db_table = "auth_user"
        indexes = [models.Index(fields=["role"])]

    def __str__(self) -> str:
        return f"{self.email} ({self.role})"


class LoginOTP(models.Model):
    """One-time password for two-step login.

    Stores only a hash of the 6-digit code (via make_password), a 5-minute
    expiry, and an attempt counter. One OTP per user — resend replaces it.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="login_otp",
    )
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "accounts_login_otp"

    def __str__(self) -> str:
        return f"OTP for {self.user.email}"

    def check_code(self, code: str) -> bool:
        """Verify a plaintext code against the stored hash."""
        from django.contrib.auth.hashers import check_password

        return check_password(code, self.code_hash)

    @classmethod
    def create_for_user(cls, user):
        """Generate a new 6-digit code, hash it, and create/replace OTP.

        Returns (otp_instance, plaintext_code).
        """
        code = f"{random.randint(0, 999999):06d}"
        code_hash = make_password(code)
        expires_at = timezone.now() + timezone.timedelta(minutes=5)

        otp, created = cls.objects.update_or_create(
            user=user,
            defaults={
                "code_hash": code_hash,
                "expires_at": expires_at,
                "attempts": 0,
            },
        )
        return otp, code
