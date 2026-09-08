// Registrar-side certificate list. Mirrors /design/screens/certificate_list/code.html:
//   - header with page title and intro line
//   - status filter dropdown (wired to the backend's ?status= filter)
//   - data table: Status | Certificate ID | Student Name | Institution | Issued Date
//   - pagination footer

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../components/AppShell.jsx'
import { listCertificates } from '../api/listCertificates.js'
import LIST_STATES, { LIST_STATE_OPTIONS } from '../listStates.js'
import { useAuth } from '../useAuth.js'

const PAGE_SIZE = 25
const BACKEND_STATUS_KEYS = new Set([
  LIST_STATES.GRACE_PERIOD,
  LIST_STATES.ANCHORED,
  LIST_STATES.DISABLED,
])

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function formatDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return '—'
  return DATE_FORMATTER.format(new Date(y, m - 1, d))
}

export default function CertificateList() {
  const { accessToken, user } = useAuth()

  const [statusFilter, setStatusFilter] = useState(LIST_STATES.ALL)
  const [page, setPage] = useState(1)
  const [rawResponse, setRawResponse] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)

  // Téléchargement du PDF officiel généré par le serveur Python
  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true)
      const response = await fetch('/api/certificates/print/', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })
      if (!response.ok) throw new Error("Erreur lors de la génération du PDF.")
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'certificates_report.pdf'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
    } catch (err) {
      console.error(err)
      alert("Impossible de télécharger le rapport PDF.")
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setError(null)
    listCertificates({
      accessToken,
      status: BACKEND_STATUS_KEYS.has(statusFilter) ? statusFilter : undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return
        setRawResponse(res)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message ?? 'Could not load certificates.')
        setRawResponse(null)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, statusFilter, page])

  const certificateRows = useMemo(() => {
    if (!rawResponse) return []
    if (Array.isArray(rawResponse)) return rawResponse
    if (Array.isArray(rawResponse.results)) return rawResponse.results
    return []
  }, [rawResponse])

  const totalCount = useMemo(() => {
    if (!rawResponse) return 0
    if (typeof rawResponse.count === 'number') return rawResponse.count
    return certificateRows.length
  }, [rawResponse, certificateRows])

  function onStatusChange(next) {
    setStatusFilter(next)
    setPage(1)
  }

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  }, [totalCount])

  const range = useMemo(() => {
    if (!certificateRows.length) return { from: 0, to: 0 }
    const from = (page - 1) * PAGE_SIZE + 1
    const to = Math.min(from + certificateRows.length - 1, totalCount)
    return { from, to }
  }, [certificateRows, page, totalCount])

  const institutionName = user?.institution_name ?? ''

  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
              Register
            </p>
            <h1 className="mt-2 font-sans text-2xl font-extrabold tracking-tight text-seal-black">
              Certificates
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Management and tracking of the complete history of degree awards.
              Use the filters to refine your search.
            </p>
          </div>

          <div className="flex w-full gap-2 sm:w-auto">
            <FilterSelect
              icon="filter_list"
              value={statusFilter}
              onChange={onStatusChange}
              options={LIST_STATE_OPTIONS}
              ariaLabel="Filter by status"
            />
            <button
              type="button"
              disabled={isDownloadingPdf}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 rounded bg-congo-blue px-4 py-2 font-sans text-sm font-bold text-paper-white hover:bg-congo-blue/90 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">
                {isDownloadingPdf ? 'progress_activity' : 'picture_as_pdf'}
              </span>
              {isDownloadingPdf ? 'Génération...' : 'Download PDF'}
            </button>
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-100 bg-paper-white shadow-sm">
          {error ? (
            <ErrorState message={error} />
          ) : loading && !rawResponse ? (
            <LoadingState />
          ) : certificateRows.length ? (
            <ResultsTable
              rows={certificateRows}
              institutionName={institutionName}
            />
          ) : (
            <EmptyState />
          )}

          <PaginationFooter
            range={range}
            total={totalCount}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </section>

        <p className="text-center font-mono text-xs text-slate-500">
          Need to register a new cohort?{' '}
          <Link
            to="/institution/certificates/new"
            className="text-congo-blue hover:underline"
          >
            New Cohort
          </Link>
        </p>
      </div>
    </AppShell>
  )
}

