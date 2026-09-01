// Disable/Revoke confirmation modal.
//
// Two-step gate, matching /design/screens/disable_revoke_confirmation/code.html:
//   1. The registrar opens the modal from the anchored detail view.
//   2. The red "Disable Certificate" button stays DISABLED until the
//      reason textarea has non-empty content — preventing an accidental
//      revocation with no audit trail.
//   3. On confirm, POSTs { reason } to the backend's disable endpoint
//      (api/disableCertificate.js). On success, calls onSuccess(cert)
//      so the parent can refresh and re-render in the disabled state.
//
// Backend-not-implemented handling:
//
//   The endpoint is wired on the frontend but does not exist on the
//   backend yet (verified against backend/certificates/views.py: only
//   BulkCreateView, CertificateListView, CertificateDetailView, and
//   AnchorCertificateView exist as of this commit). When the route
//   returns 404 with a non-JSON body (Django's default HTML 404), the
//   modal renders an explicit "the backend isn't shipped yet" panel —
//   the user gets the honest status rather than a generic network
//   failure that hides the gap.
//
//   This is the same shape as the anchor endpoint's "chain has not yet
//   recorded an anchor" copy: a specific, expected failure mode with
//   specific copy, surfaced rather than swallowed.
//
// DESIGN.md §5 — "Disable this certificate" is destructive by design
// and permanent. The two-step gate (open modal → enter reason → confirm)
// exists to make the destructive action explicit, not to validate the
// reason's content (server-side audit will reject empty/blank reasons).

import { useEffect, useRef, useState } from 'react'
import { disableCertificate } from '../api/disableCertificate.js'
import { useAuth } from '../useAuth.js'

