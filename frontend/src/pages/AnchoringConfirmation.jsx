// Anchoring Confirmation flow — the single screen in the product that uses
// the radial seal motif (DESIGN.md §5 / seal_moment Stitch export).
//
// Per DESIGN.md §1 and §8, this treatment appears once, here, and is never
// reused in navigation icons, loading states, or marketing copy. Everywhere
// else in the product stays restrained.
//
// Lifecycle of this screen:
//   1. Fetch the certificate (same getCertificate path CertificateDetail uses)
//      so we know we're anchoring the right record. The cert carries
//      `pending_hash` — the value the registrar is about to commit to.
//   2. Confirm MetaMask is connected. Prompt if not.
//   3. Send anchorCertificate(certIdBytes32, hashBytes32) via the user's
//      MetaMask. This is the only chain-writing action the frontend performs.
//   4. On receipt: POST /api/certificates/<id>/anchor/ with {tx_hash} —
//      the backend independently reads the on-chain hash and trusts that.
//      We never compute or send a hash from the client; we send the audit
//      tx_hash only.
//   5. On success: render the seal moment with the cert's chain_hash.
//      Anywhere else (loading, errors) we render a plain panel — no seal
//      motif, per the design rule.
//
// State machine (anchorPhase):
//   idle → connecting → ready_to_sign
//                         → requesting_signature
//                              → recording_backend
//                                   → success
//                              ↘ error_rejected | error_reverted | error_rpc
//                         ↘ error_not_installed | error_misconfigured
//   (record-step backend errors: error_chain_not_anchored |
//    error_hash_mismatch | error_not_grace_period | error_generic)

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppShell from '../components/AppShell.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import TricolorStrip from '../components/TricolorStrip.jsx'
import { getCertificate } from '../api/getCertificate.js'
import { recordAnchor } from '../api/anchorCertificate.js'
import {
  AnchorError,
  isMetaMaskInstalled,
  requestAnchor,
} from '../api/metamask.js'
import { useAuth } from '../useAuth.js'
import VERIFY_STATES from '../verifyStates.js'
import LIST_STATES from '../listStates.js'

export default function AnchoringConfirmation() {
  const { id: certificateId } = useParams()
  const { accessToken } = useAuth()
  const navigate = useNavigate()

  // Stage 1 — load the cert so we have pending_hash and can confirm the
  // user is looking at the right record. Mirrors CertificateDetail's
  // fetch contract.
  const [load, setLoad] = useState({ kind: 'loading' })

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoad({ kind: 'loading' })
    getCertificate({ accessToken, certificateId })
      .then(({ cert, notFound }) => {
        if (cancelled) return
        if (notFound) setLoad({ kind: 'not_found' })
        else setLoad({ kind: 'ready', cert })
      })
      .catch((err) => {
        if (cancelled) return
        setLoad({
          kind: 'error',
          message: err?.message ?? 'Could not load certificate.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, certificateId])

  // If the cert is already anchored or disabled, the Anchor Now button
  // would never have sent the user here — but defend anyway.
  if (load.kind === 'ready' && load.cert.status !== LIST_STATES.GRACE_PERIOD) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <BackLink />
          <NonGracePeriodPanel cert={load.cert} />
        </div>
      </AppShell>
    )
  }

  if (load.kind === 'loading') {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <BackLink />
          <LoadingPanel />
        </div>
      </AppShell>
    )
  }
  if (load.kind === 'not_found') {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <BackLink />
          <NotFoundPanel certificateId={certificateId} />
        </div>
      </AppShell>
    )
  }
  if (load.kind === 'error') {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <BackLink />
          <LoadErrorPanel message={load.message} />
        </div>
      </AppShell>
    )
  }

  // Ready — render the anchoring flow. The seal moment takes over the
  // page entirely on success; everything below it is the pre-confirmation
  // surface.
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <BackLink />
        <AnchoringFlow certificateId={certificateId} cert={load.cert} accessToken={accessToken} navigate={navigate} />
      </div>
    </AppShell>
  )
}

/* ------------------------------------------------------------------ */
/* Anchoring flow — the state machine proper                            */
/* ------------------------------------------------------------------ */