function ResultsTable({ rows, institutionName }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px] border-collapse text-left">
        <thead className="border-b border-slate-100 bg-slate-100">
          <tr>
            <Th className="w-40">Status</Th>
            <Th>Certificate ID</Th>
            <Th>Student Name</Th>
            <Th>Institution</Th>
            <Th className="text-right">Issued Date</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <Row
              key={row.certificate_id ?? row.id ?? i}
              row={row}
              institutionName={institutionName}
              zebra={i % 2 === 1}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ row, institutionName, zebra }) {
  const status = row.status
  const isDisabled = status === LIST_STATES.DISABLED
  const isGrace = status === LIST_STATES.GRACE_PERIOD

  const rowClass = [
    'transition-colors',
    isDisabled
      ? 'bg-slate-100/40 text-seal-black/70'
      : isGrace
        ? 'bg-slate-100 shadow-sm hover:bg-slate-100'
        : 'bg-paper-white hover:bg-slate-100/60',
    zebra && !isDisabled && !isGrace ? 'bg-slate-100/30' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const displayInstitution = 
    (typeof row.institution === 'object' && row.institution !== null ? (row.institution.name || row.institution.institution_name) : null) ||
    row.institution_name ||
    institutionName ||
    (typeof row.institution === 'number' ? `Institution #${row.institution}` : '—')

  return (
    <tr className={rowClass}>
      <td className="p-4 align-top">
        <StatusBadge state={status} />
      </td>
      <td className="p-4 align-top">
        <CertificateIdCell id={row.certificate_id} disabled={isDisabled} />
      </td>
      <td
        className={[
          'p-4 align-top font-semibold text-seal-black',
          isDisabled ? 'opacity-70' : '',
        ].join(' ')}
      >
        {row.student?.full_name ?? '—'}
      </td>
      <td
        className={[
          'p-4 align-top text-slate-500',
          isDisabled ? 'opacity-70' : '',
        ].join(' ')}
      >
        {displayInstitution}
      </td>
      <td
        className={[
          'p-4 align-top text-right whitespace-nowrap text-slate-500',
          isDisabled ? 'opacity-70' : '',
        ].join(' ')}
      >
        {formatDate(row.issued_date)}
      </td>
    </tr>
  )
}

function Th({ children, className = '' }) {
  return (
    <th
      className={[
        'p-4 font-sans text-xs font-bold uppercase tracking-wider text-slate-500',
        className,
      ].join(' ')}
    >
      {children}
    </th>
  )
}

function StatusBadge({ state }) {
  const TONE = {
    [LIST_STATES.GRACE_PERIOD]: {
      label: 'Grace Period',
      text: 'text-state-grace',
      bg: 'bg-state-grace/10',
      border: 'border-state-grace/20',
      dot: 'bg-state-grace',
    },
    [LIST_STATES.ANCHORED]: {
      label: 'Anchored',
      text: 'text-state-anchored',
      bg: 'bg-state-anchored/10',
      border: 'border-state-anchored/20',
      dot: 'bg-state-anchored',
    },
    [LIST_STATES.DISABLED]: {
      label: 'Disabled',
      text: 'text-paper-white',
      bg: 'bg-state-disabled',
      border: 'border-transparent',
      dot: 'bg-paper-white',
      uppercase: true,
    },
  }
  const tone = TONE[state]
  if (!tone) return null
  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-medium tracking-wide',
        tone.bg,
        tone.text,
        tone.border,
        tone.uppercase ? 'uppercase font-bold' : '',
      ].join(' ')}
    >
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
      {tone.label}
    </span>
  )
}