export default function DisableCertificateModal({ certificateId, onClose, onSuccess }) {
  const { accessToken } = useAuth()
  const [reason, setReason] = useState('')
  const [submitState, setSubmitState] = useState({ kind: 'idle' })
  // 'idle' | 'submitting' | {kind:'error', err}
  const textareaRef = useRef(null)

  // Esc closes the modal — standard dialog behavior. Disabled during
  // the in-flight submit so a fast Esc-press doesn't strand the request.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && submitState.kind !== 'submitting') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitState.kind])

  // Autofocus the reason field on open — first thing the registrar
  // needs to interact with, and skipping it costs an extra click.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Trim before validating the gate. The backend (once shipped) trims
  // too, so a string of spaces would 400 anyway.
  const trimmed = reason.trim()
  const canSubmit = trimmed.length > 0 && submitState.kind !== 'submitting'

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitState({ kind: 'submitting' })
    try {
      const cert = await disableCertificate({ accessToken, certificateId, reason: trimmed })
      setSubmitState({ kind: 'idle' })
      onSuccess?.(cert)
    } catch (err) {
      setSubmitState({ kind: 'error', err })
    }
  }

  // Backdrop click closes the modal — but only when the line behind it
  // is the backdrop itself, not any child. `e.target === e.currentTarget`
  // distinguishes the two. Disabled mid-submit for the same reason Esc
  // is — a backdrop click during in-flight would leave the user without
  // the request's outcome.
  function onBackdropClick(e) {
    if (e.target !== e.currentTarget) return
    if (submitState.kind === 'submitting') return
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disable-modal-title"
      data-testid="disable-modal"
      data-submit-state={submitState.kind}
      className="fixed inset-0 z-50 flex items-center justify-center bg-seal-black/60 p-6 backdrop-blur-sm"
      onClick={onBackdropClick}
    >
      <form
        onSubmit={onSubmit}
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-md border-2 border-seal-black bg-paper-white text-left shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]"
      >
        {/* Header — design has a black-on-white ministry-coat-of-arms disc
            here. The placeholder Google-hosted image Stitch uses isn't ours
            (CLAUDE.md: the real logo file lives in /design/), and a
            certificate-seal-only product doesn't carry an inline SVG of the
            coat of arms today. Using the `block` Material Symbol (filled)
            on a black disc preserves the same visual weight without
            shipping an unverified asset. */}
        <header className="flex items-center gap-4 border-b-2 border-seal-black bg-slate-100 p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-seal-black p-2 text-paper-white">
            <span className="material-symbols-outlined fill" style={{ fontSize: 24 }}>
              block
            </span>
          </div>
          <div>
            <h2 id="disable-modal-title" className="font-sans text-2xl font-bold leading-tight text-seal-black">
              Permanent Revocation
            </h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-wider text-slate-500">
              Official Administrative Action
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitState.kind === 'submitting'}
            aria-label="Close modal"
            className="ml-auto p-2 text-seal-black transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </header>

        {/* Body */}
        <div className="flex flex-col gap-6 overflow-y-auto p-6">
          {/* Warning banner — design uses Material's `error-container`
              (pink-100) with a red left border. Our design system has
              --color-state-disabled as the only red, and uses /5 and /30
              alpha variants for tints (see anchored chain panel). */}
          <div className="flex items-start gap-4 rounded border-l-4 border-state-disabled bg-state-disabled/5 p-4">
            <span aria-hidden="true" className="material-symbols-outlined mt-1 text-state-disabled">
              warning
            </span>
            <div>
              <p className="font-sans text-base font-bold text-state-disabled">
                This action is permanent and will be visible on the public record.
              </p>
              <p className="mt-1 font-sans text-sm text-slate-500">
                Once revoked, this certificate can no longer be validated by third parties.
              </p>
            </div>
          </div>

          {/* Target certificate ID — the same immutable public ID shown
              on the detail page header. `select-all` lets the registrar
              copy it for cross-referencing the audit log later. */}
          <div>
            <label className="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-slate-500">
              Target Certificate ID
            </label>
            <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-100 p-4">
              <code className="select-all font-mono text-sm text-seal-black">{certificateId}</code>
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[18px] text-slate-500"
                title="Immutable Record ID"
              >
                lock
              </span>
            </div>
          </div>

          {/* Reason — required, enforced client-side as the gate. The
              backend will also reject blank reasons server-side; the
              client check is purely UX (so the button visibly disables
              rather than 400-ing after a click). */}
          <div>
            <label
              htmlFor="revocationReason"
              className="mb-2 block font-mono text-xs font-bold uppercase tracking-wide text-slate-500"
            >
              Reason for Revocation <span className="text-state-disabled">*</span>
            </label>
            <textarea
              id="revocationReason"
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitState.kind === 'submitting'}
              placeholder="Provide official justification for revocation..."
              rows={3}
              className="w-full resize-none rounded border-2 border-slate-200 bg-paper-white p-4 font-sans text-base text-seal-black placeholder:text-slate-500 focus:border-seal-black focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-70"
            />
          </div>

          {/* Inline error panel — only rendered when there's a problem.
              Most errors come from the backend; `backend_not_implemented`
              is the expected failure mode today and gets specific copy
              rather than the generic "request failed" treatment. */}
          {submitState.kind === 'error' ? (
            <ErrorPanel err={submitState.err} />
          ) : null}
        </div>

        {/* Footer — error compact strip lives here, ABOVE the action row.
            Always visible regardless of body scroll position, so the user
            never misses the error message after submitting. The full
            inline panel above gives the prose explanation; this strip is
            the always-visible headline for users who don't scroll back up. */}
        {submitState.kind === 'error' ? (
          <ErrorStrip err={submitState.err} />
        ) : null}

        {/* Footer actions */}
        <footer className="flex justify-end gap-4 border-t-2 border-seal-black bg-slate-100 p-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitState.kind === 'submitting'}
            className="rounded border-2 border-seal-black px-6 py-2 font-sans text-base font-bold text-seal-black transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          {/* Two-step gate: the button visually reads as disabled until
              the reason has content. We don't use the native `disabled`
              attribute because the design's reduced-opacity state (50%
              opacity, cursor-not-allowed) communicates "you haven't
              finished yet" more clearly than the browser default
              gray-out. The `disabled` HTML attribute is set so keyboard
              / AT users also get the right semantics. */}
          <button
            type="submit"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            className={[
              'inline-flex items-center gap-2 rounded border-2 px-6 py-2 font-sans text-base font-bold transition-colors',
              canSubmit
                ? 'border-state-disabled text-state-disabled hover:bg-state-disabled hover:text-paper-white'
                : 'cursor-not-allowed border-state-disabled/50 text-state-disabled/50 opacity-50',
            ].join(' ')}
          >
            {submitState.kind === 'submitting' ? (
              <>
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined animate-spin"
                  style={{ fontSize: 16 }}
                >
                  progress_activity
                </span>
                Disabling…
              </>
            ) : (
              <>
                <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  gavel
                </span>
                Disable Certificate
              </>
            )}
          </button>
        </footer>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inline error panel — same shape as the anchor flow's error block.   */