function AnchoringFlow({ certificateId, cert, accessToken, navigate }) {
  // phase: 'idle' | 'connecting' | 'ready_to_sign'
  //        | 'requesting_signature' | 'recording_backend' | 'success'
  // error: null | {kind, message, canRetry}
  const [phase, setPhase] = useState('idle')
  const [metaMaskAddress, setMetaMaskAddress] = useState(null)
  const [error, setError] = useState(null)
  const [confirmedCert, setConfirmedCert] = useState(null)

  async function onConnect() {
    if (!isMetaMaskInstalled()) {
      setError({
        kind: 'not_installed',
        message:
          'MetaMask is not installed in this browser. Install the MetaMask extension to anchor certificates on-chain.',
        canRetry: false,
      })
      return
    }
    setError(null)
    setPhase('connecting')
    try {
      // Re-use the same request-accounts path the wrapper uses internally
      // — we just want the address here, not the anchor call yet.
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const address = accounts?.[0] ?? null
      if (!address) {
        setError({
          kind: 'user_rejected',
          message: 'No MetaMask account was selected. Try connecting again.',
          canRetry: true,
        })
        setPhase('idle')
        return
      }
      setMetaMaskAddress(address)
      setPhase('ready_to_sign')
    } catch (err) {
      if (err?.code === 4001) {
        setError({
          kind: 'user_rejected',
          message: 'You cancelled the MetaMask connect prompt. Nothing happened.',
          canRetry: true,
        })
      } else {
        setError({
          kind: 'rpc_failed',
          message: `MetaMask could not be reached: ${err?.message ?? 'unknown error'}.`,
          canRetry: true,
        })
      }
      setPhase('idle')
    }
  }

  async function onSignAndAnchor() {
    setError(null)
    setPhase('requesting_signature')
    let txHash
    try {
      ;({ txHash } = await requestAnchor({
        certificateId: cert.certificate_id,
        hashHex: cert.pending_hash,
      }))
    } catch (err) {
      if (err instanceof AnchorError) {
        // The wrapper's four categories. user_rejected and rpc_failed
        // are recoverable; 'reverted' is the registrar signing over an
        // already-anchored cert (we still send the user back to the
        // detail page so they see the new state); 'misconfigured' is
        // an ops problem, not a retry.
        const recoverable =
          err.kind === 'user_rejected' || err.kind === 'rpc_failed'
        setError({
          kind:
            err.kind === 'user_rejected'
              ? 'user_rejected'
              : err.kind === 'reverted'
                ? 'reverted'
                : err.kind === 'rpc_failed'
                  ? 'rpc_failed'
                  : 'misconfigured',
          message: err.message,
          canRetry: recoverable,
        })
        setPhase('ready_to_sign')
      } else {
        setError({
          kind: 'rpc_failed',
          message: err?.message ?? 'MetaMask / Ganache could not complete the anchor.',
          canRetry: true,
        })
        setPhase('ready_to_sign')
      }
      return
    }

    // Tx mined (web3.send resolves on receipt). Now record the audit
    // tx_hash against the backend; the backend re-reads the chain and
    // is the source of truth for chain_hash.
    setPhase('recording_backend')
    try {
      const updated = await recordAnchor({ accessToken, certificateId, txHash })
      setConfirmedCert(updated)
      setPhase('success')
    } catch (err) {
      const k = err?.kind ?? 'generic'
      const recoverableKinds = new Set(['chain_not_anchored', 'rpc_failed', 'generic'])
      setError({
        kind: k,
        message: err?.message ?? 'The backend could not record the anchor.',
        canRetry: recoverableKinds.has(k),
      })
      // Bounce back to ready_to_sign so the user can retry the record
      // step. The on-chain tx is already mined — MetaMask confirmed it
      // — so retrying just means re-calling POST with the same tx_hash.
      // Note: 'not_grace_period' and 'hash_mismatch' mean the situation
      // is no longer "retry record" — they want a refresh, not a retry.
      setPhase(recoverableKinds.has(k) ? 'ready_to_sign' : 'ready_to_sign')
    }
  }

  if (phase === 'success' && confirmedCert) {
    return <SealMoment cert={confirmedCert} navigate={navigate} />
  }

  return (
    <>
      <PreAnchorPanel cert={cert} />

      {phase === 'idle' && error?.kind === 'not_installed' ? (
        <ErrorPanel error={error} onRetry={onConnect} />
      ) : phase === 'idle' && error ? (
        <ErrorPanel error={error} onRetry={onConnect} />
      ) : phase === 'idle' ? (
        <ConnectPanel onConnect={onConnect} />
      ) : phase === 'connecting' ? (
        <PendingPanel label="Opening MetaMask…" sublabel="Confirm the connection in the MetaMask popup." />
      ) : phase === 'ready_to_sign' ? (
        <SignPanel
          address={metaMaskAddress}
          error={error}
          onSign={onSignAndAnchor}
          onReconnect={onConnect}
          onRetryRecord={error ? () => onSignAndAnchor() : null}
        />
      ) : phase === 'requesting_signature' ? (
        <PendingPanel
          label="Awaiting MetaMask confirmation…"
          sublabel="Check the MetaMask popup, then confirm. This can take several seconds to seal on-chain."
        />
      ) : phase === 'recording_backend' ? (
        <PendingPanel
          label="Confirming on Ethereum…"
          sublabel="The transaction is being sealed. Recording the result with the registry."
        />
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* The Seal Moment — renders ONCE, in the success branch only.         */
/* Per DESIGN.md §1 and §8, the radial stamp motif does not appear in  */
/* loading states, navigation, or anywhere else in the product.        */
/* ------------------------------------------------------------------ */

function SealMoment({ cert, navigate }) {
  return (
    <section className="overflow-hidden rounded-xl border border-state-anchored/20 bg-paper-white shadow-sm">
      <TricolorStrip />

      <div className="flex flex-col items-center gap-8 px-6 py-12 text-center">
        {/* Radial seal — concentric circles + dashed outer ring, with
            the anchored badge centered. Stroke uses state-anchored at
            muted opacities so the seal reads as "official" without
            screaming emerald. */}
        <div
          className="relative flex h-64 w-64 items-center justify-center"
          aria-hidden="true"
        >
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-state-anchored/30" />
          <div className="absolute inset-3 rounded-full border border-state-anchored/40" />
          <div className="absolute inset-6 rounded-full border border-state-anchored/20" />
          {/* Eight radial spokes at N/S/E/W + corners */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <div
              key={deg}
              className="absolute h-full w-px bg-state-anchored/20"
              style={{ transform: `rotate(${deg}deg)` }}
            />
          ))}
          {/* Centered anchored badge */}
          <div className="relative z-10 flex h-40 w-40 flex-col items-center justify-center rounded-full border-4 border-state-anchored/60 bg-state-anchored/10 shadow-sm">
            <span
              className="material-symbols-outlined fill text-state-anchored"
              style={{ fontSize: 40 }}
            >
              verified
            </span>
            <span className="mt-1 font-mono text-xs font-bold uppercase tracking-widest text-state-anchored">
              Anchored
            </span>
          </div>
        </div>

        {/* Status badge — uses the same StatusBadge component the rest
            of the product uses for anchored records. */}
        <StatusBadge state={VERIFY_STATES.VALID} variant="anchored" />

        {/* Permanence copy — DESIGN.md §5 wording. */}
        <div className="max-w-md">
          <h2 className="font-sans text-2xl font-extrabold tracking-tight text-seal-black">
            Certificate Record Secured
          </h2>
          <p className="mt-3 font-sans text-sm text-slate-500">
            This record is now permanent and can no longer be edited. It has
            been cryptographically anchored on the Ethereum registry.
          </p>
        </div>

        {/* Data blocks — both monospace, full-length, with copy. */}
        <div className="w-full max-w-lg space-y-4 text-left">
          <DataBlock label="Certificate Identifier" value={cert.certificate_id} />
          <DataBlock
            label="Blockchain Hash Anchor"
            value={formatChainHash(cert.chain_hash)}
          />
        </div>

        {/* Return affordances — secondary + link, mirroring the Stitch
            export's two-button pattern. */}
        <div className="flex w-full max-w-md flex-col items-center gap-3 pt-2">
          <Link
            to="/institution/certificates"
            className="inline-flex w-full items-center justify-center gap-2 rounded border border-seal-black bg-paper-white px-6 py-3 font-sans text-base font-bold text-seal-black transition-colors hover:bg-slate-100"
          >
            <span className="material-symbols-outlined text-[18px]">
              arrow_back
            </span>
            Return to Registers
          </Link>
          <button
            type="button"
            onClick={() => navigate(`/institution/certificates/${cert.certificate_id}`)}
            className="font-mono text-xs text-slate-500 underline-offset-4 hover:text-congo-blue hover:underline"
          >
            Back to Certificate Detail
          </button>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Pre-anchor panel — the value the registrar is about to commit to.   */
/* Per the spec, fetched from cert.pending_hash — never computed here.  */
/* ------------------------------------------------------------------ */

function PreAnchorPanel({ cert }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-100 bg-paper-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-100 px-6 py-4">
        <span className="material-symbols-outlined text-state-grace">fingerprint</span>
        <h2 className="font-sans text-lg font-bold text-seal-black">
          Pre-Anchor Hash
        </h2>
        <span className="ml-auto rounded-full border border-state-grace/30 bg-state-grace/10 px-3 py-1 font-mono text-xs font-bold text-state-grace">
          Pending
        </span>
      </header>

      <div className="space-y-4 p-6">
        <p className="font-sans text-sm text-slate-500">
          This is the exact value that will be permanently sealed to the
          registry when you anchor this certificate. After anchoring, any
          change to the underlying record will not change this hash.
        </p>

        <div className="space-y-1">
          <div className="font-mono text-xs font-bold text-slate-500">
            Certificate identifier
          </div>
          <div className="break-all rounded border border-slate-100 bg-slate-100 px-3 py-2 font-mono text-sm text-seal-black">
            {cert.certificate_id}
          </div>
        </div>

        <div className="space-y-1">
          <div className="font-mono text-xs font-bold text-slate-500">
            Content hash (will be anchored)
          </div>
          <CopyableHash value={cert.pending_hash ?? '— pending_hash not provided —'} />
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Action panels — connect / sign / pending / error                    */
/* ------------------------------------------------------------------ */

function ConnectPanel({ onConnect }) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-xl border border-slate-100 bg-paper-white p-6 shadow-sm">
      <div>
        <h3 className="font-sans text-base font-bold text-seal-black">
          Connect MetaMask to continue
        </h3>
        <p className="mt-1 font-sans text-sm text-slate-500">
          Anchoring signs a transaction with your institution's MetaMask
          account. No password or seed phrase is sent to ACVS.
        </p>
      </div>
      <button
        type="button"
        onClick={onConnect}
        className="inline-flex items-center gap-2 rounded bg-congo-blue px-6 py-3 font-sans text-base font-bold text-paper-white shadow-sm transition-colors hover:bg-congo-blue/90"
      >
        <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
        Connect MetaMask
      </button>
    </section>
  )
}

function SignPanel({ address, error, onSign, onReconnect, onRetryRecord }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-paper-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs font-bold text-slate-500">
          Connected account
        </span>
        <code className="break-all rounded bg-slate-100 px-2 py-1 font-mono text-xs text-seal-black">
          {address ?? '—'}
        </code>
        <button
          type="button"
          onClick={onReconnect}
          className="ml-auto font-mono text-xs text-slate-500 underline-offset-4 hover:text-congo-blue hover:underline"
        >
          Use a different account
        </button>
      </div>

      {error ? <ErrorPanel error={error} onRetry={onRetryRecord ?? onSign} /> : null}

      <button
        type="button"
        onClick={onSign}
        className="inline-flex items-center justify-center gap-2 rounded bg-congo-blue px-6 py-3 font-sans text-base font-bold text-paper-white shadow-sm transition-colors hover:bg-congo-blue/90"
      >
        <span className="material-symbols-outlined text-[20px] fill">gpp_maybe</span>
        {error && onRetryRecord ? 'Retry Recording Anchor' : 'Sign & Anchor with MetaMask'}
      </button>
      <p className="font-mono text-xs text-slate-500">
        MetaMask will ask you to sign a transaction. Confirm there; this page
        will wait for the on-chain receipt.
      </p>
    </section>
  )
}

function PendingPanel({ label, sublabel }) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="flex items-center gap-4 rounded-xl border border-slate-100 bg-paper-white p-6 shadow-sm"
    >
      <span
        className="material-symbols-outlined animate-spin text-congo-blue"
        style={{ fontSize: 32, fontVariationSettings: "'FILL' 0" }}
      >
        progress_activity
      </span>
      <div>
        <div className="font-sans text-base font-bold text-seal-black">
          {label}
        </div>
        <div className="font-mono text-xs text-slate-500">{sublabel}</div>
      </div>
    </section>
  )
}

