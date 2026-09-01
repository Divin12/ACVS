// Records a confirmed-on-chain anchor against the backend.
//
// POST /api/certificates/<certificate_id>/anchor/  with  { tx_hash }
// → 200 returns the full CertificateReadSerializer rendering (now with
//   status=anchored, chain_hash=<real on-chain value>, tx_hash=<ours>).
//
// The backend independently re-reads the chain to verify the anchor
// exists and that the on-chain hash matches the cert's recomputed
// content hash — this wrapper passes ONLY tx_hash (audit only) and
// never the chain_hash or any client-side hash, per the trust-the-
// chain contract pinned in backend/CLAUDE.md.
//
// Errors are typed so the AnchoringConfirmation screen can branch on
// `err.kind` and surface specific copy for each rejection (chain not
// yet recorded, hash mismatch, not grace period, missing tx_hash).

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/**
 * @param {object} args
 * @param {string} args.accessToken   JWT access token from AuthContext.
 * @param {string} args.certificateId The public certificate_id, e.g. "ACVS-2026-XXXXXXXX".
 * @param {string} args.txHash        0x-prefixed 64-hex-char tx hash returned by MetaMask.
 * @returns {Promise<object>}         The serialized cert on success.
 */
export async function recordAnchor({ accessToken, certificateId, txHash }) {
  if (!accessToken) {
    const err = new Error('Missing access token — sign in again.')
    err.kind = 'auth_missing'
    throw err
  }
  if (!certificateId) {
    const err = new Error('Missing certificate id.')
    err.kind = 'bad_request'
    throw err
  }
  if (!txHash) {
    const err = new Error('Missing tx hash from MetaMask.')
    err.kind = 'missing_tx_hash'
    throw err
  }

  const res = await fetch(`${API_BASE}/api/certificates/${certificateId}/anchor/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ tx_hash: txHash }),
  })

  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON; leave body as null */
  }

  if (res.ok) {
    return body
  }

  // 4xx — derive `kind` from the backend's structured details envelope
  // (DRF ValidationError renders as {error, details: {field: msg}} for
  // explicit field errors, or {error, details: {detail: msg}} for the
  // generic case). The backend puts each rejection reason in a named
  // field, so the screen can branch on field presence without parsing
  // prose.
  const err = new Error(deriveMessage(body, res.status))
  err.status = res.status
  err.body = body
  err.details = body?.details ?? null
  err.kind = deriveKind(body, res.status)
  throw err
}

function deriveKind(body, status) {
  const details = body?.details
  if (details && typeof details === 'object') {
    if (details.chain) return 'chain_not_anchored'
    if (details.hash) return 'hash_mismatch'
    if (details.status) return 'not_grace_period'
    if (details.tx_hash) return 'missing_tx_hash'
  }
  if (status === 401 || status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  return 'generic'
}

function deriveMessage(body, status) {
  if (body?.error) return String(body.error)
  if (body?.detail) return String(body.detail)
  if (body?.message) return String(body.message)
  if (body && typeof body === 'object') return JSON.stringify(body)
  return `Anchor recording failed (HTTP ${status})`
}
