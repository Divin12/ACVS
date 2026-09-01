// Step 0 of institution auth: "I forgot my password".
//
// Mirrors /design/screens/forgot_password/code.html: centered card on a
// paper-white page, top tricolor bar (4px), seal block, ACVS Administration
// lockup, single email input with seal-black 2px border, primary "Send
// Reset Link" button, and a "Back to Sign In" affordance below.
//
// The backend (PasswordResetRequestView) returns 200 for BOTH
// "user exists, link sent" and "user does not exist" so we cannot
// enumerate. After a successful POST we render the same generic
// confirmation regardless of whether the email was registered — the
// copy is intentionally ambiguous ("If that address is registered, a
// reset link has been sent") so we can't accidentally reveal existence
// by toggling the message.
//
// The confirm side (the link-in-email + new-password screen) is
// implemented elsewhere — only the request-side screen is wired here.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { requestPasswordReset } from '../api/auth.js'
import TricolorStrip from '../components/TricolorStrip.jsx'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  // submitted=true flips the view away from the form to the confirmation
  // message. There's no going back to the form from the confirmation —
  // the user can navigate to login via the "Back to Sign In" link.
  const [submitted, setSubmitted] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await requestPasswordReset(email.trim())
      setSubmitted(true)
    } catch (err) {
      // The backend's 400 envelope for this endpoint is ValidationError
      // ({email: "Enter a valid email address."}). Surface the field
      // message if the server sent one, otherwise fall back to the
      // generic error from asJson.
      const details = err.body?.details || err.body || {}
      const fieldMsg =
        details.email || (typeof details === 'string' ? details : null)
      setError(fieldMsg ?? err.message ?? 'Could not send reset link. Please try again.')
    } finally {
      setSubmitting(false)
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
        <div
          className="relative w-full max-w-md overflow-hidden rounded-xl border border-slate-100 bg-paper-white shadow-sm"
          data-testid="forgot-password-card"
        >
          <TricolorStrip />

          <div className="flex flex-col items-center px-8 pt-12 pb-8 text-center">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-slate-100 bg-paper-white">
              <img
                src="/logo.png"
                alt="Sceau du Ministère de l'Éducation Nationale"
                className="h-20 w-20 object-contain"
              />
            </div>

            <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
              République Démocratique du Congo
            </p>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
              Ministère de l'Éducation Nationale
            </p>

            <hr className="my-6 w-12 border-slate-100" />

            <h1 className="font-sans text-2xl font-extrabold tracking-tight text-congo-blue">
              ACVS Administration
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Authorized registrar access only.
            </p>
          </div>

          <div className="space-y-4 px-8 pb-8">
            {submitted ? (
              <ConfirmationBlock email={email} />
            ) : (
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <div>
                  <h2 className="font-sans text-xl font-semibold text-seal-black">
                    Reset Access
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Enter your institutional email to receive a recovery link.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block font-mono text-sm font-bold text-seal-black"
                  >
                    Registered Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="registrar@institution.cd"
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={error ? 'forgot-password-error' : undefined}
                    className="w-full rounded border-2 border-seal-black bg-paper-white p-3 font-mono text-base text-seal-black transition-shadow focus:border-congo-blue focus:outline-none focus:ring-2 focus:ring-congo-blue/40"
                  />
                </div>

                {error ? (
                  <div
                    id="forgot-password-error"
                    role="alert"
                    className="flex items-start gap-2 rounded border border-congo-red/20 bg-congo-red/10 p-3 text-sm text-state-disabled"
                  >
                    <span className="material-symbols-outlined fill text-base">
                      error
                    </span>
                    <span>{error}</span>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded bg-congo-blue py-4 font-sans text-base font-bold text-paper-white shadow-sm transition-colors hover:bg-congo-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <span
                        className="material-symbols-outlined animate-spin text-base"
                        style={{ fontVariationSettings: "'FILL' 0" }}
                      >
                        progress_activity
                      </span>
                      Sending Reset Link…
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>
            )}

            <div className="pt-2 text-center">
              {submitted ? (
                <button
                  type="button"
                  onClick={() => navigate('/institution/login')}
                  className="inline-flex items-center gap-1 font-mono text-xs text-congo-blue underline transition-colors hover:text-congo-blue/80"
                >
                  <span
                    className="material-symbols-outlined text-base"
                    style={{ fontVariationSettings: "'FILL' 0" }}
                  >
                    arrow_back
                  </span>
                  Back to Sign In
                </button>
              ) : (
                <Link
                  to="/institution/login"
                  className="inline-flex items-center gap-1 font-mono text-xs text-congo-blue underline transition-colors hover:text-congo-blue/80"
                >
                  <span
                    className="material-symbols-outlined text-base"
                    style={{ fontVariationSettings: "'FILL' 0" }}
                  >
                    arrow_back
                  </span>
                  Back to Sign In
                </Link>
              )}
            </div>

            <p className="pt-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
              for further assistance, please contact the IT administration desk.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-100 px-6 py-4 text-center font-mono text-xs text-slate-500">
        © {new Date().getFullYear()} République Démocratique du Congo - Ministère
        de l'Éducation Nationale et Nouvelle Citoyenneté
        <div className="mt-2">
          <Link to="/verify" className="text-congo-blue hover:underline">
            Public verification
          </Link>
        </div>
      </footer>
    </div>
  )
}

function ConfirmationBlock({ email }) {
  // Intentionally vague: never reveal whether the email exists. The
  // user may have mistyped and gotten the "success" copy — that's the
  // point of the no-enumeration design.
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-4"
      data-testid="forgot-password-confirmation"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-congo-yellow/20">
        <span
          className="material-symbols-outlined text-2xl text-congo-yellow"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          mark_email_read
        </span>
      </div>

      <div>
        <h2 className="font-sans text-xl font-semibold text-seal-black">
          Check your email
        </h2>
        <p className="mt-2 font-mono text-sm text-slate-500">
          If that address is registered, a reset link has been sent to{' '}
          <span className="font-semibold text-seal-black">{email}</span>.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          The link expires after a short window. If you don't see the
          message, check your spam folder or try again with the correct
          address.
        </p>
      </div>
    </div>
  )
}
