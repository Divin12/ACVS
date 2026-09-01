// Wraps POST /api/certificates/bulk-create/.
// The backend requires JWT auth (Authorization: Bearer <access>) and runs the
// create inside a single atomic transaction — either every item in the cohort
// is registered or none of them are. See backend/certificates/views.py.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/**
 * @param {object} args
 * @param {string} args.accessToken      JWT access token from AuthContext.
 * @param {Array<{certificate_id: string, student_name: string, cohort_number: number, degree: string, program: string, issued_date: string}>} args.items
 *        At least one row; every row must share the same cohort_number and carry a unique certificate_id (official serial number).
 *        `student_name` is a free-text string — the backend resolves it to
 *        a Student via `get_or_create` scoped to the registrar's institution
 *        (see backend/certificates/views.py:BulkCreateView).
 * @returns {Promise<Array<object>>}     Array of created certificate records
 *        (each with nested `student: {id, full_name}`).
 */
export async function bulkCreate({ accessToken, items }) {
  if (!accessToken) {
    throw new Error('Missing access token — sign in again.')
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one cohort row is required.')
  }

  // Frontend guard: check if any item is missing certificate_id
  const missingId = items.some((item) => !item.certificate_id || !item.certificate_id.trim())
  if (missingId) {
    throw new Error('All items must have an official certificate serial number (certificate_id).')
  }

  const res = await fetch(`${API_BASE}/api/certificates/bulk-create/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ items }),
  })

  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    // Surface the backend's validation envelope (DRF returns {field: [msg]} or
    // {detail: msg}). The BulkRegister screen renders these inline.
    const message =
      body?.detail ||
      body?.message ||
      (body && typeof body === 'object'
        ? JSON.stringify(body)
        : `Bulk registration failed (HTTP ${res.status})`)
    const err = new Error(message)
    err.status = res.status
    err.body = body
    throw err
  }

  // Backend returns the serialized certificates either as a bare array (DRF
  // default for a list serializer) or wrapped; accept both shapes.
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.results)) return body.results
  if (Array.isArray(body?.certificates)) return body.certificates
  return []
}