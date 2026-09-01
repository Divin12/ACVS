# ACVS — root Makefile
#
# Run this from Git Bash, not PowerShell. Make's recipes below run through a
# POSIX-style shell; PowerShell doesn't understand them the same way (this
# project already hit that exact mismatch once with `rm -rf`).
#
# Requires GNU Make. Windows doesn't ship it — install once with:
#   choco install make -y
# (We already have Chocolatey from the PostgreSQL setup)
#
# Run `make help` to see everything below, explained.

.PHONY: help install install-contracts install-backend install-frontend \
        ganache backend frontend \
        migrate-contracts migrate-backend seed \
        test-backend test-contracts test clean

# --- Paths ---------------------------------------------------------------
# Reference the venv's own python/pip binaries directly, by path, instead of
# "activating" the venv in the recipe shell. Activation scripts are shell-
# specific (.ps1 vs the bash-sourced version) and this project already lost
# real time earlier to "which python actually ran" confusion — referencing
# the binary directly sidesteps that class of bug entirely.
ifeq ($(OS),Windows_NT)
    VENV_PY  = backend/.venv/Scripts/python.exe
    VENV_PIP = backend/.venv/Scripts/pip.exe
else
    VENV_PY  = backend/.venv/bin/python
    VENV_PIP = backend/.venv/bin/pip
endif

# Pinned so every `make ganache` run produces the same accounts and, once
# migrated once, the same contract address — see README.md "Why the
# Ganache mnemonic is pinned" for the full reasoning.
GANACHE_MNEMONIC = "wolf orient sand combine obscure wreck salt weather cool title latin stairs"

# --- Help ------------------------------------------------------------------

help:
	@echo ""
	@echo "ACVS — available commands"
	@echo ""
	@echo "  make install              Install everything (contracts, backend venv, frontend)"
	@echo ""
	@echo "  --- One-time / occasional ---"
	@echo "  make migrate-contracts    Deploy the smart contract (only on a fresh ganache-data/)"
	@echo "  make migrate-backend      Apply Django migrations"
	@echo "  make seed                 Create the demo institution + registrar account"
	@echo ""
	@echo "  --- Daily dev servers — run each in ITS OWN terminal, in this order ---"
	@echo "  make ganache              Terminal 1: local blockchain (persistent, pinned accounts)"
	@echo "  make backend              Terminal 2: Django dev server"
	@echo "  make frontend             Terminal 3: Vite dev server"
	@echo ""
	@echo "  --- Testing ---"
	@echo "  make test-backend         Run the backend pytest suite"
	@echo "  make test-contracts       Run contract tests (needs Ganache running separately)"
	@echo "  make test                 Run both test suites"
	@echo ""
	@echo "  make clean                Remove caches/build artifacts (keeps ganache-data/, .env)"
	@echo ""

# --- Install ---------------------------------------------------------------

install: install-contracts install-backend install-frontend
	@echo ""
	@echo "All dependencies installed. Next: copy backend/.env.example to backend/.env,"
	@echo "fill in real values, then run: make migrate-backend && make seed"
	@echo ""

install-contracts:
	cd contracts && npm install

install-backend:
	@echo "NOTE: this uses whatever 'python' resolves to on your PATH."
	@echo "This project needs Python 3.12 or 3.13 specifically — NOT 3.14, which"
	@echo "lacks prebuilt wheels for some dependencies. If this fails partway"
	@echo "through pip install, that's almost certainly why. Check with:"
	@echo "  py -0   (lists installed Python versions on Windows)"
	@echo "and create the venv explicitly with the right one if needed, e.g.:"
	@echo "  py -3.12 -m venv backend/.venv"
	python -m venv backend/.venv
	$(VENV_PIP) install -r backend/requirements.txt

install-frontend:
	cd frontend && npm install

# --- One-off commands --------------------------------------------------------

migrate-contracts:
	cd contracts && npm run migrate

migrate-backend:
	$(VENV_PY) backend/manage.py migrate

seed:
	$(VENV_PY) backend/manage.py seed_demo

# --- Daily dev servers — each blocks its terminal on purpose ----------------
# These are meant to run concurrently, one per terminal — not chained
# together in one command. A single Makefile target that tried to launch
# all three at once would need to manage three long-running background
# processes and their interleaved output, which is more fragile than just
# opening three terminals. Keep it simple and explicit.

ganache:
	cd contracts && npx ganache --port 7545 \
		--database.dbPath ./ganache-data \
		--wallet.mnemonic $(GANACHE_MNEMONIC)

backend:
	$(VENV_PY) backend/manage.py runserver

frontend:
	cd frontend && npx vite

# --- Testing -----------------------------------------------------------------

test-backend:
	$(VENV_PY) -m pytest backend

test-contracts:
	cd contracts && npm run test

test: test-backend test-contracts

# --- Cleanup -------------------------------------------------------------------

clean:
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find backend -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/dist
	rm -rf contracts/build
	@echo "Cleaned build caches. ganache-data/ and .env files were left alone on purpose."
