"""Custom DRF exception handler — flattens all errors to a single shape.

Response shape:
    ValidationError →  {"error": "validation_error", "details": {...}}
    other APIEx   →   {"error": "<class name>",    "detail":  "..."}
    unhandled     →   {"error": "internal_server_error"} (status 500)
"""

from __future__ import annotations

import logging
from typing import Any

from rest_framework import status as drf_status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    response = drf_exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled exception in API view: %s", exc)
        return Response({"error": "internal_server_error"}, status=drf_status.HTTP_500_INTERNAL_SERVER_ERROR)

    if isinstance(exc, ValidationError):
        response.data = {
            "error": "validation_error",
            "details": response.data,
        }
        return response

    detail = response.data
    if isinstance(detail, dict) and "detail" in detail:
        detail_text = detail["detail"]
    else:
        detail_text = detail

    response.data = {
        "error": getattr(exc, "default_code", exc.__class__.__name__).lower(),
        "detail": detail_text,
    }
    return response
