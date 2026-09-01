"""Single entry point for writing ActivityLog rows.

Every audit-write in the codebase routes through `log_action()` so the
field list, ordering, and any future invariant (e.g. an audit log that
must be paired with a real DB change) lives in one place.

The signature is kwarg-only so call sites are self-documenting at the
read point — the action choice names the event, the optional FKs name
the target, and the detail string carries any action-specific fields.
"""

from __future__ import annotations

from typing import Optional

from django.contrib.auth import get_user_model

from .models import ActivityLog

User = get_user_model()


def log_action(
    *,
    actor: User,
    action: str,
    institution=None,
    certificate=None,
    detail: str = "",
) -> ActivityLog:
    """Write one ActivityLog row.

    Caller passes the request.user as `actor`. `institution` and
    `certificate` are optional — leave them None for actions that
    don't target one (institution-level approve/suspend with the
    MINISTRY-level target, future admin actions that don't carry a
    specific institution). `detail` is a plain string; the audit
    endpoint exposes it verbatim.
    """
    return ActivityLog.objects.create(
        actor=actor,
        action=action,
        institution=institution,
        certificate=certificate,
        detail=detail or "",
    )


def log_action_for_request(
    *,
    request,
    action: str,
    institution: Optional[object] = None,
    certificate: Optional[object] = None,
    detail: str = "",
) -> ActivityLog:
    """Convenience wrapper: `actor` is `request.user`.

    The wrappers below (`audit_action`, `audit_action_for_institution`,
    `audit_action_for_certificate`) exist for the common cases so the
    call site doesn't have to type `request.user` again. They all
    delegate to `log_action` — there is no other write path.
    """
    return log_action(
        actor=request.user,
        action=action,
        institution=institution,
        certificate=certificate,
        detail=detail,
    )
