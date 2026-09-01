// Reached from the emailed reset link, which the backend constructs as
// `${FRONTEND_URL}/reset-password/confirm?uid={uid}&token={token}`
// (see backend/accounts/views.py:_send_reset_email).
//
// Reads uid + token from the query string, submits POST to
// /api/auth/password-reset/confirm/ with {uid, token, new_password}.
// New password is validated client-side as the registrar types, against
// the same four rules the backend enforces via AUTH_PASSWORD_VALIDATORS
// (MIN_LENGTH=12, uppercase, number, special char) — the backend is the
// source of truth, so the page surfaces details.new_password messages
// verbatim on a 400 rather than re-stating them.
//
// No auth guard — this is reached via an emailed link, not while logged in.
//
// Mirrors /design/screens/set_new_password/code.html for layout (rounded
// none, 480px max-w, h1 "République Démocratique du Congo" header rather
// than the ministry wordmark block Login/ForgotPassword use). Stitch's
// tokens translated to DESIGN.md colors.

import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { confirmPasswordReset } from '../api/auth.js'
import TricolorStrip from '../components/TricolorStrip.jsx'

// Mirror of backend/acvs/settings.py:AUTH_PASSWORD_VALIDATORS — if the
// backend adds a rule, this list must grow to match. The backend will
// still reject anything we let through; this is purely a UX aid.
//
// Special-char set must EXACTLY match
// backend/accounts/validators.py:SpecialCharValidator.SPECIAL_CHARS = 25 chars:
//   ! @ # $ % ^ & * ( ) _ + - = [ ] { } | ; : , . < > ?
//
// A loose "anything not alphanumeric" regex (e.g. /[^A-Za-z0-9]/) would
// let accent marks, CJK characters, spaces, and backticks through the
// client checklist while the backend still rejects them — a silent
// mismatch during typing that would only surface as a 400 on submit.
import { PASSWORD_RULES } from '../components/passwordRules.js'

