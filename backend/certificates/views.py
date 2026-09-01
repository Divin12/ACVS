"""Certificate views.

* BulkCreateView         — POST  /api/certificates/bulk-create/    (registrar)
* CertificateListView    — GET   /api/certificates/                 (registrar | admin)
* CertificateDetailView  — PATCH /api/certificates/<id>/           (registrar)
* AnchorCertificateView  — POST  /api/certificates/<id>/anchor/    (registrar)
* DisableCertificateView — POST  /api/certificates/<id>/disable/   (registrar)
* CertificateQRCodeView  — GET   /api/certificates/<id>/qr/        (public)
* VerifyCertificateView  — GET   /api/certificates/<id>/verify/    (public)
"""

from __future__ import annotations

import io
import json
import logging
from datetime import datetime, timezone

import qrcode
from django.db import IntegrityError, transaction
from django.http import HttpResponse, Http404
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import MustChangePasswordAllowed
from audit.models import ActivityLog
from audit.services import log_action
from institutions.models import Institution
from students.models import Student
from verification.chain import make_reader
from rest_framework_simplejwt.authentication import JWTAuthentication
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas
import traceback
from reportlab.lib.pagesizes import landscape, letter
from .models import Certificate
from .permissions import IsRegistrar, ScopeToInstitution
from .serializers import (
    BulkCreateRequestSerializer,
    CertificateEditSerializer,
    CertificateReadSerializer,
)

log = logging.getLogger(__name__)


def _is_admin_user(user) -> bool:
    """Vérification robuste basée sur le modèle User."""
    if not user or not user.is_authenticated:
        return False
    return bool(
        getattr(user, "is_staff", False)
        or getattr(user, "is_superuser", False)
        or getattr(user, "is_administrator", False)
        or getattr(user, "role", "") in ["admin", "ADMIN", "ministry", "MINISTRY"]
    )


class BulkCreateView(APIView):
    """POST an array of cert rows for one cohort. Atomic; all-or-nothing."""

    permission_classes = [IsRegistrar, MustChangePasswordAllowed]

    def post(self, request):
        ser = BulkCreateRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        items = ser.validated_data["items"]

        institution = request.user.institution
        if institution is None or institution.status != Institution.Status.ACTIVE:
            raise PermissionDenied("Your institution is not active.")

        rows = []
        with transaction.atomic():
            students_by_name = _resolve_students(institution, items)
            for item in items:
                rows.append(_build_row(institution, students_by_name[item["student_name"]], item))
            try:
                Certificate.objects.bulk_create(rows)
            except IntegrityError as exc:
                raise ValidationError(
                    {"items": f"Batch could not be saved: {exc}"}
                ) from exc

            cohort_number = items[0]["cohort_number"]
            ids = [r.certificate_id for r in rows]
            
            # Utilisation de json.dumps pour garantir un JSON valide et propre
            detail_data = {
                "cohort_number": cohort_number,
                "submitted": len(items),
                "created": len(rows),
                "certificate_ids": ids,
            }
            
            log_action(
                actor=request.user,
                action=ActivityLog.Action.CERT_REGISTERED,
                institution=institution,
                detail=json.dumps(detail_data),
            )

        created = (
            Certificate.objects
            .select_related("student", "institution")
            .filter(certificate_id__in=ids)
        )
        return Response(
            CertificateReadSerializer(created, many=True).data,
            status=status.HTTP_201_CREATED,
        )


def _resolve_students(institution, items) -> dict[str, Student]:
    unique_names = {i["student_name"] for i in items}
    out: dict[str, Student] = {}
    for name in unique_names:
        student, _created = Student.objects.get_or_create(
            full_name=name, institution=institution,
        )
        out[name] = student
    return out


def _build_row(institution, student: Student, item: dict) -> Certificate:
    return Certificate(
        certificate_id=item["certificate_id"],
        student=student,
        institution=institution,
        cohort_number=item["cohort_number"],
        degree=item["degree"],
        program=item["program"],
        issued_date=item["issued_date"],
        status=Certificate.Status.GRACE_PERIOD,
    )


