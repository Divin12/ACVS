// Cohort bulk registration.
// Mirrors /design/screens/bulk_cohort_registration/code.html:
//   - context header (congo-blue tinted) with title and intro
//   - "Numéro de Cohorte" sticky header input
//   - spreadsheet table with # | Serial Number | Nom | Diplôme | Filière | Date d'Émission | Actions
//   - "Ajouter une ligne" / Annuler / Register Cohort footer
//
// Backend contract (backend/certificates/serializers.py:BulkCreateItemSerializer):
// each row carries `certificate_id`, `student_name` (string), `cohort_number`, `degree`, `program`,
// `issued_date`. The backend creates the Student via get_or_create scoped to
// the registrar's institution; we don't need (and shouldn't send) a student PK.

import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import AppShell from '../components/AppShell.jsx'
import { bulkCreate } from '../api/bulkCreate.js'
import { useAuth } from '../useAuth.js'

const todayIso = () => new Date().toISOString().slice(0, 10)

function emptyRow() {
  return {
    certificate_id: '',
    student_name: '',
    degree: '',
    program: '',
    issued_date: todayIso(),
  }
}

const SEED_ROWS = [
  {
    certificate_id: 'DRC-2024-UNIKIN-0001',
    student_name: 'Jean-Pierre Kabila',
    degree: 'Licence',
    program: 'Sciences Informatiques',
    issued_date: '2024-05-15',
  },
  {
    certificate_id: 'DRC-2024-UNIKIN-0002',
    student_name: 'Marie-Claire Tshisekedi',
    degree: 'Master',
    program: 'Génie Civil',
    issued_date: '2024-05-16',
  },
]

