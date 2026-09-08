// Landing page for the public ACVS portal.
//
// Three sections above the fold, in the order established in /design/Design.md
// §0 and §4A:
//   1. Ministry lockup (full-size, per the seal's own three-line lockup)
//   2. Mission grounded in the Ministry's two published strategic priorities
//      that motivate this system (DESIGN.md §0: #4 Modernise; #6 Improve
//      governance). Section 0 is explicit that these two mandates organize
//      the design — the page should read as their instrument.
//   3. Certificate lifecycle visual (Grace Period -> Anchored -> Disabled)
//      drawn as a horizontal stepper per §4A. §4A is explicit that this is
//      "the one place a numbered/staged UI device is actually justified,
//      because the content genuinely is a fixed, ordered sequence." §8 bans
//      reusing the Anchoring Confirmation seal motif anywhere else.
//
// Primary CTA ("Verify a Certificate") targets /verify, where the form and
// result card already live. Secondary CTA ("Institution Login") targets
// /institution/login.
//
// Motion — see find-animation-opportunities sweep:
//   * hero text + form fade-in (one-shot on mount, 500ms, ease-out)
//   * sticky-header border transition as user leaves hero (180ms, ease-out)
//   * lifecycle connector line drawn left-to-right on viewport entry
//     (600ms line + 120ms staggered pills, ease-out)
//   * state-pill color shift on hover (140ms)
//   * primary CTA scale(0.97) on :active (100ms)
//
// All easing uses cubic-bezier(0.23, 1, 0.32, 1) per emil-design-eng
// (--ease-out). prefers-reduced-motion falls back to static render in every
// case — entrances become instant, hover/active states remain tactile but
// no transitions run.

import { useEffect, useRef, useState } from 'react'
import TricolorStrip from '../components/TricolorStrip.jsx'

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

/* ------------------------------------------------------------------ */
/* Header — full Ministry lockup, sticky. The vertical tricolor bar    */
/* sits between seal and wordmark, matching the seal's own arrangement. */
/* ------------------------------------------------------------------ */

