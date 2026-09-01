// Status badge — Design.md §5.
// Always uses the semantic state tokens (anchored/disabled/not_found);
// never uses the brand palette here.

import VERIFY_STATES from '../verifyStates.js'

const TONE = {
  [VERIFY_STATES.VALID]: {
    // Default valid badge — anchored, emerald tokens. Used when the
    // certificate is genuinely sealed on-chain.
    label: 'Anchored',
    icon: 'verified',
    textClass: 'text-state-anchored',
    bgClass: 'bg-state-anchored/10',
    borderClass: 'border-state-anchored/20',
  },
  [VERIFY_STATES.DISABLED]: {
    label: 'Disabled',
    icon: 'block',
    iconFilled: true,
    textClass: 'text-paper-white',
    bgClass: 'bg-state-disabled',
    borderClass: 'border-transparent',
    uppercase: true,
  },
  [VERIFY_STATES.NOT_FOUND]: {
    label: 'Not Found',
    icon: 'search_off',
    textClass: 'text-state-not-found',
    bgClass: 'bg-slate-100',
    borderClass: 'border-outline',
  },
}

// Grace-period valid records are technically "valid" per DESIGN.md §4B
// (three-result mandate: Valid/Disabled/Not Found) — the seal just hasn't
// been struck yet. The badge tone uses the amber grace-period tokens to
// signal that without adding a fourth top-level state.
const REGISTERED_TONE = {
  label: 'Registered',
  icon: 'pending',
  textClass: 'text-state-grace',
  bgClass: 'bg-state-grace/10',
  borderClass: 'border-state-grace/20',
}

/**
 * @param {object} props
 * @param {string} props.state    One of VERIFY_STATES.
 * @param {'anchored'|'registered'} [props.variant]
 *   Only meaningful when state === 'valid'. 'anchored' (default) renders
 *   the emerald seal tone; 'registered' renders the amber grace-period
 *   tone for certs that are on record but not yet permanently sealed.
 */
export default function StatusBadge({ state, variant = 'anchored' }) {
  let tone = TONE[state]
  if (state === VERIFY_STATES.VALID && variant === 'registered') {
    tone = REGISTERED_TONE
  }
  if (!tone) return null
  return (
    <span
      className={[
        'inline-flex items-center gap-2 px-4 py-1 rounded-full border font-mono text-sm font-medium tracking-wide',
        tone.bgClass,
        tone.textClass,
        tone.borderClass,
        tone.uppercase ? 'uppercase font-bold' : '',
      ].join(' ')}
    >
      <span
        className={[
          'material-symbols-outlined text-[18px]',
          tone.iconFilled ? 'fill' : '',
        ].join(' ')}
      >
        {tone.icon}
      </span>
      {tone.label}
    </span>
  )
}
