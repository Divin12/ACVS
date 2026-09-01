// Sidebar + topbar chrome for the institution area, mirrored from
// /design/screens/bulk_cohort_registration/code.html. All Stitch color
// classes are translated to the canonical DESIGN.md palette (see /auth,
// /dashboard, /certificates/new all rely on this layout).

import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../useAuth.js'
import TricolorStrip from '../components/TricolorStrip.jsx'

const NAV_ITEMS = [
  { to: '/institution/dashboard', label: "Overview", icon: 'dashboard' },
  { to: '/institution/certificates', label: 'Certificates', icon: 'verified_user' },
  { to: '#', label: 'Establishments', icon: 'account_balance', disabled: true },
  { to: '/Activity-log', label: "Audit log", icon: 'history' },
  { to: '#', label: 'Settings', icon: 'settings', disabled: true },
]


export default function AppShell({ children, topbarCta }) {
  return (
    <div className="flex h-screen overflow-hidden bg-paper-white text-seal-black font-sans">
      <SideNav />
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden bg-paper-white">
        <TopBar cta={topbarCta} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

function SideNav() {
  return (
    <nav className="flex h-full w-64 shrink-0 flex-col border-r border-slate-100 bg-slate-100 py-6">
      <div className="mb-12 px-6">
        <div className="mb-4 flex items-center gap-4">
          <div
            aria-label="Sceau Officiel RDC"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100"
          >
            <span className="material-symbols-outlined text-seal-black">
              account_balance
            </span>
          </div>
          <div>
            <h2 className="text-lg font-extrabold leading-tight text-seal-black">
              ACVS Portal
            </h2>
            <p className="text-xs text-slate-500">Central Administration</p>
          </div>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-0">
        {NAV_ITEMS.map((item) => (
          <li key={item.label}>
            <SideLink item={item} />
          </li>
        ))}
      </ul>

      <div className="mt-auto border-t border-slate-100 px-6 pt-6">
        <ul className="flex flex-col gap-1">
          <li>
            <a
              href="#"
              className="flex items-center gap-4 py-3 font-mono text-sm text-slate-500 transition-all hover:text-seal-black"
            >
              <span className="material-symbols-outlined">help</span>
              Help
            </a>
          </li>
          <li>
            <LogoutLink />
          </li>
        </ul>
      </div>
    </nav>
  )
}

function SideLink({ item }) {
  const className =
    'flex items-center gap-4 border-l-4 px-6 py-3 font-mono text-sm transition-all'
  if (item.disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${className} cursor-not-allowed border-transparent text-slate-500/60`}
      >
        <span className="material-symbols-outlined">{item.icon}</span>
        {item.label}
      </span>
    )
  }
  return (
    <NavLink
      to={item.to}
      end
      className={({ isActive }) =>
        `${className} ${
          isActive
            ? 'border-congo-yellow bg-congo-yellow/20 font-bold text-seal-black'
            : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-seal-black'
        }`
      }
    >
      <span className="material-symbols-outlined">{item.icon}</span>
      {item.label}
    </NavLink>
  )
}

function LogoutLink() {
  const { logout } = useAuth()
  return (
    <button
      type="button"
      onClick={logout}
      className="flex w-full items-center gap-4 py-3 text-left font-mono text-sm text-slate-500 transition-all hover:text-seal-black"
    >
      <span className="material-symbols-outlined">logout</span>
      Logout
    </button>
  )
}

function TopBar({ cta }) {
  const location = useLocation()
  const { user } = useAuth()

  const secondaryNav = [
    { to: '/institution/dashboard', label: 'Dashboard' },
    { to: '/institution/certificates', label: 'Registers' },
    { to: '/verify', label: 'Verification' },
    { to: '#', label: 'Archives', disabled: true },
  ]

  return (
    <header className="flex h-20 w-full shrink-0 items-center justify-between border-b border-slate-100 bg-paper-white px-6">
      <div className="flex items-center gap-6">
        <h1 className="text-base font-bold uppercase tracking-wider text-seal-black">
          Ministry of Education
        </h1>
        {user?.institution_name ? (
          <span className="hidden font-mono text-xs text-slate-500 md:inline">
            · {user.institution_name}
          </span>
        ) : null}
      </div>

      <nav className="hidden items-center gap-6 md:flex">
        {secondaryNav.map((item) => {
          if (item.disabled) {
            return (
              <span
                key={item.label}
                className="pb-1 font-sans text-base text-slate-500/60"
              >
                {item.label}
              </span>
            )
          }
          const active = location.pathname.startsWith(item.to)
          return (
            <NavLink
              key={item.label}
              to={item.to}
              className={`pb-1 font-sans text-base transition-colors ${
                active
                  ? 'border-b-2 border-congo-blue font-bold text-congo-blue'
                  : 'text-slate-500 hover:text-congo-blue'
              }`}
            >
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="flex items-center gap-4">
        {cta ?? (
          <NavLink
            to="/institution/certificates/new"
            className="flex items-center gap-2 rounded bg-congo-blue px-4 py-2 font-sans text-base font-bold text-paper-white transition-colors hover:bg-congo-blue/90"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New Cohort
          </NavLink>
        )}
      </div>
    </header>
  )
}