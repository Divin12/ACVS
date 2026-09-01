// Reached from /institution/login when the registrar's account exists
// but their institution is still PENDING final authorization from the
// Ministry. Surfaced only when the backend's login endpoint returns
// ValidationError({code: "institution_pending", message: ...}) — a
// distinct, code-keyed shape the backend reserves for PENDING. A
// suspended institution gets a different (generic) error and does NOT
// land here, because "awaiting approval" copy used here would be
// misleading for an institution that was actually deactivated.
//
// No auth guard — this is reached pre-login, like the rest of the
// /institution/* auth flow.
//
// Mirrors /design/screens/access_pending/code.html: centered card on a
// paper-white page, top tricolor bar, Ministry seal, pending icon, copy,
// divider, support contact, footer.
//
// Stitch tokens translated to DESIGN.md (congo-blue, seal-black,
// paper-white, slate-100, slate-500) — see design/Design.md §2.

import { Link } from 'react-router-dom'
import TricolorStrip from '../components/TricolorStrip.jsx'

export default function AccessPending() {
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
        <div className="relative w-full max-w-[480px] overflow-hidden rounded-lg border border-slate-100 bg-paper-white shadow-sm">
          <TricolorStrip />

          <div className="relative flex flex-col items-center px-6 py-12 text-center">
            {/* Subtle diagonal pattern — matches the Stitch export's
                "official document" hint. Decorative only; pointer-events
                disabled so it can never intercept clicks. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-5 pointer-events-none"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 0, transparent 50%)',
                backgroundSize: '10px 10px',
              }}
            />

            <div className="relative z-10 flex flex-col items-center">
              {/* Real Ministry seal from /design/logo.png (served at /logo.png).
                  Stitch's HTML uses a placeholder Google image — that's
                  a tradeoff for design tools, not acceptable in
                  production. The 2px ring matches the seal treatment on
                  Login.jsx for cross-screen consistency. */}
              <div className="mb-6 flex h-32 w-32 items-center justify-center rounded-full border-2 border-slate-100 bg-slate-100">
                <img
                  src="/logo.png"
                  alt="Sceau du Ministère de l'Éducation Nationale"
                  className="h-24 w-24 object-contain"
                />
              </div>

              {/* Pending indicator — yellow ring + filled icon. Stitch
                  uses surface-variant for the inner disc; closest DESIGN.md
                  analogue is slate-100. The pending icon glyph reads as
                  "indicator" universally without needing copy. */}
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100/70">
                <span
                  className="material-symbols-outlined text-4xl text-slate-500"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  pending
                </span>
              </div>

              <h1 className="mb-2 font-sans text-2xl font-semibold text-seal-black">
                Institution Access Pending Review
              </h1>

              <p className="mb-6 text-base text-slate-500">
                Your account has been created, but your institution is
                currently awaiting final authorization from the Ministry.
                You will be notified once access is granted.
              </p>

              <div className="my-4 h-px w-full bg-slate-100" />

              <div className="w-full text-center">
                <p className="mb-1 font-mono text-sm font-medium text-slate-500">
                  Support Contact
                </p>
                <a
                  href="mailto:registrar@edu-nc.gouv.cd"
                  className="text-base text-congo-blue underline-offset-4 hover:underline"
                >
                  registrar@edu-nc.gouv.cd
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="flex w-full flex-col items-center justify-between gap-2 border-t border-slate-100 px-6 py-4 font-mono text-xs text-slate-500 md:flex-row">
        <span>
          © {new Date().getFullYear()} République Démocratique du Congo -
          Ministère de l'Éducation Nationale et Nouvelle Citoyenneté
        </span>
        <div className="flex gap-4">
          <Link to="#" className="hover:text-congo-blue transition-colors">
            Privacy Policy
          </Link>
          <Link to="#" className="hover:text-congo-blue transition-colors">
            Terms of Service
          </Link>
          <Link to="#" className="hover:text-congo-blue transition-colors">
            Technical Support
          </Link>
        </div>
      </footer>
    </div>
  )
}
