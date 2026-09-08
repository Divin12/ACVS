// Fetch a single certificate by its public `certificate_id` string (e.g.
// "ACVS-2026-XXXXXXXX"). The backend has no dedicated GET /certificates/<id>/
// endpoint — only POST /bulk-create/, GET / (paginated list), and PATCH /<id>/
// (edit-only). Rather than asking the user to type a numeric PK in the URL, we
// resolve via the list endpoint: paginate, filter, and match in JS.
//
// Honest about the cost — a registrar's institution will typically own tens to
// low hundreds of certs, so a single page walk is fine in practice; we cap at
// 20 pages (2000 records @ PAGE_SIZE=100) before giving up so a typo'd ID
// doesn't loop forever. The consequence of that cap: a real certificate
// sitting past page 20 surfaces as notFound:true — the same 404 a missing or
// mistyped ID gets. Acceptable at pilot scale; revisit before production.
//
// If/when a dedicated GET /<certificate_id>/ endpoint is added, replace this
// with a direct call. The call site (CertificateDetail) consumes just the
// returned cert object shape, not the search mechanism.

import { listCertificates } from './listCertificates.js'

const MAX_PAGES = 20
// Safety cap to keep a typo'd ID from looping forever. The trade-off: a real
// certificate sitting past page 20 is indistinguishable from a missing one —
// both surface as notFound: true to the caller (CertificateDetail renders the
// same 404 in either case). This is acceptable at pilot scale (a registrar's
// institution owns well under 2000 certs) but would need revisiting before
// any production rollout where the cap could realistically be hit.
// Smaller page than the list screen (which uses 25) so a single page covers
// more candidates without ballooning the request — 100 matches the DRF default
// and stays well under any reasonable registrar scale.
const PAGE_SIZE = 100

/**
 * @param {object} args
 * @param {string} args.accessToken
 * @param {string} args.certificateId  The public ID, e.g. "ACVS-2026-XXXXXXXX".
 * @returns {Promise<{cert: object|null, notFound: boolean}>}
 *   - {cert, notFound:false} on success
 *   - {cert:null, notFound:true} when no row matches within MAX_PAGES pages
 *   - throws on transport / 4xx / 5xx other than the not-found case
 */
export async function getCertificate({ accessToken, certificateId }) {
  if (!accessToken) {
    throw new Error('Missing access token — sign in again.')
  }
  if (!certificateId) {
    return { cert: null, notFound: true }
  }

  const target = String(certificateId).trim()
  let page = 1
  while (page <= MAX_PAGES) {
    const res = await listCertificates({ accessToken, page, pageSize: PAGE_SIZE })
    const hit = res.results.find((row) => row.certificate_id === target)
    if (hit) {
      return { cert: hit, notFound: false }
    }
    // No next page → the list truly doesn't contain this row.
    if (!res.next) {
      return { cert: null, notFound: true }
    }
    page += 1
  }
  // Pagination cap exhausted without finding the row. Treat as not-found; the
  // caller renders a sensible 404 message rather than hanging.
  return { cert: null, notFound: true }
}
