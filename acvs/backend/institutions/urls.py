"""URL routes for the institutions app.

Layout:
  * GET  /api/institutions/                       list (admin-only) — §2
  * POST /api/institutions/<id>/status/           status update (admin) — §2
  * GET  /api/institutions/<id>/staff/            list institution's users — §4
  * POST /api/institutions/<id>/staff/invite/     invite a new registrar — §4
"""

from __future__ import annotations

from django.urls import include, path

from . import staff_views
from . import views as institution_views


urlpatterns = [
    path("", institution_views.InstitutionListView.as_view(), name="list"),
    path(
        "<int:pk>/status/",
        institution_views.InstitutionStatusUpdateView.as_view(),
        name="status-update",
    ),
    
    # Staff-management endpoints (option a — see staff_views.py).
    path(
        "<int:institution_id>/staff/",
        include(
            [
                path(
                    "",
                    staff_views.StaffListView.as_view(),
                    name="staff-list",
                ),
                path(
                    "invite/",
                    staff_views.StaffInviteView.as_view(),
                    name="staff-invite",
                ),
            ]
        ),
    ),
]