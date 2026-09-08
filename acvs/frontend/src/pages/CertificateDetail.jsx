// Single-certificate view. Mirrors /design/screens/certificate_detail_grace_period/code.html:
//   - back-link + display title + certificate ID chip + Anchor Now CTA
//   - lifecycle stepper showing where this one record sits on the pipeline
//     (the list view has no stepper — it's only meaningful here, per DESIGN.md §4A)
//   - editable fields with the persistent "Editable until grace period ends" note
//     beneath each one (DESIGN.md §5 — registration/correction forms)
//   - pre-anchor hash preview (DESIGN.md §5 — the Anchoring Confirmation motif
//     gets a "seal" treatment later; here we just show the placeholder that
//     would be hashed at anchor time)
//
// This file renders ONLY the grace_period branch. The anchored / disabled
// branches are a separate task — same route, different render. For now,
// non-grace_period certs render a clear "not editable here" state instead of
// pretending to be one of the other branches.
//
// Data fetch: GET /api/certificates/ — there's no dedicated detail endpoint,
// so we walk pages of the list to find the row by certificate_id (see
// ../api/getCertificate.js for the honest trade-off this implies).

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppShell from '../components/AppShell.jsx'
import DisableCertificateModal from '../components/DisableCertificateModal.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { getCertificate } from '../api/getCertificate.js'
import { useAuth } from '../useAuth.js'
import LIST_STATES from '../listStates.js'
import VERIFY_STATES from '../verifyStates.js'
import { updateCertificate} from '../api/updateCertificate.js'

// A placeholder SHA-256-shaped hex string. The real pre-anchor hash will be
// computed at anchor time from the final immutable fields; this stub makes
// the layout feel honest (64 hex chars) without faking a value that's
// actually verifiable.
const PLACEHOLDER_PRE_ANCHOR_HASH =
  '— pre-anchor hash will be computed at sealing time —'

export default function CertificateDetail() {
  const { id: certificateId } = useParams()
  const { accessToken, user } = useAuth()
  const navigate = useNavigate()

  const [state, setState] = useState({ kind: 'loading' })
  // 'loading' | {kind:'found', cert} | {kind:'not_found'} | {kind:'error', message}

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setState({ kind: 'loading' })
    getCertificate({ accessToken, certificateId })
      .then(({ cert, notFound }) => {
        if (cancelled) return
        if (notFound) {
          setState({ kind: 'not_found' })
        } else {
          setState({ kind: 'found', cert })
        }
      })
      .catch((err) => {
        if (cancelled) return
        setState({ kind: 'error', message: err.message ?? 'Could not load certificate.' })
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, certificateId])

  // Need to know the institution name to render the form field. We get it
  // from auth state — same source CertificateList uses, so the value is
  // guaranteed consistent across screens.
  const institutionName = user?.institution_name ?? ''

  // On a successful disable, the modal returns the freshly-serialized
  // cert (status=disabled). We patch it directly into local state so the
  // page re-renders in the disabled branch without a refetch round-trip —
  // we already have authoritative data in hand.
  function onDisabled(updatedCert) {
    setState({ kind: 'found', cert: updatedCert })
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <ContextHeader certificateId={certificateId} cert={state.cert} navigate={navigate} />

        {state.kind === 'loading' ? (
          <LoadingPanel />
        ) : state.kind === 'not_found' ? (
          <NotFoundPanel certificateId={certificateId} />
        ) : state.kind === 'error' ? (
          <ErrorPanel message={state.message} />
        ) : state.cert.status === LIST_STATES.GRACE_PERIOD ? (
          <GracePeriodView cert={state.cert} institutionName={institutionName} />
        ) : state.cert.status === LIST_STATES.ANCHORED ? (
          <AnchoredView
            cert={state.cert}
            institutionName={institutionName}
            onDisabled={onDisabled}
          />
        ) : state.cert.status === LIST_STATES.DISABLED ? (
          <DisabledView cert={state.cert} institutionName={institutionName} />
        ) : (
          <UnsupportedStatePanel status={state.cert.status} />
        )}
      </div>
    </AppShell>
  )
}

