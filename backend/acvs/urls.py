"""Root URLconf.

Layout:
    /admin/                        Django admin
    /api/auth/                     accounts.urls
    /api/certificates/             certificates.urls
    /api/institutions/             institutions.urls             (§2: list, status; §4: staff)
    /api/verify/                   verification.urls
    /api/audit/                    audit.urls                    (§3: ActivityLog read)
"""

from django.contrib import admin
from django.urls import include, path
from institutions.views import AdminOverviewStatsView, InstitutionListView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/certificates/", include("certificates.urls")),
    path("api/institutions/", include("institutions.urls")),
    path("api/verify/", include("verification.urls")),
    path("api/audit/", include("audit.urls")),
    path('api/admin/overview-stats/', AdminOverviewStatsView.as_view(), name='admin-overview-stats'),
    path("api/admin/institutions/", InstitutionListView.as_view(), name="admin-institutions-list"),
]