class CertificateListView(ListAPIView):
    """GET /api/certificates/?institution=<id>&status=<choice>"""

    serializer_class = CertificateReadSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # Désactive la pagination pour renvoyer un tableau direct [...]

    def get_queryset(self):
        user = self.request.user
        qs = Certificate.objects.select_related("student", "institution")
        
        is_admin = _is_admin_user(user)

        if is_admin:
            institution_id = self.request.query_params.get("institution")
            if institution_id:
                qs = qs.filter(institution_id=institution_id)
        else:
            if not user.institution:
                return Certificate.objects.none()
            qs = qs.filter(institution=user.institution)

        status_param = self.request.query_params.get("status")
        if status_param and status_param.strip().lower() != "all":
            qs = qs.filter(status=status_param)
            
        return qs.order_by("-issued_date", "certificate_id")


class CertificateDetailView(APIView):
    """PATCH /api/certificates/<certificate_id>/"""

    permission_classes = [IsRegistrar, ScopeToInstitution, MustChangePasswordAllowed]

    def patch(self, request, certificate_id: str):
        try:
            cert = Certificate.objects.select_related("student", "institution").get(
                certificate_id=certificate_id,
            )
        except Certificate.DoesNotExist:
            raise NotFound("Certificate not found.")

        self.check_object_permissions(request, cert)

        if not cert.is_editable():
            raise ValidationError(
                {"status": f"Certificate is {cert.status}; only grace_period certificates are editable."}
            )

        ser = CertificateEditSerializer(cert, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()

        changed_fields = sorted(ser.validated_data.keys())
        detail = json.dumps({"fields_changed": changed_fields})
        log_action(
            actor=request.user,
            action=ActivityLog.Action.CERT_EDITED,
            institution=cert.institution,
            certificate=cert,
            detail=detail,
        )

        return Response(CertificateReadSerializer(cert).data)


class CertificateQRCodeView(APIView):
    """GET /api/certificates/<certificate_id>/qr/"""
    permission_classes = [AllowAny]

    def get(self, request, certificate_id: str):
        try:
            cert = Certificate.objects.get(certificate_id=certificate_id)
        except Certificate.DoesNotExist:
            raise NotFound("Certificate not found.")

        verify_url = request.build_absolute_uri(f"/verify/{cert.certificate_id}/")

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(verify_url)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")

        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)

        return HttpResponse(buffer.getvalue(), content_type="image/png")


class VerifyCertificateView(RetrieveAPIView):
    """GET /api/certificates/<certificate_id>/verify/"""
    queryset = Certificate.objects.all()
    serializer_class = CertificateReadSerializer
    lookup_field = "certificate_id"
    permission_classes = [AllowAny]


class AnchorCertificateView(APIView):
    """POST /api/certificates/<certificate_id>/anchor/"""

    permission_classes = [IsRegistrar, ScopeToInstitution, MustChangePasswordAllowed]

    def post(self, request, certificate_id: str):
        try:
            cert = Certificate.objects.select_related("student", "institution").get(
                certificate_id=certificate_id,
            )
        except Certificate.DoesNotExist:
            raise NotFound("Certificate not found.")

        self.check_object_permissions(request, cert)

        if not cert.is_editable():
            raise ValidationError(
                {"status": f"Certificate is {cert.status}; only grace_period certificates can be anchored."}
            )

        tx_hash = request.data.get("tx_hash")
        if not tx_hash or not isinstance(tx_hash, str):
            raise ValidationError({"tx_hash": "tx_hash is required (the MetaMask transaction hash)."})

        on_chain_hash = make_reader().get_anchored_hash(cert.certificate_id)
        if on_chain_hash is None:
            raise ValidationError(
                {"chain": "Chain has not yet recorded an anchor for this certificate."}
            )

        from .hashing import compute_content_hash
        expected = compute_content_hash(cert)
        if on_chain_hash != expected:
            raise ValidationError(
                {"hash": "Content hash mismatch between chain and current certificate."}
            )

        cert.chain_hash = on_chain_hash.hex()
        cert.tx_hash = tx_hash
        cert.status = Certificate.Status.ANCHORED
        cert.save(update_fields=["chain_hash", "tx_hash", "status", "updated_at"])

        log_action(
            actor=request.user,
            action=ActivityLog.Action.CERT_ANCHORED,
            institution=cert.institution,
            certificate=cert,
            detail=json.dumps({"tx_hash": tx_hash}),
        )

        return Response(CertificateReadSerializer(cert).data)