function ErrorPanel({ error, onRetry }) {
  const tone = errorTone(error.kind)
  return (
    <section
      role="alert"
      className={`flex flex-col gap-3 rounded-xl border p-4 ${tone.box}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`material-symbols-outlined mt-0.5 ${tone.icon}`}
          style={{ fontSize: 24 }}
        >
          {tone.iconName}
        </span>
        <div className="flex-1">
          <div className={`font-sans text-sm font-bold ${tone.title}`}>
            {tone.titleText}
          </div>
          <div className="mt-1 font-sans text-sm text-slate-500">
            {error.message}
          </div>
          {error.kind === 'hash_mismatch' ? (
            <p className="mt-2 font-mono text-xs text-slate-500">
              Refresh the certificate detail page and start over — the value
              you saw earlier no longer matches what's on-chain.
            </p>
          ) : null}
          {error.kind === 'not_grace_period' ? (
            <p className="mt-2 font-mono text-xs text-slate-500">
              Another registrar may have already anchored this certificate.
              Refresh to see its current state.
            </p>
          ) : null}
        </div>
      </div>
      {error.canRetry ? (
        onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex w-fit items-center gap-2 rounded bg-seal-black px-4 py-2 font-sans text-sm font-bold text-paper-white transition-colors hover:bg-slate-500"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Try again
          </button>
        ) : null
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Header pieces                                                        */
/* ------------------------------------------------------------------ */

function BackLink() {
  return (
    <Link
      to="/institution/certificates"
      className="inline-flex w-fit items-center gap-1 font-mono text-xs text-slate-500 hover:text-congo-blue"
    >
      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
      Back to Registers
    </Link>
  )
}

function LoadingPanel() {
  return (
    <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-100 bg-paper-white p-12 text-slate-500 shadow-sm">
      <span
        className="material-symbols-outlined animate-spin text-congo-blue"
        style={{ fontSize: 28, fontVariationSettings: "'FILL' 0" }}
      >
        progress_activity
      </span>
      <span className="font-sans text-sm">Loading certificate…</span>
    </div>
  )
}

function NotFoundPanel({ certificateId }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-xl border border-slate-100 bg-paper-white p-12 text-center shadow-sm">
      <span
        className="material-symbols-outlined fill text-state-not-found"
        style={{ fontSize: 40 }}
      >
        search_off
      </span>
      <h2 className="font-sans text-lg font-bold text-seal-black">
        Certificate not found
      </h2>
      <p className="max-w-md font-sans text-sm text-slate-500">
        No certificate with ID{' '}
        <span className="break-all font-mono text-seal-black">{certificateId}</span>{' '}
        was found. It may have been deleted or never existed.
      </p>
    </section>
  )
}

function LoadErrorPanel({ message }) {
  return (
    <section
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-state-disabled/30 bg-state-disabled/5 p-12 text-center"
    >
      <span
        className="material-symbols-outlined fill text-state-disabled"
        style={{ fontSize: 40 }}
      >
        error
      </span>
      <h2 className="font-sans text-lg font-bold text-seal-black">
        Could not load certificate
      </h2>
      <p className="max-w-md font-sans text-sm text-slate-500">{message}</p>
    </section>
  )
}

function NonGracePeriodPanel({ cert }) {
  const label =
    cert.status === LIST_STATES.ANCHORED
      ? 'Anchored'
      : cert.status === LIST_STATES.DISABLED
        ? 'Disabled'
        : cert.status
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border border-slate-100 bg-paper-white p-12 text-center shadow-sm">
      <span
        className="material-symbols-outlined text-slate-500"
        style={{ fontSize: 40 }}
      >
        lock
      </span>
      <h2 className="font-sans text-lg font-bold text-seal-black">
        This certificate is already {label.toLowerCase()}
      </h2>
      <p className="max-w-md font-sans text-sm text-slate-500">
        Anchoring is only available during Grace Period. Refresh the detail
        page to see its current state.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Small reusable bits                                                  */
/* ------------------------------------------------------------------ */

function CopyableHash({ value }) {
  const [copied, setCopied] = useState(false)
  function onCopy() {
    if (!navigator.clipboard?.writeText) return
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="group flex items-center justify-between gap-2 break-all rounded border border-state-grace/30 bg-state-grace/5 p-3 font-mono text-sm text-seal-black">
      <span className="select-all">{value}</span>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy hash"
        className="shrink-0 text-slate-500 opacity-0 transition-opacity hover:text-congo-blue group-hover:opacity-100"
      >
        <span className="material-symbols-outlined text-[16px]">
          {copied ? 'check' : 'content_copy'}
        </span>
      </button>
    </div>
  )
}

function DataBlock({ label, value }) {
  const [copied, setCopied] = useState(false)
  function onCopy() {
    if (!navigator.clipboard?.writeText) return
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="space-y-1">
      <div className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="group flex items-center justify-between gap-2 break-all rounded border border-slate-100 bg-slate-100 p-3 font-mono text-xs text-seal-black">
        <span className="select-all">{value || '—'}</span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy ${label}`}
          className="shrink-0 text-slate-500 opacity-0 transition-opacity hover:text-congo-blue group-hover:opacity-100"
        >
          <span className="material-symbols-outlined text-[16px]">
            {copied ? 'check' : 'content_copy'}
          </span>
        </button>
      </div>
    </div>
  )
}

