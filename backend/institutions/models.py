"""Institution model.

An institution is the entity that issues certificates. Registrars belong to
exactly one institution; admins (role=admin) do not.
"""

from __future__ import annotations

from django.db import models


class Institution(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"

    name = models.CharField(max_length=255, unique=True)
    contact_email = models.EmailField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["status"])]

    def __str__(self) -> str:
        return self.name
