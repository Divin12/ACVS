"""Student model.

Deliberately minimal (per CLAUDE.md): a Student is just a name and an
institution. The cohort and other identifying data live on the Certificate
itself. A later turn may add matric number, dob, etc.
"""

from __future__ import annotations

from django.db import models

from institutions.models import Institution


class Student(models.Model):
    full_name = models.CharField(max_length=255)
    institution = models.ForeignKey(
        Institution,
        on_delete=models.PROTECT,
        related_name="students",
    )

    class Meta:
        ordering = ["full_name"]
        indexes = [models.Index(fields=["institution", "full_name"])]

    def __str__(self) -> str:
        return self.full_name
