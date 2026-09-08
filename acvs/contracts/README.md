# ACVS Contracts

Smart contracts for the ACVS certificate registry. Truffle-based, deploying to a local
Ganache instance for development.

## Layout

```
contracts/   Solidity sources
migrations/  Truffle deployment scripts
test/        Mocha/Chai test suite
build/       Truffle compile output (gitignored)
truffle-config.js
```

## Setup

```bash
npm install
```

## Compile

```bash
npm run compile
```

## Test

Start Ganache on `127.0.0.1:7545`, then:

```bash
npm run test
```

## Migrate (local Ganache)

Start Ganache on `127.0.0.1:7545`, then:

```bash
npm run migrate
# or to reset and redeploy
npm run migrate:reset
```

## Contract: `CertificateRegistry`

| Function                                              | Mutates state | Description                                                                 |
| ----------------------------------------------------- | -------------- | --------------------------------------------------------------------------- |
| `anchorCertificate(bytes32 certificateId, bytes32 hash)` | yes          | Anchors a hash against a certificate ID. Reverts if already anchored.       |
| `disableCertificate(bytes32 certificateId)`           | yes            | Flags a certificate as disabled. Record is preserved.                       |
| `getCertificate(bytes32 certificateId)`              | no             | Returns `(hash, disabled, anchored)`. Zero/`false` for never-anchored IDs. |

Events:

- `CertificateAnchored(bytes32 indexed certificateId, bytes32 hash)`
- `CertificateDisabled(bytes32 indexed certificateId)`

State-changing functions are protected by a basic reentrancy guard. The contract
intentionally has **no** ownership or role logic — gating is the responsibility of
the calling layer (Django/frontend) in a later phase.