/* ------------------------------------------------------------------ */
/* Header — back-link, title, ID chip, Anchor Now CTA                  */
/* ------------------------------------------------------------------ */

function ContextHeader({ certificateId, cert, navigate }) {
  // Anchor Now sends the registrar to the Anchoring Confirmation flow,
  // which handles MetaMask connect + signing + backend recording. Only
  // meaningful in grace_period — anchored/disabled rows get the lifecycle
  // status badge in this slot instead.
  function onAnchorNow() {
    navigate(`/institution/certificates/${certificateId}/anchor`)
  }

  const isGracePeriod = cert?.status === LIST_STATES.GRACE_PERIOD
  const isAnchored = cert?.status === LIST_STATES.ANCHORED
  const isDisabled = cert?.status === LIST_STATES.DISABLED

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Link
          to="/institution/certificates"
          className="inline-flex items-center gap-1 font-mono text-xs text-slate-500 hover:text-congo-blue"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Registers
        </Link>
        <h1 className="mt-3 font-sans text-2xl font-extrabold tracking-tight text-seal-black">
          Certificate Detail
        </h1>
        <div className="mt-2 inline-block rounded border border-slate-100 bg-slate-100 px-2 py-1 font-mono text-xs text-slate-500">
          ID: <span className="select-all text-seal-black">{certificateId}</span>
        </div>
      </div>

      {isGracePeriod ? (
        <button
          type="button"
          onClick={onAnchorNow}
          title="Anchor this certificate on-chain."
          className="inline-flex items-center gap-2 rounded bg-congo-blue px-6 py-3 font-sans text-base font-bold text-paper-white shadow-sm transition-colors hover:bg-congo-blue/90"
        >
          <span
            className="material-symbols-outlined fill"
            style={{ fontSize: 20 }}
          >
            
          </span>
          Anchor Now
        </button>
      ) : isAnchored ? (
        // The status badge IS the header's right-side primary element on
        // anchored rows. The Disable action lives in the body panel where
        // it has room for its destructive-action treatment.
        <StatusBadge state={VERIFY_STATES.VALID} variant="anchored" />
      ) : isDisabled ? (
        // Disabled rows get the red DISABLED badge in the header slot —
        // mirrors the anchored badge placement so the lifecycle state is
        // legible at the top of the page. Body content is a stripped-down
        // read-only view with no further actions.
        <StatusBadge state={VERIFY_STATES.DISABLED} />
      ) : (
        // Unknown / unexpected status: render nothing on the right.
        null
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Grace-period render path                                            */
/* ------------------------------------------------------------------ */
function GracePeriodView({ cert, institutionName, certificateId }) {
  const { accessToken } = useAuth()

  // 1. Ingestion de student_name et cohort_number dans le state du formulaire
  const [form, setForm] = useState({
    certificate_id: cert?.certificate_id ?? certificateId ?? '',
    student_name: cert?.student?.full_name ?? '',
    cohort_number: cert?.cohort_number ?? '',
    degree: cert?.degree ?? '',
    program: cert?.program ?? '',
    issued_date: cert?.issued_date ?? '',
  })

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (saveSuccess) setSaveSuccess(false)
  }

  function handleCancel() {
    setForm({
      certificate_id: cert?.certificate_id ?? certificateId ?? '',
      student_name: cert?.student?.full_name ?? '',
      cohort_number: cert?.cohort_number ?? '',
      degree: cert?.degree ?? '',
      program: cert?.program ?? '',
      issued_date: cert?.issued_date ?? '',
    })
    setSaveError(null)
    setSaveSuccess(false)
  }

  
async function handleSaveDraft() {
  setSaving(true)
  setSaveError(null)
  setSaveSuccess(false)

  // 1. Récupération robuste de l'identifiant certificate_id
  let rawId = cert?.certificate_id || certificateId || cert?.id

  // Nettoyage au cas où un slash / s'est glissé au début ou à la fin
  const targetCertificateId = String(rawId || '').replace(/^\/+|\/+$/g, '')

  //  Vérification avant d'envoyer la requête
  if (!targetCertificateId || targetCertificateId === 'undefined') {
    console.error("Identifiant introuvable. Contenu complet de cert:", cert)
    setSaveError("Impossible de trouver l'identifiant du certificat (certificate_id).")
    setSaving(false)
    return
  }

  // 2. Payload complet avec les 5 champs acceptés par votre Serializer
  const payload = {
    certificate_id: form.certificate_id,
    student_name: form.student_name,
    cohort_number: form.cohort_number,
    degree: form.degree,
    program: form.program,
    issued_date: form.issued_date,
  }

  // Construction propre de l'endpoint
  const endpoint = `/api/certificates/${targetCertificateId}/`
  console.log("Requête PATCH sent vers :", endpoint)
  console.log("Payload sent :", payload)

  try {
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    const rawText = await response.text()
    let responseData = {}
    try {
      responseData = rawText ? JSON.parse(rawText) : {}
    } catch {
      responseData = { raw: rawText }
    }

    if (!response.ok) {
      console.error("error from Django's server :", response.status, responseData)
      const errorMsg = responseData.detail 
        || (typeof responseData === 'object' && Object.keys(responseData).length > 0 ? JSON.stringify(responseData) : null)
        || `HTTP server error ${response.status}`
      throw new Error(errorMsg)
    }

    // Récupération de la nouvelle pending_hash si recalculée
    if (responseData.pending_hash) {
      cert.pending_hash = responseData.pending_hash
    }

    setSaveSuccess(true)
  } catch (err) {
    console.error('Update error:', err)
    setSaveError(err.message || 'Erreur lors de la sauvegarde.')
  } finally {
    setSaving(false)
  }
}


  return (
    <>
      <LifecycleStepper state={LIST_STATES.GRACE_PERIOD} />

      <section className="overflow-hidden rounded-xl border border-slate-100 bg-paper-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-100 px-6 py-4">
          <span className="material-symbols-outlined text-slate-500">edit_document</span>
          <h2 className="font-sans text-lg font-bold text-seal-black">
            Holder Information
          </h2>
        </header>

        {saveError && (
          <div className="mx-6 mt-4 rounded border border-red-200 bg-red-50 p-3 font-mono text-xs text-red-600">
             {saveError}
          </div>
        )}
        {saveSuccess && (
          <div className="mx-6 mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 font-mono text-xs text-emerald-700">
            ✓ Draft saved successfully! Pre-anchor hash recalculated.
          </div>
        )}

        <form
          onSubmit={(e) => e.preventDefault()}
          className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2"
        >
          {/*  ÉDITABLE : Certificate ID / Number */}
          <Field
            id="certificate_id"
            label="Certificate Number / ID"
            value={form.certificate_id}
            onChange={(v) => update('certificate_id', v)}
            placeholder="e.g., DRC-2023-JAPRGNBC"
            className="md:col-span-2"
          />
          
          {/*  ÉDITABLE : Student Full Name */}
          <Field
            id="student_name"
            label="Full Name"
            value={form.student_name}
            onChange={(v) => update('student_name', v)}
            placeholder="Nom complet de l'étudiant"
          />

          {/*  ÉDITABLE : Cohort Number */}
          <Field
            id="cohort_number"
            label="Cohort Number"
            value={form.cohort_number}
            onChange={(v) => update('cohort_number', v)}
            placeholder="Numéro de cohorte"
          />

          {/* VERROUILLÉ : Institution (Seule l'institution reste locked) */}
          <Field
            id="institution"
            label="Establishment"
            value={institutionName}
            onChange={() => {}}
            locked
            lockReason="Locked — tied to issuing institution"
            className="md:col-span-2"
          />

          {/*  ÉDITABLE : Degree */}
          <Field
            id="degree"
            label="Degree / Title"
            value={form.degree}
            onChange={(v) => update('degree', v)}
            placeholder="Licence, Master, …"
          />

          {/*  ÉDITABLE : Program */}
          <Field
            id="program"
            label="Field / Program"
            value={form.program}
            onChange={(v) => update('program', v)}
            placeholder="Filière"
          />

          {/*  ÉDITABLE : Issued Date */}
          <Field
            id="issued_date"
            label="Issued Date"
            type="date"
            value={form.issued_date}
            onChange={(v) => update('issued_date', v)}
          />
        </form>

        <footer className="flex justify-end gap-4 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="rounded border border-seal-black px-6 py-2 font-sans text-base font-bold text-seal-black transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel Changes
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded bg-seal-black px-6 py-2 font-sans text-base font-bold text-paper-white transition-colors hover:bg-slate-500 disabled:opacity-50"
          >
            {saving && (
              <span className="material-symbols-outlined animate-spin text-[18px]">
                progress_activity
              </span>
            )}
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
        </footer>
      </section>

      <PreAnchorHashPanel pendingHash={cert?.pending_hash} />
      <CertificateQRCode certificateId={cert.certificate_id} />
    </>
  )
}


function CertificateQRCode({ certificateId }) {
  const qrUrl = `/api/certificates/${certificateId}/qr/`

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-100 bg-paper-white p-6 shadow-sm">
      <h3 className="font-sans text-base font-bold text-seal-black">
        QR Code de Vérification (Django)
      </h3>

      {/* Image chargée directement depuis le backend Django */}
      <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-inner">
        <img
          src={qrUrl}
          alt={`QR Code ${certificateId}`}
          className="h-44 w-44 object-contain"
        />
      </div>

      <a
        href={qrUrl}
        download={`QR_${certificateId}.png`}
        className="inline-flex items-center gap-2 rounded border border-seal-black px-4 py-2 font-sans text-xs font-bold text-seal-black transition-colors hover:bg-slate-100"
      >
        <span className="material-symbols-outlined text-sm">download</span>
        Télécharger le QR Code
      </a>
    </div>
  )
}






/* ------------------------------------------------------------------ */
/* Anchored render path — same route, branch on cert.status === 'anchored'
/* All fields are read-only (immutable on-chain). The "seal moment" itself  */
/* lived on AnchoringConfirmation; here we present the same anchored      */
/* state with restraint per DESIGN.md §1 — the ceremony happens once.    */
/* ------------------------------------------------------------------ */
function AnchoredView({ cert, institutionName, onDisabled }) {
  // The destructive "Disable this certificate" action lives in this
  // body panel. Clicking the trigger swaps the modal in. We don't keep
  // an `open` default of true — the action is rare enough that an
  // accidental open isn't a real risk, and starting closed makes the
  // canonical "view the anchored record" path the screen's primary one.
  const [modalOpen, setModalOpen] = useState(false)

  // Called by the modal after a successful POST. The parent updates its
  // cert state — `state.cert.status` flips to 'disabled' — and the
  // routed view re-renders as <DisabledView />. The modal then unmounts.
  function handleDisabled(updatedCert) {
    setModalOpen(false)
    onDisabled(updatedCert)
  }

  return (
    <>
      <LifecycleStepper state={LIST_STATES.ANCHORED} />

      <section className="overflow-hidden rounded-xl border border-slate-100 bg-paper-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-100 px-6 py-4">
          <span className="material-symbols-outlined text-slate-500">contact_page</span>
          <h2 className="font-sans text-lg font-bold text-seal-black">
            Holder Information
          </h2>
          <span className="ml-auto font-mono text-xs italic text-slate-500">
            Immutable — anchored on-chain
          </span>
        </header>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-6 md:grid-cols-2">
          <ReadOnlyField label="Full Name" value={cert.student?.full_name} />
          <ReadOnlyField label="Cohort Number" value={cert.cohort_number} />
          <ReadOnlyField
            label="Establishment"
            value={institutionName}
            className="md:col-span-2"
          />
          <ReadOnlyField label="Degree / Title" value={cert.degree} />
          <ReadOnlyField label="Field / Program" value={cert.program} />
          <ReadOnlyField
            label="Issued Date"
            value={formatIssuedDate(cert.issued_date)}
          />
        </dl>
      </section>

      <ChainAnchorPanel cert={cert} />

      {/* CORRECT : Accolades sans guillemets */}
      <CertificateQRCode certificateId={cert.certificate_id} />

      <section className="flex flex-col items-start gap-3 rounded-xl border border-state-disabled/30 bg-state-disabled/5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-lg">
          <h3 className="font-sans text-base font-bold text-seal-black">
            Disable this certificate
          </h3>
          <p className="mt-1 font-sans text-sm text-slate-500">
            Disabling marks the certificate as no longer valid. The record
            stays visible and the on-chain hash remains the source of truth.
            This action is permanent and requires a second confirmation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex shrink-0 items-center gap-2 rounded border-2 border-state-disabled px-6 py-3 font-sans text-base font-bold text-state-disabled transition-colors hover:bg-state-disabled hover:text-paper-white"
        >
          <span className="material-symbols-outlined text-[20px]">block</span>
          Disable Certificate
        </button>
      </section>

      {modalOpen ? (
        <DisableCertificateModal
          certificateId={cert.certificate_id}
          onClose={() => setModalOpen(false)}
          onSuccess={handleDisabled}
        />
      ) : null}
    </>
  )
}
/* ------------------------------------------------------------------ */
/* Disabled render path — reached after the modal calls back with the  */
/* updated cert. Mirrors the anchored view's read-only fields, but the */
/* stepper shows the "Anchored" history with a disabled-stamp sidebar   */
/* element, the chain anchor panel is still visible (proof of original */
/* seal), and there are NO further actions — disable is one-way.       */
/* ------------------------------------------------------------------ */

function DisabledView({ cert, institutionName }) {
  return (
    <>
      <LifecycleStepper state={LIST_STATES.ANCHORED} />

      <section className="overflow-hidden rounded-xl border border-slate-100 bg-paper-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-100 px-6 py-4">
          <span className="material-symbols-outlined text-slate-500">contact_page</span>
          <h2 className="font-sans text-lg font-bold text-seal-black">
            Holder Information
          </h2>
          <span className="ml-auto font-mono text-xs italic text-slate-500">
            Disabled — no longer valid for verification
          </span>
        </header>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-6 md:grid-cols-2">
          <ReadOnlyField label="Full Name" value={cert.student?.full_name} />
          <ReadOnlyField label="Cohort Number" value={cert.cohort_number} />
          <ReadOnlyField
            label="Establishment"
            value={institutionName}
            className="md:col-span-2"
          />
          <ReadOnlyField label="Degree / Title" value={cert.degree} />
          <ReadOnlyField label="Field / Program" value={cert.program} />
          <ReadOnlyField
            label="Issued Date"
            value={formatIssuedDate(cert.issued_date)}
          />
        </dl>
      </section>

      <ChainAnchorPanel cert={cert} />

      {/* Disabled-state callout — DESIGN.md §0: "if an institution
          needs to invalidate it, the record isn't deleted — it is
          marked Disabled, and that mark is itself permanent and
          visible." Same shape as the anchor confirmation's success
          banner, but in the state's own red tone. The third-party
          verify endpoint reads status=disabled and renders
          PublicVerify's disabled view (see api/verify.js). */}
      <section className="flex items-start gap-4 rounded-xl border border-state-disabled/30 bg-state-disabled/5 p-6">
        <span
          aria-hidden="true"
          className="material-symbols-outlined fill mt-0.5 text-state-disabled"
          style={{ fontSize: 28 }}
        >
          block
        </span>
        <div>
          <h3 className="font-sans text-base font-bold text-state-disabled">
            This certificate has been disabled
          </h3>
          <p className="mt-1 font-sans text-sm text-seal-black">
            Third-party verifiers will be told this record is no longer valid.
            The on-chain hash above remains the original seal — the original
            issuance is preserved, only its validity has been revoked.
          </p>
          <p className="mt-3 font-sans text-xs italic text-slate-500">
            Disable is permanent. There is no re-enable action; a new
            certificate record would be required.
          </p>
        </div>
      </section>
      <CertificateQRCode certificateId={cert.certificate_id} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Read-only label + value row (anchored branch). Mirrors the grace-   */
/* period Field shape but renders a <dl> instead of an editable input.  */
/* ------------------------------------------------------------------ */

function ReadOnlyField({ label, value, className = '' }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <dt className="font-mono text-sm font-bold text-slate-500">{label}</dt>
      <dd
        className={[
          'break-words rounded border border-slate-100 bg-slate-100 p-2 font-mono text-sm',
          empty ? 'italic text-slate-500' : 'text-seal-black',
        ].join(' ')}
      >
        {empty ? '—' : String(value)}
      </dd>
    </div>
  )
}

// issued_date comes back from the API as an ISO date string ("YYYY-MM-DD");
// render it verbatim — no timezone drama since there's no time component.
function formatIssuedDate(iso) {
  if (!iso) return null
  return iso
}

/* ------------------------------------------------------------------ */
/* Chain anchor panel — the value the registry stores for this record. */
/* Full monospace per DESIGN.md §5 (never truncate an ID/hash).        */
/* ------------------------------------------------------------------ */

function ChainAnchorPanel({ cert }) {
  const [copied, setCopied] = useState(false)
  const chainHash = formatChainHash(cert.chain_hash)
  // tx_hash is 0x-prefixed 66-char audit field — small line, not a copy
  // target for end users, but kept visible for parity with the seal
  // moment view in AnchoringConfirmation.
  const txHash = cert.tx_hash || ''

  function onCopy() {
    if (!navigator.clipboard?.writeText || !chainHash) return
    navigator.clipboard.writeText(chainHash).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <section className="overflow-hidden rounded-xl border border-state-anchored/20 bg-state-anchored/5">
      <header className="flex items-center gap-2 border-b border-state-anchored/20 bg-state-anchored/10 px-6 py-4">
        <span className="material-symbols-outlined text-state-anchored">verified</span>
        <h2 className="font-sans text-lg font-bold text-seal-black">
          On-Chain Anchor
        </h2>
        <span className="ml-auto rounded-full border border-state-anchored/30 bg-paper-white px-3 py-1 font-mono text-xs font-bold text-state-anchored">
          Sealed
        </span>
      </header>

      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <div className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">
            Blockchain hash anchor
          </div>
          <div className="group flex items-start justify-between gap-2 break-all rounded border border-state-anchored/20 bg-paper-white p-3 font-mono text-xs text-seal-black">
            <span className="select-all">{chainHash || '— chain_hash unavailable —'}</span>
            <button
              type="button"
              onClick={onCopy}
              aria-label="Copy chain hash"
              className="shrink-0 text-slate-500 opacity-0 transition-opacity hover:text-congo-blue group-hover:opacity-100"
            >
              <span className="material-symbols-outlined text-[16px]">
                {copied ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
        </div>

        {txHash ? (
          <div className="space-y-1">
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">
              Anchor transaction (audit)
            </div>
            <div className="break-all rounded border border-slate-100 bg-paper-white p-3 font-mono text-xs text-slate-500">
              {txHash}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

// The backend's CertificateReadSerializer stores chain_hash as the
// unprefixed 64-hex form to match its max_length=64. Display with the
// 0x prefix because that's the conventional Ethereum-hash shape —
// auditors and verifiers expect to see it.
function formatChainHash(chainHash) {
  if (!chainHash) return ''
  if (chainHash.startsWith('0x')) return chainHash
  return `0x${chainHash}`
}

/* ------------------------------------------------------------------ */
/* Lifecycle stepper (DESIGN.md §4A — one record, one pipeline slot)   */
/* ------------------------------------------------------------------ */

function LifecycleStepper({ state }) {
  // Three lifecycle steps. For any view of a record, exactly one node is
  // "current" (the cert's current state), the rest are either past or
  // future. Past and current both render as SOLID filled circles (so the
  // track line doesn't show through); future renders as an outlined
  // gray circle. The difference between past and current is the glyph
  // and the optional "Status: …" banner above the current node — not
  // the fill color, which would make the line bleed through the current
  // node's interior as a visual artifact.

  const steps = [
    { key: 'registered', label: 'Registered', icon: 'check' },
    { key: 'grace_period', label: 'Grace Period', icon: 'dot', pastIcon: 'edit_note' },
    { key: 'anchored', label: 'Anchored', icon: 'lock' },
  ]

  const activeIndex = state === LIST_STATES.ANCHORED ? 2 : 1
  // Progress bar fills halfway for grace_period, all the way for anchored.
  const progress = activeIndex === 2 ? 'w-full' : 'w-1/2'

  return (
    <section className="rounded-xl border border-slate-100 bg-paper-white px-6 pb-10 pt-12 shadow-sm">
      <div className="relative flex items-center justify-between">
        {/* base track — full width, rounded. Solid color under the
            filled track gives the line a continuous rounded edge
            regardless of how far the progress bar has filled. */}
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded bg-slate-100" />
        {/* filled track — same shape, just clipped by width. */}
        <div
          className={`absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded bg-congo-yellow transition-all ${progress}`}
        />
        {steps.map((step, i) => (
          <Step key={step.key} step={step} index={i} activeIndex={activeIndex} />
        ))}
      </div>
    </section>
  )
}

function Step({ step, index, activeIndex }) {
  const isPast = index < activeIndex
  const isActive = index === activeIndex

  // Past + Active both render as solid yellow filled circles. The base
  // `ring-4 ring-paper-white` keeps a white halo between the track
  // line and the circle edge — visually masking the line as it passes
  // under each node so neither state reads as "bleed-through."
  //
  // Future nodes render as outlined circles (white fill, slate border,
  // slate icon). The white halo still applies.
  //
  // Tailwind rings are a single `--tw-ring-shadow` slot — only ONE
  // `ring-*` utility per element, so the halo lives in the base
  // string and is never redeclared in the state branch.
  const circleClass = [
    'relative flex h-10 w-10 items-center justify-center rounded-full shadow-sm ring-4 ring-paper-white',
    isPast || isActive
      ? 'bg-congo-yellow text-seal-black'
      : 'bg-paper-white text-slate-500 border border-slate-200',
  ].join(' ')

  const labelClass = [
    'absolute top-full mt-3 left-1/2 -translate-x-1/2 font-mono text-xs whitespace-nowrap',
    isPast || isActive ? 'font-bold text-seal-black' : 'text-slate-500',
  ].join(' ')

  // Pick the right glyph for the past step. When grace_period is past
  // (anchored view), the literal sentinel 'dot' would render as broken-
  // glyph text — use pastIcon instead.
  const glyph = isPast && step.pastIcon ? step.pastIcon : step.icon

  return (
    <div className="relative">
      {/* Active step's "Status: …" banner — only meaningful above the
          grace-period active node today; the slot stays in case future
          branches add their own banner (e.g. "Anchored — immutable"). */}
      {isActive && index === 1 ? (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-state-grace/30 bg-state-grace/10 px-3 py-1 font-mono text-xs font-bold text-state-grace shadow-sm">
          Status: Grace Period (Editable)
        </div>
      ) : null}

      <div className={circleClass}>
        {isActive && step.icon === 'dot' ? (
          // Active grace-period: animated pulsing dot on the solid yellow
          // background — no glyph needed; the dot IS the indicator.
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-state-grace" />
        ) : (
          <span
            className={[
              'material-symbols-outlined text-[20px]',
              isActive ? 'fill' : '',
            ].join(' ')}
          >
            {glyph}
          </span>
        )}
      </div>

      <span className={labelClass}>{step.label}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Editable field (the per-field "Editable until grace period ends"    */
/* note that DESIGN.md §5 mandates beneath every grace-period field)    */
/* ------------------------------------------------------------------ */

function Field({ 
  id, 
  label, 
  value, 
  onChange, 
  type = 'text', 
  placeholder, 
  locked = false, 
  lockReason = 'Locked — tied to the issuing institution',
  className = '' 
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="font-mono text-sm font-bold text-seal-black">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={locked}
        className={[
          'rounded border border-slate-100 bg-paper-white p-2 font-mono text-sm text-seal-black transition-shadow',
          'focus:border-congo-blue focus:outline-none focus:ring-2 focus:ring-congo-blue/40',
          locked ? 'cursor-not-allowed bg-slate-100 text-slate-500' : '',
        ].join(' ')}
      />
      <span className="font-mono text-xs italic text-slate-500">
        {locked ? lockReason : 'Editable until grace period ends'}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pre-anchor hash preview.                                            */
/* The backend computes the content hash on each PATCH and returns it   */
/* as `pending_hash` on grace-period certs — the registrar sees the     */
/* exact value that will be sealed before they navigate to anchor.     */
/* When the field is missing for any reason (the backend is technically */
/* allowed to omit it) we fall back to the honest placeholder so the    */
/* layout still reads as "this is the draft, not yet a real hash."     */
/* ------------------------------------------------------------------ */

function PreAnchorHashPanel({ pendingHash }) {
  const [copied, setCopied] = useState(false)
  const display = pendingHash || PLACEHOLDER_PRE_ANCHOR_HASH
  const isReal = Boolean(pendingHash)

  function onCopy() {
    if (!navigator.clipboard?.writeText) return
    navigator.clipboard.writeText(display).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <section className="flex items-start gap-4 rounded-xl border border-slate-100 bg-slate-100 p-6">
      <span className="material-symbols-outlined mt-1 text-slate-500">fingerprint</span>
      <div className="flex-1">
        <div className="mb-1 font-mono text-xs font-bold text-slate-500">
          Pre-Anchor Hash {isReal ? '(Live Draft)' : '(Pending)'}
        </div>
        <div className="group flex items-center justify-between gap-2 break-all rounded border border-slate-100 bg-paper-white p-3 font-mono text-sm text-seal-black">
          <span className="select-all">{display}</span>
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
        <p className="mt-2 font-mono text-xs text-slate-500">
          {isReal
            ? 'This is the exact value that will be sealed when you anchor. Editing the record above will recalculate this hash.'
            : 'This hash will be recalculated at anchor time if any field is modified.'}
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* State panels — loading / not-found / error / unsupported-status     */
/* ------------------------------------------------------------------ */

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
        was found in your institution's records. Check the ID for typos or
        return to the register to find the right entry.
      </p>
      <Link
        to="/institution/certificates"
        className="mt-2 inline-flex items-center gap-2 rounded bg-congo-blue px-4 py-2 font-sans text-sm font-bold text-paper-white hover:bg-congo-blue/90"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        Back to Registers
      </Link>
    </section>
  )
}

function ErrorPanel({ message }) {
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

function UnsupportedStatePanel({ status }) {
  // Anchored and Disabled render paths are intentionally out of scope for
  // this prompt. Surface that honestly instead of silently rendering the
  // grace_period form against a non-editable record.
  const label = status === LIST_STATES.ANCHORED ? 'Anchored' : status === LIST_STATES.DISABLED ? 'Disabled' : status
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border border-slate-100 bg-paper-white p-12 text-center shadow-sm">
      <span
        className="material-symbols-outlined text-slate-500"
        style={{ fontSize: 40 }}
      >
        pending
      </span>
      <h2 className="font-sans text-lg font-bold text-seal-black">
        {label} certificates have a different view
      </h2>
      <p className="max-w-md font-sans text-sm text-slate-500">
        This detail page currently renders the Grace Period branch only.
        The {label} branch will be added in a follow-up.
      </p>
    </section>
  )
}