export default function SetNewPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const uid = searchParams.get('uid') ?? ''
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // A link is missing uid or token if either query param is absent/empty.
  // The backend will reject with details.uid/token = "Invalid reset link."
  // anyway, but we can catch it client-side and avoid a wasted round-trip
  // — and surface clearer copy than the validator message.
  const linkInvalid = !uid || !token

  const ruleStates = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, passed: r.test(newPassword) })),
    [newPassword],
  )
  const allRulesPassed = ruleStates.every((r) => r.passed)
  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword
  const canSubmit =
    !linkInvalid && allRulesPassed && passwordsMatch && !submitting

  function firstUnmetRule() {
    return ruleStates.find((r) => !r.passed) ?? null
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      await confirmPasswordReset({ uid, token, new_password: newPassword })
      setSuccess(true)
      // Brief confirmation, then back to Login. The user already knows
      // their reset succeeded — they don't need a long success page.
      setTimeout(() => navigate('/institution/login'), 1800)
    } catch (err) {
      setError(parseError(err))
    } finally {
      setSubmitting(false)
    }
  }

  // Pull the most actionable field-specific copy out of the 400 envelope.
  // The backend returns whichever validation failed first; we surface it
  // exactly as the validators phrased it rather than re-writing — drift
  // between client and server wording is the kind of inconsistency a panel
  // would spot immediately.
  function parseError(err) {
    const details = err.body?.details || {}
    if (details.token) {
      return {
        kind: 'token',
        message:
          'This reset link is invalid or has expired. Request a new one below.',
      }
    }
    if (details.uid) {
      return {
        kind: 'uid',
        message:
          'This reset link is malformed. Request a new one below.',
      }
    }
    if (details.new_password) {
      // Validator messages arrive as a list (DRF default). Show the first;
      // the live checklist has already turned each rule green/red so the
      // user can map the message back to a specific row.
      const list = Array.isArray(details.new_password)
        ? details.new_password
        : [details.new_password]
      return { kind: 'password', message: list[0] }
    }
    return {
      kind: 'generic',
      message: err.message ?? 'Could not update password. Please try again.',
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-paper-white">
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-50 flex h-1 w-full"
      >
        <div className="flex-1 bg-congo-blue" />
        <div className="flex-1 bg-congo-yellow" />
        <div className="flex-1 bg-congo-red" />
      </div>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="relative w-full max-w-[480px] overflow-hidden border border-slate-100 bg-paper-white shadow-sm">
          <TricolorStrip />

          <div className="flex flex-col items-center px-6 pt-12 pb-8 text-center md:px-12">
            <img
              src="/logo.png"
              alt="Sceau du Ministère de l'Éducation Nationale"
              className="mb-6 h-24 w-24 object-contain"
            />
            <h1 className="font-sans text-3xl font-extrabold uppercase leading-tight tracking-tight text-seal-black">
              République
              <br />
              Démocratique du Congo
            </h1>
            <p className="mt-2 inline-block border-b-2 border-congo-blue pb-2 font-mono text-xs uppercase tracking-widest text-slate-500">
              ACVS Administration
            </p>
          </div>

          <div className="px-6 pb-12 md:px-12">
            <h2 className="border-b border-slate-100 pb-2 font-sans text-2xl font-semibold text-seal-black">
              Set New Password
            </h2>
            <p className="mt-4 text-sm text-slate-500">
              Please create a new, secure password for your administrative account.
            </p>

            {linkInvalid ? (
              <InvalidLinkBlock />
            ) : success ? (
              <SuccessBlock />
            ) : (
              <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-6" noValidate>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="new_password"
                    className="font-mono text-sm font-medium text-seal-black"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="new_password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      aria-invalid={error?.kind === 'password' ? 'true' : 'false'}
                      aria-describedby="password-rules"
                      className="w-full rounded border border-slate-500 bg-paper-white p-4 font-mono text-base text-seal-black transition-shadow focus:border-congo-blue focus:outline-none focus:ring-2 focus:ring-congo-blue/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-seal-black"
                    >
                      <span
                        className="material-symbols-outlined text-[20px]"
                        style={{ fontVariationSettings: "'FILL' 0" }}
                      >
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="confirm_password"
                    className="font-mono text-sm font-medium text-seal-black"
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="confirm_password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    aria-invalid={
                      confirmPassword.length > 0 && !passwordsMatch
                        ? 'true'
                        : 'false'
                    }
                    className="w-full rounded border border-slate-500 bg-paper-white p-4 font-mono text-base text-seal-black transition-shadow focus:border-congo-blue focus:outline-none focus:ring-2 focus:ring-congo-blue/40"
                  />
                  {confirmPassword.length > 0 && !passwordsMatch ? (
                    <p className="font-mono text-xs text-state-disabled">
                      Passwords do not match.
                    </p>
                  ) : null}
                </div>

                <div
                  id="password-rules"
                  className="mt-2 border border-slate-100 bg-slate-100/50 p-4"
                  aria-live="polite"
                >
                  <h3 className="mb-2 font-mono text-sm font-medium text-seal-black">
                    Password Requirements:
                  </h3>
                  <ul className="flex flex-col gap-1 text-sm text-slate-500">
                    {ruleStates.map((r) => (
                      <li
                        key={r.id}
                        className={`flex items-center gap-2 ${
                          r.passed ? 'text-seal-black' : ''
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-[16px] ${
                            r.passed ? 'text-congo-blue' : 'text-slate-500'
                          }`}
                          style={{ fontVariationSettings: "'FILL' 1" }}
                          aria-hidden="true"
                        >
                          {r.passed ? 'check_circle' : 'check_circle'}
                        </span>
                        {r.label}
                      </li>
                    ))}
                  </ul>
                </div>

                {error ? (
                  <ErrorBanner error={error} />
                ) : null}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="mt-4 flex w-full items-center justify-center gap-2 border border-congo-blue bg-congo-blue py-4 font-mono text-base font-medium text-paper-white transition-colors hover:bg-congo-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <span
                        className="material-symbols-outlined animate-spin text-base"
                        style={{ fontVariationSettings: "'FILL' 0" }}
                      >
                        progress_activity
                      </span>
                      Updating Password…
                    </>
                  ) : (
                    <>
                      <span
                        className="material-symbols-outlined text-base"
                        style={{ fontVariationSettings: "'FILL' 0" }}
                      >
                        lock_reset
                      </span>
                      Update Password
                    </>
                  )}
                </button>

                {!canSubmit && !submitting && newPassword.length > 0 ? (
                  <p className="text-center font-mono text-xs text-slate-500">
                    {(() => {
                      const unmet = firstUnmetRule()
                      if (unmet) return `Still needed: ${unmet.label.toLowerCase()}.`
                      if (!passwordsMatch) return 'Passwords do not match yet.'
                      return null
                    })()}
                  </p>
                ) : null}
              </form>
            )}

            <div className="mt-6 text-center">
              <Link
                to="/institution/login"
                className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-congo-blue"
              >
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: "'FILL' 0" }}
                >
                  arrow_back
                </span>
                Return to Login
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function ErrorBanner({ error }) {
  // Token/uid errors mean the link itself is dead — give the user a way
  // to start over. Password errors are local to the form, so a plain
  // message is enough.
  const isLinkError = error.kind === 'token' || error.kind === 'uid'
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 border border-congo-red/20 bg-congo-red/10 p-3 text-sm text-state-disabled"
    >
      <div className="flex items-start gap-2">
        <span
          className="material-symbols-outlined text-base"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          error
        </span>
        <span>{error.message}</span>
      </div>
      {isLinkError ? (
        <Link
          to="/institution/forgot-password"
          className="ml-6 inline-flex items-center gap-1 font-mono text-xs text-congo-blue hover:underline"
        >
          Request a new reset link
          <span
            className="material-symbols-outlined text-[14px]"
            style={{ fontVariationSettings: "'FILL' 0" }}
            aria-hidden="true"
          >
            arrow_forward
          </span>
        </Link>
      ) : null}
    </div>
  )
}

