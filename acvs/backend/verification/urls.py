"""URL routes for the verification app.

* GET /api/verify/<certificate_id>/   PublicVerifyView (no auth)
"""

from django.urls import path

from .views import PublicVerifyView

app_name = "verification"

urlpatterns = [
    path("<str:certificate_id>/", PublicVerifyView.as_view(), name="public-verify"),
]
