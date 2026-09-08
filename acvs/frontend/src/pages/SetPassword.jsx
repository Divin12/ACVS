// Forced Set New Password — reached right after OTP verify when the
// logged-in user's account was created via StaffInviteView (which
// sets must_change_password=True on the User). The backend
// independently rejects every other auth-gated endpoint with 403
// {code: "must_change_password"} via accounts/permissions.py:
// MustChangePasswordAllowed, so this page is the only route the user
// can follow to clear the flag and unlock the rest of the API.
//
// Form body is a near-copy of SetNewPassword.jsx (same rules, same
// validators, same eye-toggle). The two differences:
//
//   * submit hits /api/auth/password-change/ (auth-gated, takes only
//     new_password — the user is identified by the JWT) instead of
//     /api/auth/password-reset/confirm/ (link-gated, needs uid+token);
//   * the success path goes to /institution/dashboard (in context)
//     instead of /institution/login (the user is already authed).
//
// We reuse the password rules constant from components/passwordRules.js
// so client-side validation stays in lockstep with the backend's
// AUTH_PASSWORD_VALIDATORS chain.
//
// RequireAuth (in App.jsx) gates this page: we need an access token
// to attach to the change request, and RequireAuth's redirect logic
// already excludes this path from the must-change bounce so the user
// can land here in the first place.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../useAuth.js'
import TricolorStrip from '../components/TricolorStrip.jsx'
import { PASSWORD_RULES } from '../components/passwordRules.js'

export default function SetPassword() {
  const { accessToken, changePassword, logout } = useAuth()
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // No client-side link-validity check (unlike SetNewPassword) — the
  // user is already authed. The only way to be here with no token is
  // a routing bug; RequireAuth prevents that.

  const ruleStates = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, passed: r.test(newPassword) })),
    [newPassword],
  )
  const allRulesPassed = ruleStates.every((r) => r.passed)
  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword
  const canSubmit = accessToken && allRulesPassed && passwordsMatch && !submitting

  function firstUnmetRule() {
    return ruleStates.find((r) => !r.passed) ?? null
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      await changePassword(newPassword)
      setSuccess(true)
      // Brief confirmation, then to the dashboard. The flag is cleared
      // synchronously inside changePassword() (it updates the context)
      // so RequireAuth's first render after navigation passes.
      setTimeout(() => navigate('/institution/dashboard', { replace: true }), 1200)
    } catch (err) {
      setError(parseError(err))
    } finally {
      setSubmitting(false)
    }
  }

  // Same parseError shape as SetNewPassword — the backend's
  // validate_password chain emits the same details envelope here.
  function parseError(err) {
    const details = err.body?.details || {}
    if (details.new_password) {
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
            {/* Why-are-you-here banner — only set on this page; the
                password-reset link flow doesn't need it because the
                user already knows they requested a reset. */}
            <div className="mb-6 flex items-start gap-3 border border-congo-blue/20 bg-congo-blue/10 p-4 text-sm text-seal-black">
              <span
                className="material-symbols-outlined mt-0.5 text-base text-congo-blue"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                info
              </span>
              <p>
                Your institution administrator created this account for you.
                Choose a password below to finish setting up your access. You
                won't be able to use the system until you do.
              </p>
            </div>

            <h2 className="border-b border-slate-100 pb-2 font-sans text-2xl font-semibold text-seal-black">
              Set Your Password
            </h2>

            {success ? (
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
                      Setting Password…
                    </>
                  ) : (
                    <>
                      <span
                        className="material-symbols-outlined text-base"
                        style={{ fontVariationSettings: "'FILL' 0" }}
                      >
                        lock_reset
                      </span>
                      Set Password & Continue
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

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-congo-blue"
              >
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: "'FILL' 0" }}
                >
                  logout
                </span>
                Sign out instead
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function ErrorBanner({ error }) {
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
        Password set
      </h3>
      <p className="text-sm text-slate-500">
        Redirecting you to the dashboard…
      </p>
    </div>
  )
}