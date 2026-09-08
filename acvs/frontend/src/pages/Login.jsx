import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import TricolorStrip from '../components/TricolorStrip.jsx'
import { useAuth } from '../useAuth.js'

export default function Login() {
  const { login, pendingToken } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Si un pending_token existe déjà, rediriger directement vers la vérification OTP
  if (pendingToken) {
    return <Navigate to="/institution/otp" replace />
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      // Exécution de la connexion via le Context Auth
      const userData = await login(email, password)

      // Vérification des privilèges Administrateur / Ministère
      const isAdmin =
        userData?.is_administrator ||
        userData?.is_staff ||
        userData?.is_superuser ||
        ['ADMIN', 'MINISTRY'].includes(userData?.role)

      if (isAdmin) {
        // Redirection directe des admins vers la vue d'ensemble du Ministère
        navigate('/admin/dashboard', { replace: true })
      } else {
        // Les registrars d'institutions passent à l'étape de validation OTP
        navigate('/institution/otp', { replace: true })
      }
    } catch (err) {
      // Gestion des institutions en attente d'approbation
      const code = Array.isArray(err.body?.details?.code)
        ? err.body.details.code[0]
        : err.body?.details?.code

      if (code === 'institution_pending') {
        navigate('/institution/access-pending', { replace: true })
        return
      }

      setError(err.message ?? 'Échec de la connexion. Veuillez réessayer.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-paper-white">
      {/* Bandeau supérieur Tricolore RDC */}
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
          onSubmit={onSubmit}
          className="relative w-full max-w-md overflow-hidden rounded-xl border border-slate-100 bg-paper-white shadow-sm"
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
            <div>
              <label
                htmlFor="email"
                className="mb-2 block font-mono text-sm font-bold text-seal-black"
              >
                Official Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="registrar@institution.cd"
                className="w-full rounded border-2 border-seal-black bg-paper-white p-3 font-mono text-base text-seal-black transition-shadow focus:border-congo-blue focus:outline-none focus:ring-2 focus:ring-congo-blue/40"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="font-mono text-sm font-bold text-seal-black"
                >
                  Password
                </label>
                <Link
                  to="/institution/forgot-password"
                  className="font-mono text-xs text-congo-blue hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded border-2 border-seal-black bg-paper-white p-3 font-mono text-base text-seal-black transition-shadow focus:border-congo-blue focus:outline-none focus:ring-2 focus:ring-congo-blue/40"
              />
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
                  Signing In…
                </>
              ) : (
                'Sign In'
              )}
            </button>

            <p className="pt-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Authorized Personnel Only
            </p>
          </div>
        </form>
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