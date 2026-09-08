"""Public verify endpoint.

GET /api/verify/<certificate_id>/   — no auth, no login.

Per CLAUDE.md, the public verify is anonymous. The endpoint looks up the
cert in Postgres and returns a result string plus descriptive fields. It
also writes one row to the Employer (verification-attempt) log per call,
even for not_found results — that's the table's purpose.

The response also carries a `chain_state` field, one of:
  not_yet_anchored  — cert is in grace_period; chain call skipped
  confirmed         — chain says anchored and not disabled
  disabled          — chain says anchored and disabled
  unknown           — chain says never anchored
  unreachable       — chain read failed (RPC down, no address, etc.)
Postgres remains the source of truth for descriptive fields and for the
`result` enum; `chain_state` is an extra signal the frontend can act on.
"""

from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from certificates.models import Certificate

from .chain import NOT_YET_ANCHORED, make_reader
from .models import Employer


class PublicVerifyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, certificate_id: str):
        try:
            cert = Certificate.objects.select_related("student", "institution").get(
                certificate_id=certificate_id,
            )
        except Certificate.DoesNotExist:
            Employer.objects.create(result=Employer.Result.NOT_FOUND)
            return Response({"result": Employer.Result.NOT_FOUND}, status=404)

        # grace_period and anchored both present as "valid" externally.
        # The chain-state read can downgrade this to "disabled" if the
        # on-chain `disabled` flag disagrees.
        result = (
            Employer.Result.DISABLED
            if cert.status == Certificate.Status.DISABLED
            else Employer.Result.VALID
        )

        # Grace-period certs cannot be on chain yet — short-circuit so we
        # don't burn an RPC round-trip on a never-anchored ID. The reader
        # itself would also return "unknown" in that case, but skipping
        # the call makes the distinction explicit at the response layer:
        # "not_yet_anchored" means Postgres says grace_period, while
        # "unreachable" / "unknown" come from the chain.
        if cert.status == Certificate.Status.GRACE_PERIOD:
            chain_state = NOT_YET_ANCHORED
        else:
            chain_state = make_reader().get_chain_state(cert.certificate_id)

        org_name = request.query_params.get("organization_name", "")[:255]
        Employer.objects.create(
            certificate=cert,
            organization_name=org_name,
            result=result,
        )
        return Response(
            {
                "result": result,
                "certificate_id": cert.certificate_id,
                "student": cert.student.full_name,
                "institution": cert.institution.name,
                "degree": cert.degree,
                "program": cert.program,
                "issued_date": cert.issued_date.isoformat(),
                "status": cert.status,
                "chain_state": chain_state,
            }
        )