class DisableCertificateView(APIView):
    """POST /api/certificates/<certificate_id>/disable/"""

    permission_classes = [IsRegistrar, ScopeToInstitution, MustChangePasswordAllowed]
    _MAX_REASON_LEN = 512

    def post(self, request, certificate_id: str):
        try:
            cert = Certificate.objects.select_related("student", "institution").get(
                certificate_id=certificate_id,
            )
        except Certificate.DoesNotExist:
            raise NotFound("Certificate not found.")

        self.check_object_permissions(request, cert)

        if cert.status == Certificate.Status.DISABLED:
            return Response(CertificateReadSerializer(cert).data)

        reason = request.data.get("reason")
        if not isinstance(reason, str):
            raise ValidationError({"reason": "Reason is required (string)."})
        reason = reason.strip()
        if not reason:
            raise ValidationError({"reason": "Reason cannot be blank."})

        previous_status = cert.status
        cert.status = Certificate.Status.DISABLED
        cert.disabled_at = datetime.now(tz=timezone.utc)
        cert.disabled_reason = reason
        cert.save(update_fields=["status", "disabled_at", "disabled_reason", "updated_at"])

        log_action(
            actor=request.user,
            action=ActivityLog.Action.CERT_DISABLED,
            institution=cert.institution,
            certificate=cert,
            detail=json.dumps({"previous_status": previous_status, "reason": reason}),
        )

        return Response(CertificateReadSerializer(cert).data)




# print certificate list in institution side
class CertificateListPrintAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        qs = Certificate.objects.select_related("student", "institution")

        if _is_admin_user(user):
            institution_id = request.query_params.get("institution")
            if institution_id:
                qs = qs.filter(institution_id=institution_id)
        else:
            if not user.institution:
                raise PermissionDenied("User is not linked to any institution.")
            qs = qs.filter(institution=user.institution)

        certificates = qs.order_by("-issued_date", "certificate_id")

        # Création du buffer PDF en mémoire (Format paysage pour faire tenir les 6 colonnes sans coupure)
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=landscape(letter), 
            rightMargin=30, 
            leftMargin=30, 
            topMargin=30, 
            bottomMargin=30
        )
        elements = []

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'TitleStyle', 
            parent=styles['Heading1'], 
            fontSize=16, 
            leading=20, 
            textColor=colors.HexColor('#1a1a1a')
        )
        
        elements.append(Paragraph("Official list of Certificate", title_style))
        elements.append(Spacer(1, 15))

        cell_style = ParagraphStyle(
            'CellStyle',
            parent=styles['Normal'],
            fontSize=8,
            leading=10,
            textColor=colors.HexColor('#1a1a1a')
        )
        header_style = ParagraphStyle(
            'HeaderStyle',
            parent=styles['Normal'],
            fontSize=8,
            leading=10,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a')
        )

        # Construction des en-têtes du tableau avec Paragraph pour éviter les dépassements
        table_data = [[
            Paragraph("Status", header_style),
            Paragraph("Certificate ID", header_style),
            Paragraph("Student Name", header_style),
            Paragraph("Issued Date", header_style),
            Paragraph("Program/Course", header_style),
            Paragraph("Degree", header_style),
        ]]

        for cert in certificates:
            status_val = str(getattr(cert, 'status', '')).replace('_', ' ')
            cert_id = str(getattr(cert, 'certificate_id', ''))
            student_name = cert.student.full_name if cert.student else "—"
            issued_date = str(cert.issued_date) if cert.issued_date else "—"
            program = str(getattr(cert, 'program', '—'))
            degree = str(getattr(cert, 'degree', '—'))

            table_data.append([
                Paragraph(status_val, cell_style),
                Paragraph(cert_id, cell_style),
                Paragraph(student_name, cell_style),
                Paragraph(issued_date, cell_style),
                Paragraph(program, cell_style),
                Paragraph(degree, cell_style),
            ])

        # Largeurs de colonnes ajustées pour le format paysage (total = 750)
        t = Table(table_data, colWidths=[90, 135, 135, 75, 150, 165])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f4f5f7')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ]))

        elements.append(t)
        doc.build(elements)

        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = 'attachment; filename="Inst_certificates_report.pdf"'
        return response




