"""URL routes for the certificates app.

* POST  /api/certificates/bulk-create/             BulkCreateView
* GET   /api/certificates/                          CertificateListView
* GET   /api/certificates/print/                    CertificateListPrintAPIView
* PATCH /api/certificates/<certificate_id>/         CertificateDetailView
* POST  /api/certificates/<certificate_id>/anchor/  AnchorCertificateView
* POST  /api/certificates/<certificate_id>/disable/ DisableCertificateView
"""

from django.urls import path

from .views import (
    AnchorCertificateView,
    BulkCreateView,
    CertificateDetailView,
    CertificateListView,
    DisableCertificateView,
    CertificateQRCodeView, 
    VerifyCertificateView,
    CertificateListPrintAPIView,
    CertificateBulkPDFView,
)

app_name = "certificates"

urlpatterns = [
    path("bulk-create/", BulkCreateView.as_view(), name="bulk-create"),
    path('print/', CertificateListPrintAPIView.as_view(), name='certificate-print'),
    path('bulk-pdf/', CertificateBulkPDFView.as_view(), name='certificate-bulk-pdf'),
    path("", CertificateListView.as_view(), name="list"),

    path("<str:certificate_id>/qr/", CertificateQRCodeView.as_view(), name="qr-code"),
    path("<str:certificate_id>/verify/", VerifyCertificateView.as_view(), name="verify"),
    path("<str:certificate_id>/anchor/", AnchorCertificateView.as_view(), name="anchor"),
    path("<str:certificate_id>/disable/", DisableCertificateView.as_view(), name="disable"),
    path("<str:certificate_id>/", CertificateDetailView.as_view(), name="detail"),
]