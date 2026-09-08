"""Test settings — swaps the engine to SQLite-in-memory.

pytest-django picks this up via `DJANGO_SETTINGS_MODULE = acvs.settings_test`
in pytest.ini. Production stays on Postgres.
"""

import os

# Provide a stable SECRET_KEY so settings.py's required-env check passes
# before we override SECRET_KEY after the import.
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
# Disable the chain read in tests so the verify endpoint never tries to
# reach Ganache. CHAIN_REGISTRY_ADDRESS="" makes make_reader() return the
# _DisabledReader stub, which always reports "unreachable".
os.environ.setdefault("WEB3_RPC_URL", "http://127.0.0.1:7545")
os.environ.setdefault("WEB3_RPC_TIMEOUT", "3")
os.environ.setdefault("CHAIN_REGISTRY_ADDRESS", "")

# Inherit every base setting, then override what we need for tests.
from .settings import *  # noqa: F401,F403  (must come after the os.environ.setdefault above)

SECRET_KEY = "test-secret-key-not-for-production"

# Don't depend on a real Postgres: SQLite-in-memory works in this env.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
