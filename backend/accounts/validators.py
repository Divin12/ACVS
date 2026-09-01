"""Custom password validators for the Set New Password screen checklist.

Rules (matching the Stitch design exactly):
1. Minimum 12 characters
2. At least one uppercase letter (A-Z)
3. At least one number (0-9)
4. At least one special character from !@#$%^&*()_+-=[]{}|;:,.<>?
"""

from __future__ import annotations

import re

from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


class UppercaseValidator:
    """Require at least one uppercase letter."""

    def validate(self, password: str, user=None) -> None:
        if not re.search(r"[A-Z]", password):
            raise ValidationError(
                _("Password must contain at least one uppercase letter."),
                code="password_no_uppercase",
            )

    def get_help_text(self) -> str:
        return _("At least one uppercase letter (A-Z).")


class NumberValidator:
    """Require at least one digit."""

    def validate(self, password: str, user=None) -> None:
        if not re.search(r"\d", password):
            raise ValidationError(
                _("Password must contain at least one number."),
                code="password_no_number",
            )

    def get_help_text(self) -> str:
        return _("At least one number (0-9).")


class SpecialCharValidator:
    """Require at least one special character."""

    SPECIAL_CHARS = r"!@#$%^&*()_+\-=\[\]{}|;:,.<>?"

    def validate(self, password: str, user=None) -> None:
        if not re.search(f"[{re.escape(self.SPECIAL_CHARS)}]", password):
            raise ValidationError(
                _("Password must contain at least one special character."),
                code="password_no_special",
            )

    def get_help_text(self) -> str:
        return _("At least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?).")