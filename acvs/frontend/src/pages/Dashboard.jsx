// Minimal landing page for the registrar area. Not in the Stitch exports —
// gives the bulk-register screen somewhere real to live, surfaces the
// institution name from /api/auth/me/ so the user can confirm they're signed
// in as the right account, and offers the primary CTA.

import { Link } from 'react-router-dom'
import AppShell from '../components/AppShell.jsx'
import { useAuth } from '../useAuth.js'

export default function Dashboard() {
  const { user, userStatus } = useAuth()

  return (
    <AppShell>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="rounded-xl border border-slate-100 bg-paper-white p-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
            Dashboard
          </p>
          <h1 className="mt-2 font-sans text-2xl font-extrabold tracking-tight text-seal-black">
            Welcome{user?.institution_name ? ` — ${user.institution_name}` : ''}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {userStatus === 'loading'
              ? 'Loading your account…'
              : 'Use the registrar tools below to manage certificate registration.'}
          </p>
        </header>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Link
            to="/institution/certificates/new"
            className="group flex flex-col gap-3 rounded-xl border border-congo-blue/30 bg-congo-blue/5 p-6 transition-colors hover:bg-congo-blue/10"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-congo-blue text-paper-white">
                <span className="material-symbols-outlined fill">inventory_2</span>
              </span>
              <span className="material-symbols-outlined text-slate-500 transition-transform group-hover:translate-x-1">
                arrow_forward
              </span>
            </div>
            <h2 className="font-sans text-lg font-bold text-seal-black">
              Register a New Cohort
            </h2>
            <p className="text-sm text-slate-500">
              Add multiple certificates at once using the cohort spreadsheet.
              Each row becomes one certificate record.
            </p>
          </Link>

          <Link
            to="/verify"
            className="group flex flex-col gap-3 rounded-xl border border-slate-100 bg-paper-white p-6 transition-colors hover:border-congo-blue/40"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-seal-black">
                <span className="material-symbols-outlined">search</span>
              </span>
              <span className="material-symbols-outlined text-slate-500 transition-transform group-hover:translate-x-1">
                arrow_forward
              </span>
            </div>
            <h2 className="font-sans text-lg font-bold text-seal-black">
              Public Verification
            </h2>
            <p className="text-sm text-slate-500">
              Open the public verification page to test how a record appears to
              anyone holding a certificate ID.
            </p>
          </Link>
        </section>
      </div>
    </AppShell>
  )
}