"""ActivityLog read serializer.

Exposes the audit row with the human-readable fields an admin
needs to read the trail:

  * actor.email + actor.role (not just the user id)
  * institution.name (not just the institution id)
  * certificate.certificate_id (the public id, not the row's pk)
  * action (the human-readable label from Action.choices)
  * detail (verbatim — a JSON-as-string when the writer bothered)
  * created_at (ISO 8601)

The pk is omitted on purpose — every other field is enough to
uniquely identify the row in the UI, and the internal id is
never meaningful to anyone reading the trail.
"""

from __future__ import annotations

import json
from rest_framework import serializers

from .models import ActivityLog


class ActivityLogReadSerializer(serializers.ModelSerializer):
    actor_email = serializers.CharField(source="actor.email", read_only=True)
    actor_role = serializers.CharField(source="actor.role", read_only=True)
    institution_name = serializers.CharField(
        source="institution.name", read_only=True, default=None,
    )
    certificate_id = serializers.SerializerMethodField()
    
    class Meta:
        model = ActivityLog
        fields = (
            "actor_email",
            "actor_role",
            "institution_name",
            "certificate_id",
            "action",
            "detail",
            "created_at",
        )
        read_only_fields = fields

    def get_certificate_id(self, obj) -> str | None:
        # 1. Si la relation certificat existe directement et a un certificate_id
        if obj.certificate and hasattr(obj.certificate, "certificate_id"):
            return obj.certificate.certificate_id
        
        # 2. Si le certificat est stocké sous forme d'ID brut ou d'objet lié mais sans le champ public
        if obj.certificate and hasattr(obj.certificate, "id"):
            return str(obj.certificate.id)

        # 3. Si l'ID est parfois stocké dans le champ 'detail' (JSON ou texte)
        if obj.detail:
            try:
                # Si detail est un JSON sous forme de chaîne de caractères
                detail_data = json.loads(obj.detail)
                if isinstance(detail_data, dict):
                    for key in ["certificate_id", "cert_id", "certificate", "id"]:
                        if key in detail_data and detail_data[key]:
                            return str(detail_data[key])
            except (json.JSONDecodeError, TypeError):
                pass
                
        return None