// The backend's CertificateReadSerializer stores chain_hash as the
// unprefixed 64-hex form to match its max_length=64. We display it
// with the 0x prefix because that's the conventional Ethereum-hash
// shape — auditors are used to seeing the prefix.
function formatChainHash(chainHash) {
  if (!chainHash) return ''
  if (chainHash.startsWith('0x')) return chainHash
  return `0x${chainHash}`
}

/* ------------------------------------------------------------------ */
/* Error tone map — every error kind gets its own box + icon + title.   */
/* All messaging is concrete (no generic "something went wrong"); the    */
/* backend already tells us which field rejected the request, and we    */
/* surface that verbatim.                                              */
/* ------------------------------------------------------------------ */

function errorTone(kind) {
  switch (kind) {
    case 'user_rejected':
      return {
        box: 'border-slate-100 bg-slate-100',
        icon: 'text-slate-500',
        iconName: 'do_not_disturb_on',
        title: 'text-slate-500',
        titleText: 'Cancelled',
      }
    case 'reverted':
      return {
        box: 'border-state-disabled/30 bg-state-disabled/5',
        icon: 'text-state-disabled',
        iconName: 'error',
        title: 'text-state-disabled',
        titleText: 'Contract rejected the transaction',
      }
    case 'rpc_failed':
      return {
        box: 'border-state-disabled/30 bg-state-disabled/5',
        icon: 'text-state-disabled',
        iconName: 'cloud_off',
        title: 'text-state-disabled',
        titleText: 'Could not reach the blockchain',
      }
    case 'not_installed':
      return {
        box: 'border-state-disabled/30 bg-state-disabled/5',
        icon: 'text-state-disabled',
        iconName: 'extension_off',
        title: 'text-state-disabled',
        titleText: 'MetaMask not installed',
      }
    case 'chain_not_anchored':
      return {
        box: 'border-state-grace/30 bg-state-grace/10',
        icon: 'text-state-grace',
        iconName: 'hourglass_top',
        title: 'text-state-grace',
        titleText: 'Chain has not yet recorded the anchor',
      }
    case 'hash_mismatch':
      return {
        box: 'border-state-disabled/30 bg-state-disabled/5',
        icon: 'text-state-disabled',
        iconName: 'priority_high',
        title: 'text-state-disabled',
        titleText: 'Content hash mismatch',
      }
    case 'not_grace_period':
      return {
        box: 'border-state-disabled/30 bg-state-disabled/5',
        icon: 'text-state-disabled',
        iconName: 'lock',
        title: 'text-state-disabled',
        titleText: 'Certificate no longer in Grace Period',
      }
    case 'misconfigured':
      return {
        box: 'border-state-disabled/30 bg-state-disabled/5',
        icon: 'text-state-disabled',
        iconName: 'build',
        title: 'text-state-disabled',
        titleText: 'Configuration error',
      }
    default:
      return {
        box: 'border-state-disabled/30 bg-state-disabled/5',
        icon: 'text-state-disabled',
        iconName: 'error',
        title: 'text-state-disabled',
        titleText: 'Could not complete the anchor',
      }
  }
}
