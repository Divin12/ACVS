"""Serializers for the certificates app.

Four shapes:
* BulkCreateItemSerializer    — one row in the bulk-create request body, now including 
                                official institution certificate_id / serial_number.
* BulkCreateRequestSerializer — wraps `items`, enforces unique serial numbers in batch,
  and enforces the "one cohort per request" invariant across the whole batch.
* CertificateReadSerializer   — output shape for list/detail.
* CertificateEditSerializer   — partial-update input shape, restricted to
  fields editable in grace_period (certificate_id, degree, program, issued_date, cohort_number, student_name).

Identity / status / chain fields are NOT in the edit shape by design:
* `status` changes only via the (out-of-scope) anchor/disable endpoints.
* `institution` changes would invalidate the on-chain hash.
"""

from __future__ import annotations

from rest_framework import serializers

from students.models import Student

from .hashing import content_hash_hex
from .models import Certificate


class BulkCreateItemSerializer(serializers.Serializer):
    """One row in the bulk-create request body.

    The registrar types raw student names and official serial numbers.
    Students don't pre-exist; they are created alongside their certificate.
    """

    certificate_id = serializers.CharField(max_length=100)
    student_name = serializers.CharField(max_length=255)
    cohort_number = serializers.IntegerField(min_value=1)
    degree = serializers.CharField(max_length=128)
    program = serializers.CharField(max_length=128)
    issued_date = serializers.DateField()


class BulkCreateRequestSerializer(serializers.Serializer):
    items = BulkCreateItemSerializer(many=True)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("At least one item required.")
        
        # Enforce batch cohort invariant
        cohorts = {i["cohort_number"] for i in items}
        if len(cohorts) > 1:
            raise serializers.ValidationError("All items must share one cohort_number.")
        
        # Enforce unique serial numbers (certificate_ids) within the request batch
        cert_ids = [i["certificate_id"] for i in items]
        if len(cert_ids) != len(set(cert_ids)):
            raise serializers.ValidationError("Duplicate certificate_id (serial numbers) found in the batch.")

        return items


class StudentSummarySerializer(serializers.ModelSerializer):
    """Compact {id, full_name} for nesting inside certificate payloads."""

    class Meta:
        model = Student
        fields = ("id", "full_name")
        read_only_fields = fields


class CertificateReadSerializer(serializers.ModelSerializer):
    student = StudentSummarySerializer(read_only=True)
    pending_hash = serializers.SerializerMethodField()

    def get_pending_hash(self, obj):
        if obj.status != Certificate.Status.GRACE_PERIOD:
            return None
        return content_hash_hex(obj)

    class Meta:
        model = Certificate
        fields = (
            "certificate_id",
            "student",
            "institution",
            "cohort_number",
            "degree",
            "program",
            "issued_date",
            "status",
            "pending_hash",
            "chain_hash",
            "tx_hash",
            "disabled_at",
            "disabled_reason",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class CertificateEditSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(write_only=True, required=False)
    certificate_id = serializers.CharField(max_length=100, required=False)

    class Meta:
        model = Certificate
        fields = ["certificate_id", "degree", "program", "issued_date", "cohort_number", "student_name"]

    def update(self, instance, validated_data):
        student_name = validated_data.pop("student_name", None)
        if student_name:
            student = instance.student
            student.full_name = student_name
            student.save()

        return super().update(instance, validated_data)