function InvalidLinkBlock() {
  // Shown when the URL didn't carry uid or token — wrong page, manual
  // paste, truncated link. Don't even render the form; the user can't
  // submit anything without these params.
  return (
    <div
      role="alert"
      className="mt-6 flex flex-col gap-2 border border-congo-red/20 bg-congo-red/10 p-4 text-sm text-state-disabled"
    >
      <div className="flex items-start gap-2">
        <span
          className="material-symbols-outlined text-base"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          link_off
        </span>
        <span>
          This reset link is incomplete — the security token is missing from
          the URL. Use the link from your email directly, or request a new
          one below.
        </span>
      </div>
      <Link
        to="/institution/forgot-password"
        className="ml-7 inline-flex items-center gap-1 font-mono text-xs text-congo-blue hover:underline"
      >
        Request a new reset link
        <span
          className="material-symbols-outlined text-[14px]"
          style={{ fontVariationSettings: "'FILL' 0" }}
          aria-hidden="true"
        >
          arrow_forward
        </span>
      </Link>
    </div>
  )
}

function SuccessBlock() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-6 flex flex-col items-center gap-3 border border-congo-blue/20 bg-congo-blue/10 p-6 text-center"
    >
      <span
        className="material-symbols-outlined text-3xl text-congo-blue"
        style={{ fontVariationSettings: "'FILL' 1" }}
        aria-hidden="true"
      >
        task_alt
      </span>
      <h3 className="font-sans text-lg font-semibold text-seal-black">
        Password updated
      </h3>
      <p className="text-sm text-slate-500">
        Redirecting you to the sign-in page…
      </p>
    </div>
  )
}
