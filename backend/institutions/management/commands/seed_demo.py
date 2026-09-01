"""Seed the dev database with a single demo Institution + registrar User.

Usage:
    python manage.py seed_demo

Idempotent: re-running won't duplicate the Institution or User. Use this
to bootstrap a fresh dev DB (or to repair one where the registrar was
deleted) without going through Django admin or fixtures.

The credentials are deliberately trivial — this command is intended for
local development and Playwright end-to-end runs, never production.
The --reset flag drops the existing demo User (and only the demo User)
first so a forgotten password can be recovered without dropping the DB.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from institutions.models import Institution

# Single source of truth — keep in lockstep with whatever test scripts
# drive the registrar login flow (e.g. Playwright e2e specs).
DEMO_INSTITUTION_NAME = "Université de Kinshasa (Demo)"
DEMO_INSTITUTION_EMAIL = "registrar@demo-university.cd"
DEMO_USER_EMAIL = "registrar@demo-university.cd"
DEMO_USER_PASSWORD = "DemoRegistrarPass1!"


class Command(BaseCommand):
    help = (
        "Create one demo Institution + registrar User. Idempotent — safe to "
        "re-run. Pass --reset to delete the demo User first (recovers from a "
        "forgotten password without dropping the DB)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete the existing demo User before re-creating.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        reset = options["reset"]

        if reset:
            deleted, _ = User.objects.filter(email=DEMO_USER_EMAIL).delete()
            if deleted:
                self.stdout.write(
                    self.style.WARNING(
                        f"--reset: deleted {deleted} existing demo row(s)."
                    )
                )

        institution, inst_created = Institution.objects.get_or_create(
            name=DEMO_INSTITUTION_NAME,
            defaults={
                "contact_email": DEMO_INSTITUTION_EMAIL,
                "status": Institution.Status.ACTIVE,
            },
        )
        # If the institution existed but with the wrong status, flip it to
        # ACTIVE — a suspended institution would block login (see
        # accounts/serializers.py:LoginSerializer.validate).
        if not inst_created and institution.status != Institution.Status.ACTIVE:
            institution.status = Institution.Status.ACTIVE
            institution.save(update_fields=["status"])

        user, user_created = User.objects.get_or_create(
            email=DEMO_USER_EMAIL,
            defaults={
                "username": DEMO_USER_EMAIL,
                "role": User.Role.REGISTRAR,
                "institution": institution,
                "is_active": True,
            },
        )
        # get_or_create only sets defaults on insert — for a pre-existing row
        # we still need to (re)assert the role, institution, and active flag,
        # because that's exactly what a "repair" run is for.
        changed = []
        if user.role != User.Role.REGISTRAR:
            user.role = User.Role.REGISTRAR
            changed.append("role")
        if user.institution_id != institution.pk:
            user.institution = institution
            changed.append("institution")
        if not user.is_active:
            user.is_active = True
            changed.append("is_active")

        # Always reset the password on a non-fresh run too — that's the whole
        # point of --reset, and on a fresh run get_or_create already skipped
        # this path (the user was just created above with no password set).
        # Setting it unconditionally is harmless and keeps the command easy
        # to reason about: "run seed_demo, password is exactly this string."
        user.set_password(DEMO_USER_PASSWORD)
        changed.append("password")
        if changed:
            user.save()

        self.stdout.write(
            self.style.SUCCESS(
                "\n".join(
                    [
                        "seed_demo: ready",
                        f"  Institution: {institution.name} ({institution.pk}) "
                        f"[{'created' if inst_created else 'existed'}, status={institution.status}]",
                        f"  User:        {user.email} ({user.pk}) "
                        f"[{'created' if user_created else 'updated'}]",
                        f"  Password:    {DEMO_USER_PASSWORD}",
                    ]
                )
            )
        )