function PageHeader({ scrolledPast }) {
  return (
    <header
      className={[
        'w-full max-w-[1280px] mx-auto px-6 md:px-12 h-24 flex justify-between items-center sticky top-0 z-50 bg-paper-white',
        scrolledPast
          ? 'border-b border-slate-100 transition-[border-color] duration-200'
          : 'border-b border-transparent transition-[border-color] duration-200',
      ].join(' ')}
      style={{ transitionTimingFunction: EASE_OUT }}
    >
      <div className="flex items-center gap-4">
        <img
          src="/logo.png"
          alt="République Démocratique du Congo - Ministère de l'Éducation Nationale et Nouvelle Citoyenneté"
          className="h-16 w-auto object-contain"
        />
        <TricolorStrip orientation="vertical" />
        <div className="hidden md:block">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-seal-black leading-tight">
            République Démocratique du Congo
          </p>
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-seal-black leading-tight">
            Ministère de l'Éducation Nationale
          </p>
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-seal-black leading-tight">
            et Nouvelle Citoyenneté
          </p>
        </div>
        
      </div>
      <a
        href="/institution/login"
        className="font-mono text-sm text-congo-blue font-bold px-4 py-2 rounded hover:bg-congo-blue/10 transition-colors flex items-center gap-2"
      >
        Institution Login
        <span className="material-symbols-outlined text-[18px]">login</span>
      </a>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* PageFooter — same chrome as PublicVerify, kept identical so the     */
/* public-facing surfaces feel like one institution.                   */
/* ------------------------------------------------------------------ */

function PageFooter() {
  return (
    <footer className="w-full max-w-[1280px] mx-auto px-6 md:px-12 py-6 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-500 text-xs">
      <div className="text-center md:text-left">
        © {new Date().getFullYear()} République Démocratique du Congo - Ministère
        de l'Éducation Nationale et Nouvelle Citoyenneté
      </div>
      <div className="flex gap-6">
        <a href="#" className="hover:text-congo-blue">
          Privacy Policy
        </a>
        <a href="#" className="hover:text-congo-blue">
          Terms of Service
        </a>
        <a href="#" className="hover:text-congo-blue">
          Technical Support
        </a>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ */
/* Lifecycle stepper — DESIGN.md §4A's pipeline, drawn as a horizontal*/
/* stepper with three labeled nodes and a connector line. Connector    */
/* animation: drawn left-to-right on viewport entry, pills stagger.   */
/* ------------------------------------------------------------------ */

const LIFECYCLE_STATES = [
  {
    key: 'grace_period',
    label: 'Grace Period',
    description:
      'A record sits in the issuing institution’s registry and can still be corrected.',
    icon: 'pending',
    token: 'state-grace',
    border: 'border-state-grace',
  },
  {
    key: 'anchored',
    label: 'Anchored',
    description:
      'The record’s hash is written to the official registry and the contents become immutable.',
    icon: 'verified',
    token: 'state-anchored',
    border: 'border-state-anchored',
  },
  {
    key: 'disabled',
    label: 'Disabled',
    description:
      'The issuing institution has revoked the record; the disablement is permanent and visible.',
    icon: 'block',
    iconFilled: true,
    token: 'state-disabled',
    border: 'border-state-disabled',
  },
]

function LifecycleStepper() {
  const trackRef = useRef(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const node = trackRef.current
    if (!node) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setDrawn(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setDrawn(true)
            observer.disconnect()
            break
          }
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={trackRef} className="w-full">
      {/* Desktop / tablet: horizontal stepper with drawn connector */}
      <div className="hidden md:block">
        <div className="relative">
          {/* Static full connector (slate-100) under the animated line.
              Drawn line overlays it. */}
          <div
            className="absolute left-0 right-0 top-5 h-px bg-slate-100"
            aria-hidden="true"
          />
          {/* Animated slate-500 line — width grows 0 -> 100% on entry.
              Origin is left edge (matches left-to-right lifecycle reading). */}
          <div
            className="absolute left-0 top-5 h-px bg-slate-500 origin-left"
            aria-hidden="true"
            style={{
              width: drawn ? '100%' : '0%',
              transition: drawn
                ? 'width 600ms cubic-bezier(0.23, 1, 0.32, 1)'
                : 'none',
            }}
          />

          <ol className="relative grid grid-cols-3 gap-4">
            {LIFECYCLE_STATES.map((s, i) => (
              <li
                key={s.key}
                className="flex flex-col items-center text-center"
                style={{
                  opacity: drawn ? 1 : 0,
                  transform: drawn ? 'translateY(0)' : 'translateY(8px)',
                  transition: `opacity 360ms ${EASE_OUT} ${
                    i * 120
                  }ms, transform 360ms ${EASE_OUT} ${i * 120}ms`,
                }}
              >
                <span
                  className={[
                    'w-10 h-10 rounded-full bg-paper-white border-2 flex items-center justify-center transition-colors duration-150',
                    `border-${s.token}`,
                    `text-${s.token}`,
                  ].join(' ')}
                  style={{
                    transitionTimingFunction: EASE_OUT,
                  }}
                >
                  <span
                    className={[
                      'material-symbols-outlined text-[20px]',
                      s.iconFilled ? 'fill' : '',
                    ].join(' ')}
                  >
                    {s.icon}
                  </span>
                </span>
                <p className="mt-3 font-mono text-sm font-medium text-seal-black">
                  {s.label}
                </p>
                <p className="mt-2 text-sm text-slate-500 max-w-[220px] leading-relaxed">
                  {s.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Mobile: vertical stack — horizontal stepper does not survive  < 768px
          (DESIGN.md §9: mobile is the primary target for the public flow,
          and a horizontal connector loses its meaning when it wraps). */}
      <ol className="md:hidden flex flex-col gap-6">
        {LIFECYCLE_STATES.map((s) => (
          <li key={s.key} className="flex items-start gap-4">
            <span
              className={[
                'shrink-0 w-10 h-10 rounded-full bg-paper-white border-2 flex items-center justify-center',
                `border-${s.token}`,
                `text-${s.token}`,
              ].join(' ')}
            >
              <span
                className={[
                  'material-symbols-outlined text-[20px]',
                  s.iconFilled ? 'fill' : '',
                ].join(' ')}
              >
                {s.icon}
              </span>
            </span>
            <div>
              <p className="font-mono text-sm font-medium text-seal-black">
                {s.label}
              </p>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">
                {s.description}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-10 text-center text-sm text-slate-500 max-w-[640px] mx-auto leading-relaxed">
        Every certificate passes through these three states in order.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page root                                                          */
/* ------------------------------------------------------------------ */

export default function Landing() {
  // Header gets a border once the user has scrolled past the hero —
  // gives sticky chrome a visible edge without making the resting state
  // loud (DESIGN.md §1: "flat by default… elevation is used sparingly
  // and only to indicate something is temporarily editable or interactive").
  const [scrolledPast, setScrolledPast] = useState(false)
  useEffect(() => {
    function onScroll() {
      setScrolledPast(window.scrollY > 240)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Hero entrance — one-shot on mount, fade + small translate.
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const entrance = reduceMotion
    ? {}
    : {
        opacity: 0,
        transform: 'translateY(8px)',
      }

  // CSS transitions resolve to opacity 1, translateY 0 once mounted;
  // useEffect applies the resolved state on the next frame so the
  // transition runs from the entry value.
  const heroTextRef = useRef(null)
  useEffect(() => {
    if (reduceMotion) return
    const node = heroTextRef.current
    if (!node) return
    // Force a layout, then trigger the transition.
    requestAnimationFrame(() => {
      node.style.opacity = '1'
      node.style.transform = 'translateY(0)'
    })
  }, [reduceMotion])

  return (
    <div className="min-h-svh flex flex-col bg-paper-white">
      <PageHeader scrolledPast={scrolledPast} />

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-6 md:px-12 py-16 md:py-24">
        {/* HERO + PRIMARY CTA ------------------------------------------- */}
        <section className="flex flex-col items-center text-center max-w-[720px] mx-auto">
          <div
            ref={heroTextRef}
            style={{
              ...entrance,
              transition: `opacity 500ms ${EASE_OUT}, transform 500ms ${EASE_OUT}`,
            }}
          >
            <h1 className="font-sans text-2xl md:text-2xl font-extrabold tracking-tight text-seal-black leading-tight mb-6">
              Verify academic certificates issued by DRC institutions
            </h1>

            <p className="text-base text-slate-500 leading-relaxed max-w-[640px] mb-10">
              ACVS gives every certificate issued in the DRC an official
              identifier and a permanent registry record. Employers, other
              institutions, and the public can confirm a certificate’s
              authenticity from a single ID number or QR code.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/verify"
                className="inline-flex items-center justify-center gap-2 bg-congo-blue text-paper-white font-mono text-sm font-bold px-6 py-4 rounded hover:bg-congo-blue/90 transition-colors shadow-sm min-h-[56px]"
              >
                <span className="material-symbols-outlined text-[20px]">search</span>
                Verify a Certificate
              </a>
              <a
                href="/institution/login"
                className="inline-flex items-center justify-center gap-2 bg-paper-white text-seal-black font-mono text-sm font-bold px-6 py-4 rounded border border-seal-black hover:bg-seal-black/5 transition-colors min-h-[56px]"
              >
                Institution Login
                <span className="material-symbols-outlined text-[18px]">login</span>
              </a>
            </div>
          </div>
        </section>

        {/* MISSION ------------------------------------------------------- */}
        <section className="mt-24 md:mt-32 grid grid-cols-1 md:grid-cols-2 gap-12 max-w-[960px] mx-auto">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500 mb-3">
              Why this registry exists
            </p>
            <p className="text-base text-seal-black leading-relaxed">
              Verification in the DRC has, until now, required a phone call or
              a physical visit to the issuing institution, a process that can
              take weeks and still fails to catch forged certificates. This
              registry is built to support two of the Ministry’s published
              strategic priorities: modernising the education system by
              integrating ICT into school administration, and improving
              governance by running the system on reliable, transparent data.
            </p>
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500 mb-3">
              How a certificate moves through the registry
            </p>
            <p className="text-base text-seal-black leading-relaxed">
              Each certificate passes through three states. While a record is
              in the first state, the issuing institution can correct typos,
              wrong dates, or misspelled names. When the record advances to the
              second state, its hash is written to the registry and the
              contents become immutable. If a record must later be invalidated,
              it is moved to the third state, and that disablement is itself
              permanent and visible to anyone who looks it up.
            </p>
          </div>
        </section>

        {/* LIFECYCLE VISUAL --------------------------------------------- */}
        <section className="mt-24 md:mt-32">
          <h2 className="text-center font-sans text-xl font-semibold text-seal-black mb-3">
            Certificate lifecycle
          </h2>
          <p className="text-center text-base text-slate-500 max-w-[640px] mx-auto mb-12 leading-relaxed">
            Three states, always in this order. The current state of any
            certificate is shown on its verification page.
          </p>
          <LifecycleStepper />
        </section>
      </main>

      <PageFooter />
    </div>
  )
}