export default function BulkRegister() {
  const { accessToken, userStatus } = useAuth()
  const [cohortName, setCohortName] = useState('Cohorte 1')
  // The backend pins every row to a single cohort_number — we extract it from
  // the cohort name ("Cohorte 1" → 1). Falls back to null when unparseable.
  const cohortNumber = parseCohortNumber(cohortName)
  const [rows, setRows] = useState(SEED_ROWS)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null) // {ok: true, items} | {ok: false, error, fieldErrors}

  if (userStatus === 'idle') {
    return <Navigate to="/institution/login" replace />
  }

  function updateRow(index, field, value) {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  function removeRow(index) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function reset() {
    setRows(SEED_ROWS)
    setCohortName('Cohorte 1')
    setResult(null)
  }

  async function onSubmit(e) {
    e.preventDefault()
    setResult(null)

    if (rows.length === 0) {
      setResult({ ok: false, error: 'Add at least one row before submitting.' })
      return
    }

    // Client-side guard for missing certificate IDs
    const missingCertId = rows.some((r) => !r.certificate_id || !r.certificate_id.trim())
    if (missingCertId) {
      setResult({
        ok: false,
        error: 'Every row must have an official Certificate ID / Serial Number.',
      })
      return
    }

    if (!cohortNumber) {
      setResult({
        ok: false,
        error:
          'Could not derive cohort_number from the cohort name. Try "Cohorte 1", "Cohorte 2", …',
      })
      return
    }

    // Map the spreadsheet row onto BulkCreateItemSerializer fields.
    const items = rows.map((r) => ({
      certificate_id: r.certificate_id.trim(),
      student_name: r.student_name,
      cohort_number: cohortNumber,
      degree: r.degree,
      program: r.program,
      issued_date: r.issued_date,
    }))

    setSubmitting(true)
    try {
      const created = await bulkCreate({ accessToken, items })
      setResult({ ok: true, items: created })
    } catch (err) {
      setResult({
        ok: false,
        error: err.message ?? 'Bulk registration failed.',
        fieldErrors: extractFieldErrors(err.body),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell>
      <form onSubmit={onSubmit} className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex items-center gap-6 rounded-xl bg-congo-blue p-6 text-paper-white">
          <img
            src="/logo.png"
            alt="Logo Ministère"
            className="h-24 w-24 shrink-0 object-contain"
          />
          <div>
            <h2 className="font-sans text-2xl font-bold leading-tight">
              Register New Certificates
            </h2>
            <p className="mt-1 font-sans text-sm text-congo-yellow/80">
              Secure entry of academic data prior to sealing.
            </p>
          </div>
        </header>

        <section className="rounded-xl border border-slate-100 bg-paper-white p-6">
          <label
            htmlFor="cohortName"
            className="mb-2 block font-sans text-base font-bold text-seal-black"
          >
            Cohort Number
          </label>
          <input
            id="cohortName"
            type="text"
            value={cohortName}
            onChange={(e) => setCohortName(e.target.value)}
            className="w-full max-w-xs rounded border border-slate-100 bg-paper-white p-3 font-mono text-sm text-seal-black transition-shadow focus:border-congo-blue focus:outline-none focus:ring-2 focus:ring-congo-blue/40"
          />
          <p className="mt-2 font-mono text-xs text-slate-500">
            cohort_number derived: <strong>{cohortNumber ?? '—'}</strong>
          </p>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-100 bg-paper-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-slate-100 bg-slate-100">
                <tr>
                  <Th className="w-12">#</Th>
                  <Th className="w-48">Certificate ID / N° Série</Th>
                  <Th>Student Name</Th>
                  <Th>Degree/Title</Th>
                  <Th>Field/Program</Th>
                  <Th className="w-40">Issued Date</Th>
                  <Th className="w-16 text-center">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="transition-colors hover:bg-slate-100/50 even:bg-slate-100/20"
                  >
                    <td className="p-3 font-mono text-sm text-slate-500">
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <Td>
                      <CellInput
                        value={row.certificate_id}
                        onChange={(v) => updateRow(i, 'certificate_id', v)}
                        placeholder="N° de série (ex: DRC-001)"
                        isMono
                      />
                    </Td>
                    <Td>
                      <CellInput
                        value={row.student_name}
                        onChange={(v) => updateRow(i, 'student_name', v)}
                        placeholder="Nom complet"
                      />
                    </Td>
                    <Td>
                      <CellInput
                        value={row.degree}
                        onChange={(v) => updateRow(i, 'degree', v)}
                        placeholder="Licence, Master, …"
                      />
                    </Td>
                    <Td>
                      <CellInput
                        value={row.program}
                        onChange={(v) => updateRow(i, 'program', v)}
                        placeholder="Filière"
                      />
                    </Td>
                    <Td>
                      <input
                        type="date"
                        value={row.issued_date}
                        onChange={(e) => updateRow(i, 'issued_date', e.target.value)}
                        className="w-full rounded border-none bg-transparent p-2 font-mono text-sm text-seal-black focus:outline-none focus:ring-0"
                      />
                    </Td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        disabled={rows.length === 1}
                        aria-label={`Delete row ${i + 1}`}
                        className="rounded p-1 text-state-disabled transition-colors hover:bg-congo-red/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 bg-slate-100/30 p-4">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-2 rounded border border-slate-100 bg-paper-white px-4 py-2 font-sans text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Add a row
            </button>
          </div>
        </section>

        <p className="flex items-center gap-2 text-slate-500">
          <span
            className="material-symbols-outlined text-congo-blue"
            style={{ fontSize: 18 }}
          >
            info
          </span>
          <span className="font-sans text-xs">
            Changes allowed for 48 hours post-registration (Grace Period).
          </span>
        </p>

        {result?.ok ? (
          <SuccessPanel items={result.items} onDismiss={reset} />
        ) : null}
        {result && !result.ok ? (
          <ErrorPanel message={result.error} fieldErrors={result.fieldErrors} />
        ) : null}

        <footer className="flex justify-end gap-4 border-t border-slate-100 pt-6">
          <button
            type="button"
            onClick={reset}
            className="rounded border border-seal-black px-6 py-3 font-sans text-base font-bold text-seal-black transition-colors hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || userStatus !== 'authenticated'}
            className="flex items-center gap-2 rounded bg-congo-blue px-6 py-3 font-sans text-base font-bold text-paper-white transition-colors hover:bg-congo-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <span
                  className="material-symbols-outlined animate-spin text-base"
                  style={{ fontVariationSettings: "'FILL' 0" }}
                >
                  progress_activity
                </span>
                Submitting…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">
                  inventory_2
                </span>
                Register Cohort
              </>
            )}
          </button>
        </footer>

        <p className="text-center font-mono text-xs text-slate-500">
          Need to go back?{' '}
          <Link to="/institution/dashboard" className="text-congo-blue hover:underline">
            Dashboard
          </Link>
        </p>
      </form>
    </AppShell>
  )
}

function Th({ children, className = '' }) {
  return (
    <th
      className={`p-3 font-sans text-xs font-bold uppercase tracking-wider text-slate-500 ${className}`}
    >
      {children}
    </th>
  )
}

function Td({ children }) {
  return <td className="p-2">{children}</td>
}

function CellInput({ value, onChange, placeholder, isMono = false }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded border-none bg-transparent p-2 text-base text-seal-black focus:outline-none focus:ring-0 ${
        isMono ? 'font-mono text-sm' : 'font-sans'
      }`}
    />
  )
}

function SuccessPanel({ items, onDismiss }) {
  return (
    <section className="rounded-xl border border-state-anchored/30 bg-state-anchored/5 p-6">
      <div className="mb-4 flex items-center gap-3">
        <span
          className="material-symbols-outlined fill text-state-anchored"
          style={{ fontSize: 28 }}
        >
          check_circle
        </span>
        <div>
          <h3 className="font-sans text-lg font-bold text-seal-black">
            Cohort registered
          </h3>
          <p className="text-sm text-slate-500">
            {items.length} certificate{items.length === 1 ? '' : 's'} created.
          </p>
        </div>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1 font-mono text-sm text-seal-black">
          {items.slice(0, 10).map((c, i) => (
            <li key={c.certificate_id ?? c.id ?? i} className="break-all">
              {String(i + 1).padStart(2, '0')} —{' '}
              <strong>{c.certificate_id ?? c.id ?? '(no id returned)'}</strong>
              {c.student?.full_name ? ` · ${c.student.full_name}` : ''}
            </li>
          ))}
          {items.length > 10 ? (
            <li className="text-slate-500">…and {items.length - 10} more</li>
          ) : null}
        </ul>
      ) : null}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-slate-100 bg-paper-white px-4 py-2 font-sans text-sm font-bold text-seal-black hover:bg-slate-100"
        >
          Register another cohort
        </button>
      </div>
    </section>
  )
}

function ErrorPanel({ message, fieldErrors }) {
  return (
    <section
      role="alert"
      className="rounded-xl border border-congo-red/20 bg-congo-red/5 p-6"
    >
      <div className="mb-3 flex items-start gap-3">
        <span
          className="material-symbols-outlined fill text-state-disabled"
          style={{ fontSize: 28 }}
        >
          error
        </span>
        <div>
          <h3 className="font-sans text-base font-bold text-seal-black">
            Could not register cohort
          </h3>
          <p className="mt-1 text-sm text-state-disabled">{message}</p>
        </div>
      </div>
      {fieldErrors && Object.keys(fieldErrors).length > 0 ? (
        <ul className="ml-9 list-disc space-y-1 font-mono text-xs text-state-disabled">
          {Object.entries(fieldErrors).map(([field, msgs]) => (
            <li key={field}>
              <strong>{field}:</strong>{' '}
              {Array.isArray(msgs) ? msgs.join(', ') : String(msgs)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function parseCohortNumber(name) {
  if (!name) return null
  const match = /(\d+)/.exec(name)
  return match ? Number(match[1]) : null
}

function extractFieldErrors(body) {
  if (!body || typeof body !== 'object') return null
  const skip = new Set(['detail', 'message', 'status'])
  const out = {}
  for (const [key, val] of Object.entries(body)) {
    if (skip.has(key)) continue
    if (val && typeof val === 'object') {
      out[key] = Array.isArray(val)
        ? val.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
        : Object.entries(val).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    }
  }
  return Object.keys(out).length > 0 ? out : null
}