/* Branches on err.kind so the user sees what's actually wrong, rather */
/* than the same generic "request failed" for every backend condition. */
/* ------------------------------------------------------------------ */

function ErrorPanel({ err }) {
  const { kind, status, message } = err
  // backend_not_implemented is the explicit, expected failure today.
  // Render it as an informational callout (amber, not red) — the action
  // isn't broken, the backend just hasn't shipped the endpoint yet.
  if (kind === 'backend_not_implemented') {
    return (
      <div className="flex items-start gap-3 rounded border-l-4 border-state-grace bg-state-grace/5 p-4">
        <span aria-hidden="true" className="material-symbols-outlined mt-1 text-state-grace">
          construction
        </span>
        <div>
          <p className="font-sans text-base font-bold text-state-grace">
            Disable endpoint not yet implemented on the backend.
          </p>
          <p className="mt-1 font-sans text-sm text-seal-black">
            This UI is wired and ready — POST /api/certificates/{'{'}id{'}'}/disable/ ships in
            the next backend commit. Once it lands, the same form will work end-to-end without
            any frontend changes.
          </p>
          {status ? (
            <p className="mt-2 font-mono text-xs text-slate-500">HTTP {status}</p>
          ) : null}
        </div>
      </div>
    )
  }

  // Everything else is a real failure — red treatment.
  const headline = HEADLINE_BY_KIND[kind] ?? 'Could not disable this certificate.'
  return (
    <div className="flex items-start gap-3 rounded border-l-4 border-state-disabled bg-state-disabled/5 p-4">
      <span aria-hidden="true" className="material-symbols-outlined mt-1 text-state-disabled">
        error
      </span>
      <div>
        <p className="font-sans text-base font-bold text-state-disabled">{headline}</p>
        <p className="mt-1 font-sans text-sm text-seal-black">
          {message ?? 'No further detail was returned.'}
        </p>
        {status ? (
          <p className="mt-2 font-mono text-xs text-slate-500">HTTP {status}</p>
        ) : null}
      </div>
    </div>
  )
}

const HEADLINE_BY_KIND = {
  bad_request: 'The disable request was rejected.',
  forbidden: 'You do not have permission to disable this certificate.',
  not_found: 'This certificate no longer exists.',
  network: 'Could not reach the backend.',
  auth_missing: 'Your session expired — sign in again.',
  generic: 'Could not disable this certificate.',
}

/* ------------------------------------------------------------------ */
/* Footer error strip — one-line headline that lives ABOVE the action   */
/* row in the modal footer. Always visible regardless of body scroll,   */
/* so a user who submitted then looked back at the buttons (the        */
/* natural "did it work?" glance) sees the error state right next to   */
/* the retry affordance.                                               */
/* ------------------------------------------------------------------ */

function ErrorStrip({ err }) {
  const { kind } = err
  const isInformational = kind === 'backend_not_implemented'
  const icon = isInformational ? 'construction' : 'error'
  const toneClass = isInformational
    ? 'border-state-grace bg-state-grace/10 text-state-grace'
    : 'border-state-disabled bg-state-disabled/10 text-state-disabled'
  const headline = isInformational
    ? 'Backend endpoint not implemented yet — UI is wired and ready.'
    : HEADLINE_BY_KIND[kind] ?? 'Could not disable this certificate.'

  return (
    <div
      role={isInformational ? 'status' : 'alert'}
      className={`flex items-center gap-3 border-t-2 px-6 py-3 ${toneClass}`}
    >
      <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 20 }}>
        {icon}
      </span>
      <p className="font-sans text-sm font-bold">{headline}</p>
    </div>
  )
}
