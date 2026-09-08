// Public verify endpoint — anonymous, no auth header.
// Maps the Django response into the three UI top-level states from
// DESIGN.md §4B (valid / disabled / not_found). Passes the entire body
// through as `certificate` so the Valid renderer can branch its internal
// copy on `chain_state` (e.g. "not_yet_anchored" for grace-period rows)
// without us collapsing that distinction here.
// See backend/verification/views.py:PublicVerifyView.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export const VERIFY_STATES = Object.freeze({
  VALID: 'valid',
  DISABLED: 'disabled',
  NOT_FOUND: 'not_found',
})

/**
 * @param {string} certificateId
 * @returns {Promise<{state: string, certificate?: object}>}
 */
export async function verifyCertificate(certificateId) {
  const res = await fetch(
    `${API_BASE}/api/verify/${encodeURIComponent(certificateId)}/`,
    { method: 'GET', headers: { Accept: 'application/json' } },
  )

  if (res.status === 404) {
    return { state: VERIFY_STATES.NOT_FOUND }
  }
  if (!res.ok) {
    throw new Error(`Verification failed (HTTP ${res.status})`)
  }

  const body = await res.json()
  // Top-level state stays at three (DESIGN.md §4B): the backend's `result`
  // field already encodes "disabled" vs everything else as "valid", and we
  // don't add a fourth outcome here. The grace-period vs anchored copy
  // distinction lives inside the Valid renderer via chain_state.
  if (body.result === 'disabled') {
    return { state: VERIFY_STATES.DISABLED, certificate: body }
  }
  return { state: VERIFY_STATES.VALID, certificate: body }
}
