import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../useAuth.js'
import CreateInstitutionModal from '../components/CreateInstitutionModal.jsx'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export default function InstitutionManagement() {
  const { accessToken, logout } = useAuth()
  const navigate = useNavigate()

  const [institutions, setInstitutions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const currentDate = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC'

  const fetchInstitutions = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE}/api/admin/institutions/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch institutions (HTTP ${response.status})`)
      }

      const data = await response.json()
      setInstitutions(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (accessToken) {
      fetchInstitutions()
    }
  }, [accessToken])

  const filteredInstitutions = institutions.filter((inst) => {
    const query = searchQuery.toLowerCase()
    return (
      inst.name?.toLowerCase().includes(query) ||
      inst.code?.toLowerCase().includes(query) ||
      inst.contact_email?.toLowerCase().includes(query) ||
      inst.status?.toLowerCase().includes(query)
    )
  })

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 font-sans text-gray-600">
        <p className="text-sm font-medium">Loading Institutions...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
        <div className="max-w-md rounded-md border border-red-200 bg-red-50 p-6 text-red-700">
          <h3 className="text-base font-bold">Access Error</h3>
          <p className="mt-2 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#F4F5F7] font-sans text-gray-900">
      {/* SIDEBAR LEFT */}
      <aside className="flex w-64 flex-col justify-between border-r border-gray-200 bg-white p-6">
        <div>
          <div className="flex flex-col items-center border-b border-gray-100 pb-6 text-center">
            <img 
              src="/logo.png"
              alt="Ministry Seal" 
              className="h-20 w-20 object-contain"
            />
            <h1 className="text-lg font-extrabold tracking-tight text-gray-900">DRC Ministry</h1>
            <p className="text-xs font-medium text-gray-500">Éducation Nationale</p>
          </div>

          <nav className="mt-6 space-y-1">
            <Link
              to="/admin/dashboard"
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              <span className="material-symbols-outlined text-lg">grid_view</span>
              Overview
            </Link>

            <Link
              to="/admin/institutions"
              className="flex items-center gap-3 rounded-md bg-[#E8EFFE] px-3 py-2.5 text-sm font-semibold text-[#1A56DB]"
            >
              <span className="material-symbols-outlined text-lg">account_balance</span>
              Institutions
            </Link>

            <div
              className="flex cursor-not-allowed select-none items-center gap-3 rounded px-3 py-2.5 text-slate-400 opacity-50 pointer-events-none"
              aria-disabled="true"
            >
              <span className="material-symbols-outlined text-lg">verified</span>
              Registrations
            </div>

            <div
              className="flex cursor-not-allowed select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-gray-400 opacity-50 pointer-events-none"
              aria-disabled="true"
            >
              <span className="material-symbols-outlined text-lg">history</span>
              Activity Logs
            </div>
          </nav>
        </div>

        <div className="space-y-2 border-t border-gray-100 pt-6">
          <button 
            onClick={() => alert("Revoke Access Action")}
            className="w-full rounded-md bg-[#C81E1E] py-2.5 text-sm font-bold text-white transition hover:bg-red-800"
          >
            Revoke Access
          </button>

          <div className="space-y-1 pt-2 text-xs text-gray-500">
            <button className="flex w-full items-center gap-2 px-2 py-1.5 hover:text-gray-900">
              <span className="material-symbols-outlined text-sm">help</span>
              Support
            </button>
            <button 
              onClick={logout}
              className="flex w-full items-center gap-2 px-2 py-1.5 hover:text-gray-900"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-gray-900">Institution Management</h2>
            <p className="mt-1 text-sm font-medium text-gray-500">
              Manage registered higher education institutions and accreditation statuses.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 rounded-md bg-[#1A56DB] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <span className="material-symbols-outlined text-lg">domain_add</span>
              Add Institution
            </button>

            <div className="border-l border-gray-200 pl-4 text-right">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Last Updated</span>
              <span className="font-mono text-xs font-bold text-gray-600">{currentDate}</span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-lg text-gray-400">
              search
            </span>
            <input
              type="text"
              placeholder="Search institutions by name, code, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 shadow-sm focus:border-[#1A56DB] focus:outline-none"
            />
          </div>
          <span className="text-xs font-medium text-gray-500">
            Total Institutions: <strong className="text-gray-900">{filteredInstitutions.length}</strong>
          </span>
        </div>

        {/* Institutions Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="py-3 px-4">Institution Name</th>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Contact Email</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredInstitutions.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center font-medium text-gray-500">
                    No institutions found matching your search.
                  </td>
                </tr>
              ) : (
                filteredInstitutions.map((inst) => {
                  const statusNormalized = (inst.status ?? 'ACTIVE').toUpperCase()
                  const isActive = statusNormalized === 'ACTIVE' || statusNormalized === 'APPROVED'

                  return (
                    <tr key={inst.id} className="transition hover:bg-gray-50/80">
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        {inst.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-bold text-gray-600">
                        {inst.code ?? '—'}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-gray-600">
                        {inst.contact_email ?? inst.address ?? '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                          {statusNormalized}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button 
                          onClick={() => alert(`Managing details for: ${inst.name}`)}
                          className="mr-3 text-xs font-semibold text-gray-600 hover:text-[#1A56DB]"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Create Institution Modal */}
        <CreateInstitutionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={fetchInstitutions}
        />
      </main>
    </div>
  )
}