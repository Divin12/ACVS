// Records a disable action against the backend.
//
// POST /api/certificates/<certificate_id>/disable/  with  { reason }
// → 200 returns the full CertificateReadSerializer rendering (now with
//   status=disabled, reason preserved server-side for audit).
//
// As of this commit, the backend endpoint does NOT yet exist —
// backend/certificates/views.py ships only BulkCreateView,
// CertificateListView, CertificateDetailView (PATCH only), and
// AnchorCertificateView. The endpoint shape above is the proposed
// contract. This wrapper surfaces a specific `backend_not_implemented`
// error kind when the route 404s, so the modal can render honest copy
// ("this UI is wired and ready, the backend ships in the next round")
// rather than a generic failure that hides the gap.
//
// Permission shape mirrors the anchor endpoint: registrars may disable
// only certificates within their own institution (handled by
// ScopeToInstitution on the view). Admin role's policy is left to the
// backend spec.
//
// Errors are typed so the DisableCertificateModal can branch on
// `err.kind` and surface specific copy for each rejection.
//
// Kinds:
//   - backend_not_implemented  Route returns 404. Frontend wired, backend not.
//   - bad_request              ValidationError on the request body
//                              (e.g. missing reason). Details in err.details.
//   - forbidden                401/403 — not authorized for this cert.
//   - not_found                404 with a body that DOES NOT look like the
//                              Django "page not found" HTML — i.e. the URL
//                              matches but the certificate_id doesn't exist.
//                              (Differentiating the two is heuristic; the
//                              backend should land a proper envelope soon.)
//   - network                  fetch() itself rejected (offline / DNS).
//   - generic                  Any other non-2xx.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/**
 * @param {object} args
 * @param {string} args.accessToken   JWT access token from AuthContext.
 * @param {string} args.certificateId The public certificate_id, e.g. "ACVS-2026-XXXXXXXX".
 * @param {string} args.reason       Free-text justification for the audit log.
 * @returns {Promise<object>}         The serialized cert on success (status=disabled).
 */
export async function disableCertificate({ accessToken, certificateId, reason }) {
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
  if (!reason || !reason.trim()) {
    const err = new Error('A reason is required to disable a certificate.')
    err.kind = 'bad_request'
    throw err
  }

  let res
  try {
    res = await fetch(`${API_BASE}/api/certificates/${certificateId}/disable/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ reason: reason.trim() }),
    })
  } catch (networkErr) {
    // fetch() only throws on transport-level failures (offline, DNS, CORS preflight
    // rejected, etc.) — never on HTTP status codes.
    const err = new Error(networkErr.message || 'Network error reaching the backend.')
    err.kind = 'network'
    throw err
  }

  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Non-JSON. Most likely Django's HTML 404 page — which is exactly the
    // signal we want for `backend_not_implemented` (see below).
    /* leave body as null */
  }

  if (res.ok) {
    return body
  }

  const err = new Error(deriveMessage(body, res.status, certificateId))
  err.status = res.status
  err.body = body
  err.details = body?.details ?? null
  err.kind = deriveKind(body, res.status, text)
  throw err
}

// Differentiating the two flavors of 404 is a temporary heuristic that
// closes as soon as the backend lands the real endpoint:
//
//   * "Backend not yet implemented" — Django's HTML 404 page (text starts
//     with `<` or `Page not found`, body is not JSON). The URL doesn't
//     resolve to a view at all.
//
//   * "Certificate not found" — the URL resolves to a view that returned
//     a JSON 404 (e.g. the existing CertificateDetailView shape). The
//     cert_id we passed is unknown.
//
// Both are 404 to the HTTP layer; the on-the-wire content tells them
// apart today.
function deriveKind(body, status, rawText) {
  if (status === 404) {
    const looksLikeJson = body && typeof body === 'object'
    const looksLikeHtml = typeof rawText === 'string' && rawText.trimStart().startsWith('<')
    if (!looksLikeJson || looksLikeHtml) return 'backend_not_implemented'
    return 'not_found'
  }
  const details = body?.details
  if (details && typeof details === 'object') {
    if (details.reason) return 'bad_request'
    if (details.status) return 'bad_request'
  }
  if (status === 400) return 'bad_request'
  if (status === 401 || status === 403) return 'forbidden'
  return 'generic'
}

function deriveMessage(body, status, certificateId) {
  if (body?.error) return String(body.error)
  if (body?.detail) return String(body.detail)
  if (body?.message) return String(body.message)
  if (body && typeof body === 'object') return JSON.stringify(body)
  if (status === 404) {
    return (
      `The backend's disable endpoint (POST /api/certificates/${certificateId}/disable/) ` +
      `is not implemented yet. The UI is wired and ready; the endpoint ships in a ` +
      `follow-up commit.`
    )
  }
  return `Disable failed (HTTP ${status})`
}
