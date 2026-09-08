"""Django settings for the ACVS backend.

PostgreSQL is the production database; the DATABASE_URL-style env vars come from `.env`.
`acvs.settings_test` swaps the engine to SQLite-in-memory for pytest.
"""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def _env(name: str, default: str | None = None, *, required: bool = False) -> str:
    value = os.environ.get(name, default)
    if required and not value:
        raise RuntimeError(f"Required environment variable {name!r} is not set.")
    return value or ""


# --- Core -----------------------------------------------------------------

SECRET_KEY = _env("SECRET_KEY", required=True)
DEBUG = _env("DJANGO_DEBUG", "0") == "1"
ALLOWED_HOSTS = [h.strip() for h in _env("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]


# --- Apps -----------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "accounts.apps.AccountsConfig",
    "institutions.apps.InstitutionsConfig",
    "students.apps.StudentsConfig",
    "certificates.apps.CertificatesConfig",
    "verification.apps.VerificationConfig",
    "audit.apps.AuditConfig",
    "corsheaders",
  
]

AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "acvs.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "acvs.wsgi.application"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# --- Database -------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": _env("PGDATABASE", "acvs"),
        "USER": _env("PGUSER", "acvs"),
        "PASSWORD": _env("PGPASSWORD", ""),
        "HOST": _env("PGHOST", "127.0.0.1"),
        "PORT": _env("PGPORT", "5432"),
        "CONN_MAX_AGE": 60,
        "OPTIONS": {
            "connect_timeout": 5,
        },
    }
}


# --- DRF & simplejwt ------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "certificates.pagination.CertificatePageNumberPagination",
    "PAGE_SIZE": 25,
    "EXCEPTION_HANDLER": "acvs.exceptions.api_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}


# --- Auth -----------------------------------------------------------------
# Custom UppercaseValidator / NumberValidator / SpecialCharValidator

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    {"NAME": "accounts.validators.UppercaseValidator"},
    {"NAME": "accounts.validators.NumberValidator"},
    {"NAME": "accounts.validators.SpecialCharValidator"},
]


# --- Email ----------------------------------------------------------------

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
DEFAULT_FROM_EMAIL = _env("DEFAULT_FROM_EMAIL", "no-reply@acvs.local")
FRONTEND_URL = _env("FRONTEND_URL", "http://localhost:5173")


# --- CORS -----------------------------------------------------------------
# Comma-separated list of allowed origins. The SPA runs on Vite's default
# 5173 in dev; production should set CORS_ALLOWED_ORIGINS to the deployed
# frontend origin(s). This backend never reflects arbitrary origins
# (CORS_ALLOW_ALL_ORIGINS stays off).

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in _env("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

CORS_ALLOWED_HEADERS = list(default_headers) + [
    "accept",
    "accept-encoding",
    "authentication",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",

]

# --- Chain / web3 ---------------------------------------------------------
# Ganache defaults match the contracts/ truffle-config.js. This backend
# only READS chain state (never writes), so an empty CHAIN_REGISTRY_ADDRESS
# disables the chain read entirely: the verify endpoint returns
# chain_state="unreachable" without touching the network.

WEB3_RPC_URL = _env("WEB3_RPC_URL", "http://127.0.0.1:7545")
WEB3_RPC_TIMEOUT = int(_env("WEB3_RPC_TIMEOUT", "3"))
CHAIN_REGISTRY_ADDRESS = _env("CHAIN_REGISTRY_ADDRESS", "")
# CONTRACTS_ABI_PATH is intentionally NOT assigned here — chain.py's
# _load_abi() computes a sensible default (the ABI file in
# contracts/build/contracts/) and only honors an override when the
# env var is explicitly set in the environment. Setting it to ""
# here would shadow the default with Path(""), which resolves to "."
# and crashes with PermissionError on open().


# --- I18n / static --------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