function CertificateIdCell({ id, disabled }) {
  const [copied, setCopied] = useState(false)

  function onCopy(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!id) return
    if (!navigator.clipboard?.writeText) return
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (!id) {
    return <span className="font-mono text-sm text-slate-500">—</span>
  }

  return (
    <Link
      to={`/institution/certificates/${encodeURIComponent(id)}`}
      className={[
        'inline-flex items-center gap-2 rounded border border-slate-100 bg-slate-100 px-3 py-1.5 font-mono text-sm text-seal-black transition-colors hover:border-congo-blue/40',
        disabled ? 'line-through opacity-70' : '',
      ].join(' ')}
    >
      {id}
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copier l'identifiant"
        className="text-slate-500 transition-colors hover:text-congo-blue"
      >
        <span className="material-symbols-outlined text-[16px]">
          {copied ? 'check' : 'content_copy'}
        </span>
      </button>
    </Link>
  )
}

function FilterSelect({ icon, value, onChange, options, ariaLabel }) {
  return (
    <div className="relative flex-1 sm:flex-none">
      <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
        {icon}
      </span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded border border-slate-100 bg-paper-white py-2 pl-10 pr-4 font-sans text-sm text-seal-black focus:border-congo-blue focus:outline-none focus:ring-2 focus:ring-congo-blue/40 sm:w-48"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function PaginationFooter({ range, total, page, totalPages, onPageChange }) {
  const hasPrev = page > 1
  const hasNext = page < totalPages
  const label = total
    ? `Showing ${range.from}–${range.to} of ${total} results`
    : 'No results'

  const pages = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const start = Math.max(1, Math.min(page - 2, totalPages - 4))
    return Array.from({ length: 5 }, (_, i) => start + i)
  }, [page, totalPages])

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="font-sans text-sm text-slate-500">{label}</span>
      <div className="flex gap-2">
        <PageButton disabled={!hasPrev} onClick={() => onPageChange(page - 1)}>
          <span className="material-symbols-outlined">chevron_left</span>
        </PageButton>
        {pages.map((n) => (
          <PageButton
            key={n}
            active={n === page}
            onClick={() => onPageChange(n)}
          >
            {n}
          </PageButton>
        ))}
        <PageButton disabled={!hasNext} onClick={() => onPageChange(page + 1)}>
          <span className="material-symbols-outlined">chevron_right</span>
        </PageButton>
      </div>
    </div>
  )
}

function PageButton({ children, active = false, disabled = false, onClick }) {
  const className = [
    'flex h-10 w-10 items-center justify-center rounded border font-bold transition-colors',
    active
      ? 'border-congo-blue bg-congo-blue text-paper-white'
      : 'border-slate-100 bg-paper-white text-seal-black hover:bg-slate-100',
    disabled
      ? 'cursor-not-allowed text-slate-500/60 hover:bg-paper-white'
      : '',
  ].join(' ')
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      className={className}
    >
      {children}
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 p-12 text-center">
      <span
        className="material-symbols-outlined text-slate-500"
        style={{ fontSize: 40, fontVariationSettings: "'FILL' 0" }}
      >
        inventory_2
      </span>
      <h3 className="font-sans text-base font-semibold text-seal-black">
        No certificates yet
      </h3>
      <p className="max-w-sm font-sans text-sm text-slate-500">
        Certificates you register will appear here. Start by creating a new
        cohort.
      </p>
      <Link
        to="/institution/certificates/new"
        className="mt-2 inline-flex items-center gap-2 rounded bg-congo-blue px-4 py-2 font-sans text-sm font-bold text-paper-white hover:bg-congo-blue/90"
      >
        <span className="material-symbols-outlined text-base">add</span>
        New Cohort
      </Link>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-3 p-12 text-slate-500">
      <span
        className="material-symbols-outlined animate-spin text-congo-blue"
        style={{ fontSize: 28, fontVariationSettings: "'FILL' 0" }}
      >
        progress_activity
      </span>
      <span className="font-sans text-sm">Loading certificates…</span>
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 p-12 text-center"
    >
      <span
        className="material-symbols-outlined fill text-state-disabled"
        style={{ fontSize: 40 }}
      >
        error
      </span>
      <h3 className="font-sans text-base font-semibold text-seal-black">
        Could not load certificates
      </h3>
      <p className="max-w-sm font-sans text-sm text-slate-500">{message}</p>
    </div>
  )
}