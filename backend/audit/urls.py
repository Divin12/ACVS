"""URL routes for the audit app.

One read endpoint, one URL. See /audit/views.py for the view.
"""

from __future__ import annotations

from django.urls import path

from .views import ActivityLogListView

urlpatterns = [
    path("", ActivityLogListView.as_view(), name="list"),
]