#generate the report document in admin side
def generate_bulk_pdf_document(queryset, view_type):
    buffer = io.BytesIO()
    # Utilisation du format paysage (landscape) pour avoir assez d'espace pour toutes les colonnes
    from reportlab.lib.pagesizes import landscape
    p = canvas.Canvas(buffer, pagesize=landscape(letter))
    width, height = landscape(letter)

    # Titre du document
    p.setFont("Helvetica-Bold", 16)
    p.drawString(40, height - 40, f"ACVS Report: {view_type}")
    
    p.setFont("Helvetica", 10)
    p.drawString(40, height - 60, f"Total records: {queryset.count()}")

    # En-têtes du tableau
    y = height - 90
    p.setFont("Helvetica-Bold", 8)
    p.drawString(40, y, "Status")
    p.drawString(120, y, "Certificate ID")
    p.drawString(250, y, "Student Name")
    p.drawString(400, y, "Issued Date")
    p.drawString(500, y, "Program")
    p.drawString(640, y, "Degree")
    
    y -= 10
    p.line(40, y, width - 40, y)
    y -= 18

    p.setFont("Helvetica", 8)
    for cert in queryset:
        if y < 40:  # Nouvelle page si on arrive en bas
            p.showPage()
            y = height - 40
            p.setFont("Helvetica", 8)

        status = str(getattr(cert, 'status', view_type))
        cert_id = str(getattr(cert, 'certificate_number', getattr(cert, 'certificate_id', getattr(cert, 'id', 'N/A'))))
        student_name = 'N/A'
        if hasattr(cert, 'student') and cert.student:
            if isinstance(cert.student, str):
                student_name = cert.student
            elif hasattr(cert.student, 'full_name'):
                student_name = cert.student.full_name
            elif hasattr(cert.student, 'name'):
                student_name = cert.student.name
        
        if student_name == 'N/A':
            student_name = str(
                getattr(cert, 'student_name', 
                getattr(cert, 'student_full_name', 
                getattr(cert, 'full_name', 'N/A')))
            )
        
        # Récupération de la date d'émission
        issued_date = getattr(cert, 'issued_date', getattr(cert, 'created_at', 'N/A'))
        if issued_date:
            issued_date = str(issued_date)[:10] # Garder format YYYY-MM-DD
            
        program = str(getattr(cert, 'program', getattr(cert, 'field_of_study', 'N/A')))
        degree = str(getattr(cert, 'degree_title', getattr(cert, 'degree', 'N/A')))

        # Écriture des données ligne par ligne
        p.drawString(40, y, status[:16])
        p.drawString(120, y, cert_id[:20])
        p.drawString(250, y, student_name[:25])
        p.drawString(400, y, str(issued_date)[:12])
        p.drawString(500, y, program[:22])
        p.drawString(640, y, degree[:20])

        y -= 18

    p.showPage()
    p.save()
    
    buffer.seek(0)
    return buffer


# print the certificate report in admin side
class CertificateBulkPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        view_type = request.GET.get('view', 'ALL_CERTS')
        
        queryset = Certificate.objects.all()
        if view_type == 'ANCHORED':
            queryset = queryset.filter(status__icontains='ANCHOR')
        elif view_type == 'GRACE_PERIOD':
            queryset = queryset.filter(status__icontains='GRACE')
        elif view_type == 'REVOKED':
            queryset = queryset.filter(status__icontains='DISABLED')

        try:
            # Ensure this utility returns a valid binary buffer or bytes for the PDF
            pdf_buffer = generate_bulk_pdf_document(queryset, view_type)
            
            response = HttpResponse(pdf_buffer, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="certificates_report_{view_type.lower()}.pdf"'
            return response
        except Exception as e:
            print("PDF Generation Error:", traceback.format_exc())
            return Response({"detail": str(e)}, status=500)