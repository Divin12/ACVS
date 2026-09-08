import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StatusBadge from '../components/StatusBadge.jsx'
import TricolorStrip from '../components/TricolorStrip.jsx'
import { verifyCertificate, VERIFY_STATES } from '../api/verify.js'
import jsQR from 'jsqr'

/* ------------------------------------------------------------------ */
/* Header — present, but light. Design.md §4B says the public screen    */
/* should not be wrapped in dashboard chrome.                          */
/* ------------------------------------------------------------------ */

function PageHeader() {
  return (
    <header className="w-full max-w-[1280px] mx-auto px-6 md:px-12 h-20 flex justify-between items-center border-b border-slate-100 sticky top-0 z-50 bg-paper-white">
      <div className="flex items-center gap-4">
        <img
          src="/logo.png"
          alt="République Démocratique du Congo - Ministère de l'Éducation Nationale"
          className="h-14 w-auto object-contain"
        />
        <TricolorStrip orientation="vertical" />
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

function PageFooter() {
  return (
    <footer className="w-full max-w-[1280px] mx-auto px-6 md:px-12 py-6 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-500 text-xs">
      <div className="text-center md:text-left">
        © {new Date().getFullYear()} République Démocratique du Congo - Ministère de
        l'Education Nationale et Nouvelle Citoyenneté
      </div>
      <div className="flex gap-6">
        <a href="#" className="hover:text-congo-blue">Privacy Policy</a>
        <a href="#" className="hover:text-congo-blue">Terms of Service</a>
        <a href="#" className="hover:text-congo-blue">Technical Support</a>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ */
/* Landing pane — input ID + QR Code image scan option                 */
/* ------------------------------------------------------------------ */

function LandingPane() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [scanError, setScanError] = useState(null)

  function onSubmit(e) {
    e.preventDefault()
    const id = value.trim()
    if (!id) return
    navigate(`/verify/${encodeURIComponent(id)}`)
  }

 
  // Lecture du QR Code 100% compatible via canvas + jsQR
  function handleQrImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setScanError(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        // Création d'un canvas temporaire en mémoire pour extraire les pixels
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        canvas.width = img.width
        canvas.height = img.height

        context.drawImage(img, 0, 0, img.width, img.height)
        const imageData = context.getImageData(0, 0, img.width, img.height)

        // Décodage du QR Code avec jsQR
        const code = jsQR(imageData.data, imageData.width, imageData.height)

        if (code && code.data) {
          // Extrait l'ID du certificat depuis le texte ou l'URL du QR Code
          const rawValue = code.data
          const extractedId = rawValue.split('/').filter(Boolean).pop()
          navigate(`/verify/${encodeURIComponent(extractedId)}`)
        } else {
          setScanError("Impossible de détecter un QR Code valide sur cette image.")
        }
      }
      img.src = event.target.result
    }

    reader.readAsDataURL(file)
  }


  return (
    <main className="flex-1 w-full max-w-[1280px] mx-auto px-6 md:px-12 py-12 md:py-24 flex justify-center">
      <div className="w-full max-w-[480px] flex flex-col items-center text-center">
        <div className="mb-6 relative">
          <div className="absolute inset-0 bg-congo-blue/5 rounded-full blur-xl scale-150" />
          <div className="relative w-20 h-20 rounded-full bg-paper-white border border-slate-100 flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined fill text-congo-blue text-[40px]">
              verified
            </span>
          </div>
        </div>

        <h1 className="font-sans text-2xl font-extrabold tracking-tight text-seal-black mb-4 max-w-[560px] leading-tight">
          Verify any DRC academic certificate in seconds
        </h1>
        <p className="text-base text-slate-500 max-w-[480px] mb-8 leading-relaxed">
          Instant, secure, government-backed. Access official academic records
          authenticated by the Ministère de l'Éducation Nationale.
        </p>

        <form
          onSubmit={onSubmit}
          className="w-full max-w-[480px] bg-paper-white border border-slate-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow text-left relative overflow-hidden mb-4"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-congo-blue" />

          <label
            htmlFor="certificate-id"
            className="font-mono text-sm text-slate-500 mb-2 block"
          >
            Enter Certificate ID (N° de Diplôme)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="certificate-id"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. DRC-2024-ABC89X"
              autoFocus
              className="flex-1 bg-paper-white border border-slate-100 rounded p-4 font-mono text-base text-seal-black focus:outline-none focus:border-congo-blue focus:ring-1 focus:ring-congo-blue placeholder:text-slate-500/40"
            />
            <button
              type="submit"
              className="bg-congo-blue text-paper-white font-mono text-sm font-bold px-6 py-4 rounded hover:bg-congo-blue/90 transition-colors shadow-sm flex items-center justify-center gap-2 min-h-[56px]"
            >
              <span className="material-symbols-outlined text-[20px]">search</span>
              Verify
            </button>
          </div>

          {/* Option de numérisation d'image QR Code */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <label className="flex items-center justify-center gap-2 cursor-pointer rounded-lg border-2 border-dashed border-slate-200 p-3 text-slate-600 hover:border-congo-blue hover:text-congo-blue transition-colors">
              <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
              <span className="font-sans text-xs font-semibold">Import or Scan QR Code</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleQrImageUpload}
                className="hidden"
              />
            </label>
          </div>

          {scanError && (
            <p className="mt-2 text-xs text-congo-red font-medium text-center">{scanError}</p>
          )}

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">shield</span>
              <span>Secure official lookup</span>
            </div>
            <a href="#" className="text-congo-blue hover:underline">
              How to find your ID
            </a>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap justify-center gap-6 text-slate-500 text-sm">
          <div className="flex items-center gap-2 font-mono">
            <span className="material-symbols-outlined text-[18px]">gavel</span>
            Legally Binding
          </div>
          <div className="flex items-center gap-2 font-mono">
            <span className="material-symbols-outlined text-[18px]">history</span>
            Immutable Records
          </div>
          <div className="flex items-center gap-2 font-mono">
            <span className="material-symbols-outlined text-[18px]">public</span>
            Globally Accessible
          </div>
        </div>
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ */
/* Result card                                                        */
/* ------------------------------------------------------------------ */

function ResultCard({ state, certificate, searchedId, onReset }) {
  return (
    <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 py-12 flex flex-col items-center">
      <div className="w-full max-w-[480px] bg-paper-white border border-slate-100 shadow-sm relative overflow-hidden rounded-xl">
        <TricolorStrip />
        <div className="p-6 pt-12 flex flex-col items-center">
          {state === VERIFY_STATES.VALID && (
            <ValidBody certificate={certificate} searchedId={searchedId} />
          )}
          {state === VERIFY_STATES.DISABLED && (
            <DisabledBody certificate={certificate} />
          )}
          {state === VERIFY_STATES.NOT_FOUND && (
            <NotFoundBody searchedId={searchedId} />
          )}

          <button
            onClick={onReset}
            className="w-full mt-6 py-4 px-6 bg-congo-blue text-paper-white font-sans text-base font-semibold rounded-lg hover:bg-congo-blue/90 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <span className="material-symbols-outlined text-[20px]">search</span>
            Verify Another Certificate
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-slate-500 text-xs max-w-[480px]">
        © {new Date().getFullYear()} République Démocratique du Congo
        <br />
        Ministère de l'Education Nationale et Nouvelle Citoyenneté
      </p>
    </main>
  )
}

function ValidBody({ certificate, searchedId }) {
  const issued = certificate?.issued_date
    ? new Date(certificate.issued_date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—'

  const isGracePeriod =
    certificate?.chain_state === 'not_yet_anchored' ||
    certificate?.status === 'grace_period'

  const certId = certificate?.certificate_id || searchedId
  const qrUrl = `/api/certificates/${certId}/qr/`

  return (
    <>
      <div className="mb-6 w-24 h-24 rounded-full border border-slate-100 p-2 flex items-center justify-center bg-paper-white">
        <img
          src="/logo.png"
          alt="Ministry seal"
          className="w-full h-full object-contain opacity-80"
        />
      </div>

      <StatusBadge
        state={VERIFY_STATES.VALID}
        variant={isGracePeriod ? 'registered' : 'anchored'}
      />

      {isGracePeriod ? (
        <>
          <h1 className="font-sans text-xl font-semibold text-seal-black text-center mt-6 mb-2">
            Registered — Pending Anchor
          </h1>
          <p className="text-base text-slate-500 text-center mb-6 leading-relaxed">
            This certificate is on record with the issuing institution and is
            currently in its grace period before being permanently sealed.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-sans text-xl font-semibold text-seal-black text-center mt-6 mb-2">
            Valid Certificate
          </h1>
          <p className="text-base text-slate-500 text-center mb-6 leading-relaxed">
            This record has been permanently anchored to the official registry.
          </p>
        </>
      )}

      <div className="w-full border-t border-slate-100 pt-6 flex flex-col gap-4 mb-6">
        <DataRow label="Holder Name" value={certificate?.student} bold />
        <DataRow label="Institution" value={certificate?.institution} />
        <DataRow label="Program" value={certificate?.program} />
        <DataRow label="Date of Issue" value={issued} />
      </div>

      {/* Bloc QR Code généré par Django */}
      <div className="w-full bg-slate-50 border border-slate-100 rounded-lg p-4 flex flex-col items-center gap-3 mb-6">
        <span className="text-xs text-slate-500 uppercase font-mono tracking-wider">
          Official Verification QR Code
        </span>
        <div className="bg-white p-2 rounded border border-slate-200 shadow-inner">
          <img
            src={qrUrl}
            alt={`QR Code ${certId}`}
            className="w-36 h-36 object-contain"
          />
        </div>
        <a
          href={qrUrl}
          download={`QR_${certId}.png`}
          className="text-xs font-mono font-bold text-congo-blue hover:underline flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">download</span>
          Download Official QR Code
        </a>
      </div>

      {certificate?.chain_hash && <HashBlock hash={certificate.chain_hash} />}
    </>
  )
}

function DisabledBody({ certificate }) {
  return (
    <>
      <span
        className="material-symbols-outlined text-slate-500 mb-2"
        style={{ fontSize: 40, fontVariationSettings: "'FILL' 0" }}
      >
        policy
      </span>
      <h1 className="font-sans text-xl font-semibold text-seal-black tracking-tight">
        ACVS DRC
      </h1>
      <p className="font-mono text-xs text-slate-500 mt-1 uppercase tracking-widest text-center">
        Ministère de l'Éducation Nationale
      </p>

      <div className="pt-6 flex justify-center">
        <StatusBadge state={VERIFY_STATES.DISABLED} />
      </div>

      <div className="p-6 w-full">
        <div className="relative bg-slate-100 rounded-lg p-6 border border-slate-100 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none">
            <span
              className="material-symbols-outlined fill"
              style={{ fontSize: 120 }}
            >
              block
            </span>
          </div>
          <div className="grid grid-cols-1 gap-6 relative z-10">
            <DataRow
              label="Holder Name"
              value={certificate?.student}
              strike
            />
            <DataRow
              label="Institution"
              value={certificate?.institution}
              strike
            />
            <DataRow
              label="Program"
              value={certificate?.program}
              strike
            />
            <DataRow
              label="Date of Issuance"
              value={
                certificate?.issued_date
                  ? new Date(certificate.issued_date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })
                  : '—'
              }
              strike
            />
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 w-full">
        <div className="bg-congo-red/10 border border-congo-red/20 p-4 rounded-lg flex items-start gap-4">
          <span className="material-symbols-outlined fill text-congo-red mt-0.5">
            warning
          </span>
          <p className="text-base text-state-disabled font-medium leading-tight">
            This certificate has been revoked by the issuing institution and is
            no longer valid.
          </p>
        </div>
      </div>
    </>
  )
}

function NotFoundBody({ searchedId }) {
  return (
    <>
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-6 border border-slate-100">
        <span
          className="material-symbols-outlined text-slate-500"
          style={{ fontSize: 32, fontVariationSettings: "'FILL' 0" }}
        >
          search_off
        </span>
      </div>

      <StatusBadge state={VERIFY_STATES.NOT_FOUND} />

      <h1 className="font-sans text-xl font-semibold text-seal-black mb-4 mt-6 text-center">
        Record Not Found
      </h1>
      <p className="text-base text-slate-500 mb-12 max-w-[320px] text-center leading-relaxed">
        No certificate matches this ID. Please check the identifier carefully
        and try again. Ensure there are no typographical errors.
      </p>

      <div className="w-full bg-slate-100 border border-slate-100 rounded-lg p-4 flex flex-col items-center gap-2 mb-12">
        <span className="text-xs text-slate-500 uppercase tracking-wider">
          Searched Identifier
        </span>
        <span className="font-mono text-sm text-seal-black text-center break-all">
          {searchedId}
        </span>
      </div>

      <a href="#" className="text-congo-blue text-base hover:underline">
        Need help? Contact support
      </a>
    </>
  )
}

function DataRow({ label, value, bold = false, strike = false }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </span>
      <span
        className={[
          'text-base text-seal-black',
          bold ? 'font-bold' : '',
          strike ? 'line-through decoration-congo-red decoration-2 opacity-75' : '',
        ].join(' ')}
      >
        {value ?? '—'}
      </span>
    </div>
  )
}

function HashBlock({ hash }) {
  const [copied, setCopied] = useState(false)
  function onCopy() {
    navigator.clipboard?.writeText(hash).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="w-full bg-slate-100 p-4 rounded border border-slate-100">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-slate-500 uppercase tracking-wider">
          Blockchain Hash
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy hash"
          className="text-slate-500 hover:text-congo-blue transition-colors flex items-center justify-center p-1 rounded hover:bg-slate-100"
        >
          <span className="material-symbols-outlined text-[16px]">
            {copied ? 'check' : 'content_copy'}
          </span>
        </button>
      </div>
      <div className="font-mono text-sm text-seal-black break-all leading-tight">
        {hash}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page root                                                          */
/* ------------------------------------------------------------------ */

export default function PublicVerify() {
  const { certificateId } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState(null)
  const [certificate, setCertificate] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!certificateId) return
    let cancelled = false
    verifyCertificate(certificateId)
      .then((res) => {
        if (cancelled) return
        setState(res.state)
        setCertificate(res.certificate ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message ?? 'Verification failed')
      })
    return () => {
      cancelled = true
    }
  }, [certificateId])

  function reset() {
    navigate('/verify')
  }

  return (
    <div className="min-h-svh flex flex-col bg-paper-white">
      <PageHeader />

      {!certificateId && <LandingPane />}

      {certificateId && error && (
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 py-12 flex flex-col items-center">
          <div className="w-full max-w-[480px] bg-paper-white border border-slate-100 shadow-sm rounded-xl p-12 text-center">
            <span
              className="material-symbols-outlined text-state-disabled"
              style={{ fontSize: 40 }}
            >
              error
            </span>
            <h1 className="font-sans text-xl font-semibold text-seal-black mt-4 mb-2">
              Verification Unavailable
            </h1>
            <p className="text-base text-slate-500">{error}</p>
            <button
              onClick={reset}
              className="mt-6 py-4 px-6 bg-congo-blue text-paper-white font-sans text-base font-semibold rounded-lg"
            >
              Try Again
            </button>
          </div>
        </main>
      )}

      {certificateId && !error && state && (
        <ResultCard
          state={state}
          certificate={certificate}
          searchedId={certificateId}
          onReset={reset}
        />
      )}

      {certificateId && !error && !state && <LoadingPane />}

      <PageFooter />
    </div>
  )
}

function LoadingPane() {
  return (
    <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 py-12 flex flex-col items-center justify-center">
      <div className="w-full max-w-[480px] bg-paper-white border border-slate-100 shadow-sm rounded-xl p-12 text-center">
        <span
          className="material-symbols-outlined text-congo-blue animate-spin"
          style={{ fontSize: 40, fontVariationSettings: "'FILL' 0" }}
        >
          progress_activity
        </span>
        <p className="mt-4 text-slate-500">Verifying certificate…</p>
      </div>
    </main>
  )
}