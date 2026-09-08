// Wraps GET /api/certificates/. The backend returns a direct array of certificates:
//   [CertificateReadSerializer(...), ...]

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/**
 * @param {object} args
 * @param {string} args.accessToken
 * @param {string} [args.status]     'grace_period' | 'anchored' | 'disabled' | '' to clear.
 * @param {number} [args.cohort]     Cohort number to filter on.
 * @param {number} [args.page]       1-indexed page number (unused when pagination is disabled, kept for signature consistency).
 * @param {number} [args.pageSize]   Items per page (unused when pagination is disabled).
 * @returns {Promise<{count: number, next: null, previous: null, results: Array<object>}>}
 */
export async function listCertificates({ accessToken, status, cohort, page, pageSize }) {
  if (!accessToken) {
    throw new Error('Missing access token — sign in again.')
  }
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (cohort != null && cohort !== '' && !Number.isNaN(Number(cohort))) {
    params.set('cohort', String(cohort))
  }
  if (page && page > 1) params.set('page', String(page))
  if (pageSize) params.set('page_size', String(pageSize))

  const qs = params.toString()
  const url = `${API_BASE}/api/certificates/${qs ? `?${qs}` : ''}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const message =
      body?.detail ||
      body?.message ||
      (body && typeof body === 'object' ? JSON.stringify(body) : `List failed (HTTP ${res.status})`)
    const err = new Error(message)
    err.status = res.status
    err.body = body
    throw err
  }

  // Le backend renvoie directement un tableau (ex: [ { ... }, { ... } ])
  const list = Array.isArray(body) ? body : (body?.results ?? [])

  // On encapsule ce tableau dans l'objet `{ count, results }` 
  // pour que votre composant React existant (CertificateList) l'affiche sans erreur.
  return {
    count: list.length,
    next: null,
    previous: null,
    results: list,
  }
}