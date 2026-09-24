
# ACVS - Academic Certificate Verification System

A pilot-scope implementation of a blockchain-backed academic certificate verification platform
for the Democratic Republic of Congo, built as a final-year thesis project (Catholic University
of Eastern Africa). Institutions register certificates; anyone can verify one publicly, without
logging in, by ID or QR code.

## What this actually is

A certificate record has exactly three possible states, and that lifecycle is the core idea the
whole system is built around:

```
Registered → Grace Period (editable) → Anchored (permanent, on-chain) → optionally Disabled
```

While a certificate is in its **grace period**, an institution can correct mistakes - a
misspelled name, a wrong date. Once anchored, a cryptographic hash of the certificate's content
is written to an Ethereum smart contract, and the record becomes permanent: nothing can silently
change it afterward. If an institution needs to invalidate a certificate later, it isn't
deleted - it's marked **Disabled**, and that mark is itself permanent and publicly visible.

Full design rationale lives in [`design/DESIGN.md`](design/DESIGN.md).

## Tech stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity, compiled/deployed via Truffle, tested against Ganache |
| Backend | Django + Django REST Framework, PostgreSQL, `web3.py` for reading chain state |
| Frontend | React (plain JavaScript, not TypeScript) via Vite, React Router, Tailwind, `web3.js` + MetaMask for the one blockchain-writing action (anchoring) |
| Auth | Custom JWT flow (`djangorestframework-simplejwt`) with mandatory OTP, not Django's built-in session auth - this is a JSON API for a React SPA |

This stack was deliberately kept close to the thesis proposal's own wording ("React.js and
JavaScript," Section 3.5)0 - no Next.js, no TypeScript, no framework beyond what's actually named.


## Repository layout

```
acvs/
├── contracts/     Solidity source, Truffle project, contract tests
├── backend/       Django project - auth, certificates, institutions, audit log, verification
├── frontend/      React app (Vite)
└── design/        DESIGN.md (the design system) + design/screens/
```

## Prerequisites

- **Node.js** (for `contracts/` and `frontend/`)
- **Python 3.12 or 3.13** - not 3.14, which lacks prebuilt wheels for some dependencies
  (`web3.py`'s `lru-dict`/`ckzg` C extensions specifically)
- **PostgreSQL**
- **Microsoft C++ Build Tools** (Windows only) - needed to build `web3.py`'s C-extension
  dependencies if no prebuilt wheel matches your exact Python version
- **GNU Make** - Windows doesn't ship this; install with `choco install make -y`
- **MetaMask** browser extension, for the institution-side anchoring flow

## Setup

```bash
git clone <this repo>
cd acvs
make install
```

Then create your real environment file:
```bash
cp backend/.env.example backend/.env
```
Open `backend/.env` and fill in real values - database credentials, and (after your first
`make ganache` + `make migrate-contracts` run) the deployed contract address as
`CHAIN_REGISTRY_ADDRESS`.

Create the Postgres database and user referenced in `.env` (see `backend/.env.example` for the
exact names expected), then:

```bash
make migrate-backend
make seed
```

`make seed` creates one demo institution and one demo registrar account - check
`backend/institutions/management/commands/seed_demo.py` for the actual generated credentials
rather than guessing.

## Running it day to day

Four terminals, three of them long-running. All commands run from the repo root via the
Makefile - see `make help` for the full list.

**Terminal 1 - the local blockchain:**
```bash
make ganache
```

**Terminal 2 - the backend:**
```bash
make backend
```

**Terminal 3 - the frontend:**
```bash
make frontend
```
Open `http://localhost:5173`.

**MetaMask**, for anchoring certificates: connect to a custom network at
`http://127.0.0.1:7545`, chain ID `1337`, and import an account using one of the private keys
Ganache prints on startup. Once imported, it stays valid across restarts - see the note below.

### Why the Ganache mnemonic is pinned

`make ganache` starts Ganache with a fixed mnemonic and a persistent database path
(`contracts/ganache-data/`), rather than the plain, unconfigured default. This matters: a plain
`ganache` start generates a **new random wallet every time**, which means every restart would
silently invalidate whatever account you'd already imported into MetaMask and whatever contract
address is sitting in `.env`. Pinning the mnemonic and persisting the chain means the accounts
and the deployed contract survive restarts - set it up correctly once, and it stays correct.

**The first time** you run `make ganache` against a fresh (empty) `ganache-data/` folder, also
run `make migrate-contracts` once, then copy the printed contract address into
`backend/.env`'s `CHAIN_REGISTRY_ADDRESS`. After that, this step never needs repeating unless
`ganache-data/` is deleted.

## Testing

```bash
make test-backend      # pytest - auth, certificates, institutions, audit log, verification
make test-contracts    # Solidity contract tests (requires Ganache running in another terminal)
make test               # both
```

Testing follows the V-Model described in the thesis methodology (Chapter 3.6): unit and
integration tests are automated and run above; system testing (full workflows - cohort
registration, QR scanning, verification) and UAT are manual,

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ModuleNotFoundError` after `pip install` | Package listed in `requirements.txt` but not actually installed into the venv | Re-run `make install-backend` explicitly, confirm with `backend/.venv/Scripts/python.exe -c "import <module>"` |
| CORS "Missing Allow Origin" in the browser | `django-cors-headers` misconfigured, or configured but not installed | Check `INSTALLED_APPS`/`MIDDLEWARE` in `backend/acvs/settings.py`, confirm the package is actually installed |
| `chain_state` always `"unreachable"` | `WEB3_RPC_URL` port mismatch | This project standardizes on **7545**, not 8545 (a different Ganache variant's default) - confirm `backend/.env` matches |
| Ganache restart changes the contract address again | Started without the pinned mnemonic/persistent path | Use `make ganache`, not a bare `npx ganache` command |
| MetaMask shows `$0.00` / wrong balance | Wrong network or account selected | Explicitly select the Ganache network and the imported account in MetaMask's own small popup - not `app.metamask.io`, which is a separate site entirely |
| Password-reset email links to the wrong port | `FRONTEND_URL` in `backend/.env` doesn't match Vite's actual port (5173) | Set it explicitly, restart the backend |

Editing any `.env` file requires **restarting** whatever server reads it - Django and Vite both
only read their environment at startup, not live.

## Academic context

Built against the methodology described in Chapter 3 of the accompanying thesis proposal -
hybrid PostgreSQL/Ethereum architecture, V-Model testing, and a Pilot Deployment strategy
(single institution, not a public launch). Scope decisions throughout this codebase favor
components that are easy to explain and defend individually over generalized abstractions.
=======

