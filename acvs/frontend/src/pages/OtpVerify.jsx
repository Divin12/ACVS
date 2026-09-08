// Step 2 of institution auth. Six single-digit inputs (paste-friendly: a
// paste anywhere fills every slot and submits) → /api/auth/otp/verify/ →
// JWT pair in localStorage → /admin/overview OR /institution/dashboard.

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TricolorStrip from '../components/TricolorStrip.jsx'
import { useAuth } from '../useAuth.js'

const CODE_LENGTH = 6

export default function OtpVerify() {
  const { pendingToken, accessToken, verifyOtp, resendOtp } = useAuth()
  const navigate = useNavigate()
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(''))
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [resendStatus, setResendStatus] = useState('idle') // idle | sending | sent
  const inputs = useRef([])

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  if (!pendingToken && !accessToken) {
    navigate('/institution/login', { replace: true })
    return null
  }

  function setDigit(index, value) {
    const clean = value.replace(/\D/g, '').slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[index] = clean
      return next
    })
    if (clean && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!pasted) return
    e.preventDefault()
    const next = Array(CODE_LENGTH).fill('')
    for (let i = 0; i < pasted.length; i += 1) {
      next[i] = pasted[i]
    }
    setDigits(next)
    const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1)
    inputs.current[focusIndex]?.focus()
    if (pasted.length === CODE_LENGTH) {
      onSubmit(next)
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus()
    }
  }

  async function onSubmit(code = digits) {
    const joined = code.join('')
    if (joined.length !== CODE_LENGTH) {
      setError(`Enter all ${CODE_LENGTH} digits.`)
      return
    }
    setError(null)
    setSubmitting(true)

    try {
      const result = await verifyOtp(joined)

      if (result?.access) {
        localStorage.setItem('acvs.access', result.access)
        if (result.refresh) {
          localStorage.setItem('acvs.refresh', result.refresh)
        }
      }

      // 1. Redirection si le mot de passe doit être changé
      if (result?.must_change_password) {
        navigate('/institution/set-password', { replace: true })
        return
      }

      // 2. Détection du rôle Administrateur / Ministère
      const userData = result?.user || result?.data?.user || result
      const isAdmin = Boolean(
        userData?.is_administrator ||
        userData?.is_staff ||
        userData?.is_superuser ||
        ['ADMIN', 'MINISTRY'].includes(userData?.role) ||
        userData?.user_type === 'ADMIN'
      )

      // 3. Redirection conditionnelle selon le rôle
      if (isAdmin) {
        navigate('/admin/dashboard', { replace: true })
      } else {
        navigate('/institution/dashboard', { replace: true })
      }
    } catch (err) {
      // ...
    }
  }

  async function onResend() {
    setResendStatus('sending')
    setError(null)
    try {
      await resendOtp()
      setResendStatus('sent')
      setTimeout(() => setResendStatus('idle'), 4000)
    } catch (err) {
      setResendStatus('idle')
      setError(err.message ?? 'Could not resend code.')
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
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          className="relative w-full max-w-md overflow-hidden rounded-xl border border-slate-100 bg-paper-white shadow-sm"
        >
          <TricolorStrip />

          <div className="flex flex-col items-center px-8 pt-12 pb-6 text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-congo-blue/10 text-congo-blue">
              <span
                className="material-symbols-outlined fill"
                style={{ fontSize: 32 }}
              >
                lock
              </span>
            </div>

            <h1 className="font-sans text-2xl font-extrabold tracking-tight text-seal-black">
              Enter your 6-digit code
            </h1>
            <p className="mt-2 max-w-xs text-sm text-slate-500">
              We sent a one-time code to your official email. Enter it below to
              finish signing in. Codes expire after 5 minutes.
            </p>
          </div>

          <div className="space-y-6 px-8 pb-8">
            <div
              className="flex justify-center gap-2"
              onPaste={handlePaste}
            >
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputs.current[i] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  aria-label={`Digit ${i + 1}`}
                  className="h-14 w-12 rounded border-2 border-seal-black bg-paper-white text-center font-mono text-2xl font-bold text-seal-black transition-shadow focus:border-congo-blue focus:outline-none focus:ring-2 focus:ring-congo-blue/40"
                />
              ))}
            </div>

            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded border border-congo-red/20 bg-congo-red/10 p-3 text-sm text-congo-red"
              >
                <span className="material-symbols-outlined fill text-base">
                  error
                </span>
                <span>{error}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded bg-congo-blue py-4 font-sans text-base font-bold text-paper-white shadow-sm transition-colors hover:bg-congo-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined animate-spin text-base"
                    style={{ fontVariationSettings: "'FILL' 0" }}
                  >
                    progress_activity
                  </span>
                  Verifying…
                </>
              ) : (
                'Verify & Continue'
              )}
            </button>

            <div className="flex flex-col items-center gap-2 pt-2 text-center text-sm text-slate-500">
              <button
                type="button"
                onClick={onResend}
                disabled={resendStatus === 'sending'}
                className="font-mono text-xs text-congo-blue hover:underline disabled:opacity-60"
              >
                {resendStatus === 'sent'
                  ? 'Code resent — check your inbox'
                  : resendStatus === 'sending'
                    ? 'Resending…'
                    : "Didn't receive a code? Resend"}
              </button>
              <Link
                to="/institution/login"
                className="font-mono text-xs text-slate-500 hover:text-seal-black"
              >
                Use a different email
              </Link>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}