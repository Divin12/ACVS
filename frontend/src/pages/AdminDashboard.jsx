import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../useAuth.js'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export default function AdminDashboard() {
  const { accessToken, logout } = useAuth()

  const [stats, setStats] = useState(null)
  const [listData, setListData] = useState([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingList, setLoadingList] = useState(false)
  const [downloadingBulk, setDownloadingBulk] = useState(false)
  const [error, setError] = useState(null)

  // Active view state: null | 'INSTITUTIONS' | 'ALL_CERTS' | 'ANCHORED' | 'GRACE_PERIOD' | 'REVOKED'
  const [activeView, setActiveView] = useState(null)

  const currentDate = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC'

  // 1. Fetch Admin Overview Stats
  useEffect(() => {
    async function fetchAdminStats() {
      try {
        const res = await fetch(`${API_BASE}/api/admin/overview-stats/`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        })
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        } else {
          setError(`Stats HTTP Error: ${res.status}`)
        }
      } catch (err) {
        console.error("Error fetching stats:", err)
        setError(err.message)
      } finally {
        setLoadingStats(false)
      }
    }

    if (accessToken) {
      fetchAdminStats()
    }
  }, [accessToken])

  // 2. Fetch List Data according to backend routes
  const handleToggleView = async (viewType) => {
    if (activeView === viewType) {
      setActiveView(null)
      setListData([])
      return
    }

    setActiveView(viewType)
    setLoadingList(true)
    setListData([])

    let endpoint = ''

    if (viewType === 'INSTITUTIONS') {
      endpoint = `${API_BASE}/api/admin/institutions/`
    } else {
      endpoint = `${API_BASE}/api/certificates/`
    }

    try {
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      })

      if (res.ok) {
        const data = await res.json()
        console.log(`Payload received for ${viewType}:`, data)

        let extractedArray = []
        if (Array.isArray(data)) {
          extractedArray = data
        } else if (data.results && Array.isArray(data.results)) {
          extractedArray = data.results
        } else if (data.certificates && Array.isArray(data.certificates)) {
          extractedArray = data.certificates
        } else if (data.institutions && Array.isArray(data.institutions)) {
          extractedArray = data.institutions
        }

        // Filtrage des statuts uniquement pour les certificats
        if (viewType === 'ANCHORED') {
          extractedArray = extractedArray.filter(cert => {
            const st = (cert.status || cert.state || '').toUpperCase()
            return st.includes('ANCHOR') || st === 'ACTIVE' || st === 'VERIFIED'
          })
        } else if (viewType === 'GRACE_PERIOD') {
          extractedArray = extractedArray.filter(cert => {
            const st = (cert.status || cert.state || '').toUpperCase()
            return st.includes('GRACE') || st.includes('PEND') || st === 'EDITABLE'
          })
        } else if (viewType === 'REVOKED') {
          extractedArray = extractedArray.filter(cert => {
            const st = (cert.status || cert.state || '').toUpperCase()
            return st.includes('REVOK') || st.includes('CANCEL') || st.includes('DELET') || st.includes('DISABLE') || st.includes('REVOKE')
          })
        }

        setListData(extractedArray)
      } else {
        console.warn(`Failed to fetch ${viewType}. Status: ${res.status}`)
        setListData([])
      }
    } catch (err) {
      console.error(`Network error loading ${viewType}:`, err)
      setListData([])
    } finally {
      setLoadingList(false)
    }
  }

  // 3. Télécharger la liste globale des certificats sous forme de PDF
  const handleDownloadAllPdf = async () => {
    try {
      setDownloadingBulk(true)
      const res = await fetch(`${API_BASE}/api/certificates/bulk-pdf/?view=${activeView}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `certificates_report_${activeView.toLowerCase()}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
      } else {
        const errorText = await res.text()
        console.error('Bulk PDF download failed:', errorText)
        alert('Failed to generate bulk PDF report.')
      }
    } catch (err) {
      console.error('Network error downloading bulk PDF:', err)
      alert('Network error while generating bulk PDF.')
    } finally {
      setDownloadingBulk(false)
    }
  }

  if (loadingStats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 text-gray-600 font-sans">
        <p className="text-sm font-medium">Loading system overview...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#F4F5F7] text-gray-900 font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-gray-200 bg-white flex flex-col justify-between p-6">
        <div>
          <div className="flex flex-col items-center text-center pb-6 border-b border-gray-100">
            <img src="/logo.png" alt="Logo" className="h-20 w-20 object-contain" />
            <h1 className="text-lg font-extrabold tracking-tight text-gray-900">DRC Ministry</h1>
            <p className="text-xs text-gray-500 font-medium">Éducation Nationale</p>
          </div>

          <nav className="mt-6 space-y-1">
            <Link
              to="/admin/overview"
              className="flex items-center gap-3 rounded-md bg-[#E8EFFE] px-3 py-2.5 text-sm font-semibold text-[#1A56DB]"
            >
              <span className="material-symbols-outlined text-lg">grid_view</span>
              Overview
            </Link>

            <div className="flex items-center gap-3 px-3 py-2.5 text-slate-400 opacity-50 cursor-not-allowed select-none text-sm font-medium">
              <span className="material-symbols-outlined text-lg">group</span>
              Institution Management
            </div>

             <div className="flex items-center gap-3 px-3 py-2.5 text-slate-400 opacity-50 cursor-not-allowed select-none text-sm font-medium">
              Registrations
            </div>

            <div className="flex items-center gap-3 px-3 py-2.5 text-gray-400 opacity-50 cursor-not-allowed select-none text-sm font-medium">
              <span className="material-symbols-outlined text-lg">history</span>
              Activity Logs
            </div>
          </nav>
        </div>

        <div className="pt-6 border-t border-gray-100 space-y-2">
          <div className="pt-2 text-xs space-y-1 text-gray-500">
            <button onClick={logout} className="flex items-center gap-2 w-full px-2 py-1.5 hover:text-gray-900 font-semibold">
              <span className="material-symbols-outlined text-sm">logout</span>
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">System Overview</h2>
            <p className="text-sm text-gray-500 mt-1 font-medium">
              Real-time ledger status for the Academic Certificate Verification System.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-gray-400 block uppercase tracking-wider">Last Updated</span>
            <span className="text-xs font-mono text-gray-600 font-bold">{currentDate}</span>
          </div>
        </div>

        {/* TOP STATS CARDS */}
        <div className="grid grid-cols-12 gap-6 mb-8">
          {/* Registered Institutions Card */}
          <div className="col-span-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
                  <span className="material-symbols-outlined text-lg">account_balance</span>
                  Registered Institutions
                </div>
              </div>

              <div className="flex items-baseline justify-between">
                <p className="text-4xl font-extrabold text-[#1A56DB]">
                  {stats?.registeredInstitutions ?? stats?.total_institutions ?? 0}
                </p>

                <button
                  onClick={() => handleToggleView('INSTITUTIONS')}
                  className={`flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-bold transition ${
                    activeView === 'INSTITUTIONS' ? 'bg-[#1A56DB] text-white' : 'bg-blue-50 text-[#1A56DB] hover:bg-blue-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">visibility</span>
                  {activeView === 'INSTITUTIONS' ? 'Close List' : 'View Institutions'}
                </button>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100 flex justify-between items-center text-xs">
              <span className="text-gray-500">Active nodes in network</span>
              <span className="font-bold text-[#1A56DB]">+{stats?.activeNodesThisMonth ?? 1} this month</span>
            </div>
          </div>

          {/* Certificate Ledger Volume Card */}
          <div className="col-span-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
                <span className="material-symbols-outlined text-lg">verified</span>
                Certificate Ledger Volume
              </div>

              <button
                onClick={() => handleToggleView('ALL_CERTS')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition ${
                  activeView === 'ALL_CERTS' ? 'bg-gray-800 text-white' : 'bg-[#1A56DB] text-white hover:bg-blue-700'
                }`}
              >
                <span className="material-symbols-outlined text-sm">list_alt</span>
                {activeView === 'ALL_CERTS' ? 'Close All' : 'View All Certificates'}
              </button>
            </div>

            <div className="flex items-baseline gap-3 mb-6">
              <span className="text-4xl font-extrabold text-gray-900">
                {stats?.totalRecords ?? stats?.total_certificates ?? 0}
              </span>
              <span className="text-xs font-semibold text-gray-500">Total Records</span>
            </div>

            {/* Sub Status Cards */}
            <div className="grid grid-cols-3 gap-4">
              {/* Anchored */}
              <div className="rounded-md border border-gray-200 bg-gray-50/50 p-3 border-b-2 border-b-[#1A56DB] flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                    <span className="h-2 w-2 rounded-full bg-[#1A56DB]"></span>
                    Anchored (Immutable)
                  </div>
                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {stats?.anchored ?? 0}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleView('ANCHORED')}
                  className={`mt-3 w-full rounded py-1 text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                    activeView === 'ANCHORED' ? 'bg-[#1A56DB] text-white' : 'bg-blue-50 text-[#1A56DB] hover:bg-blue-100'
                  }`}
                >
                  {activeView === 'ANCHORED' ? 'Hide' : 'View Anchored'}
                </button>
              </div>

              {/* Grace Period */}
              <div className="rounded-md border border-gray-200 bg-gray-50/50 p-3 border-b-2 border-b-[#E3A008] flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                    <span className="h-2 w-2 rounded-full bg-[#E3A008]"></span>
                    Grace Period (Editable)
                  </div>
                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {stats?.gracePeriod ?? 0}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleView('GRACE_PERIOD')}
                  className={`mt-3 w-full rounded py-1 text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                    activeView === 'GRACE_PERIOD' ? 'bg-[#D97706] text-white' : 'bg-amber-50 text-[#D97706] hover:bg-amber-100'
                  }`}
                >
                  {activeView === 'GRACE_PERIOD' ? 'Hide' : 'View Grace Period'}
                </button>
              </div>

              {/* Revoked */}
              <div className="rounded-md border border-gray-200 bg-gray-50/50 p-3 border-b-2 border-b-[#C81E1E] flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                    <span className="h-2 w-2 rounded-full bg-[#C81E1E]"></span>
                    Revoked / Disabled
                  </div>
                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {stats?.revoked ?? 0}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleView('REVOKED')}
                  className={`mt-3 w-full rounded py-1 text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                    activeView === 'REVOKED' ? 'bg-[#C81E1E] text-white' : 'bg-red-50 text-[#C81E1E] hover:bg-red-100'
                  }`}
                >
                  {activeView === 'REVOKED' ? 'Hide' : 'View Revoked'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* DATA TABLE SECTION */}
        {activeView && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1A56DB]">
                  {activeView === 'INSTITUTIONS' ? 'account_balance' : 'verified'}
                </span>
                {activeView === 'INSTITUTIONS' && 'Registered Institutions'}
                {activeView === 'ALL_CERTS' && 'All Certificates'}
                {activeView === 'ANCHORED' && 'Anchored Certificates (Immutable)'}
                {activeView === 'GRACE_PERIOD' && 'Grace Period Certificates (Editable)'}
                {activeView === 'REVOKED' && 'Revoked Certificates'}
                <span className="text-sm font-normal text-gray-500">({listData.length} records)</span>
              </h3>

              {/* Le bouton de téléchargement s'affiche UNIQUEMENT pour les certificats, laissant la vue Institutions inchangée */}
              {activeView !== 'INSTITUTIONS' && listData.length > 0 && (
                <button
                  onClick={handleDownloadAllPdf}
                  disabled={downloadingBulk}
                  className="flex items-center gap-2 rounded bg-[#1A56DB] px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                  {downloadingBulk ? 'Generating PDF...' : 'Download Full List PDF'}
                </button>
              )}
            </div>

            {loadingList ? (
              <p className="text-sm text-gray-500 py-6 text-center animate-pulse">
                Fetching records from server...
              </p>
            ) : listData.length > 0 ? (
              <div className="overflow-x-auto">
                {activeView === 'INSTITUTIONS' ? (
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase text-gray-500">
                        <th className="py-3 px-4">ID</th>
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4">Code</th>
                        <th className="py-3 px-4">Wallet Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listData.map((inst, index) => (
                        <tr key={inst.id || index} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 font-mono font-bold text-[#1A56DB]">{inst.id ?? index + 1}</td>
                          <td className="py-3 px-4 font-medium text-gray-900">{inst.name || inst.institution_name || 'N/A'}</td>
                          <td className="py-3 px-4 font-mono text-gray-600">{inst.code || inst.short_code || 'N/A'}</td>
                          <td className="py-3 px-4 font-mono text-xs text-gray-500">{inst.wallet_address || 'Unassigned'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase text-gray-500">
                        <th className="py-3 px-4">Certificate ID / Number</th>
                        <th className="py-3 px-4">Student Name</th>
                        <th className="py-3 px-4">Degree / Major</th>
                        <th className="py-3 px-4">Institution</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listData.map((cert, idx) => {
                        const displayStatus = (cert.status || cert.state || activeView).toUpperCase()
                        const certNum = cert.certificate_number || cert.certificate_id || cert.id

                        return (
                          <tr key={cert.id || idx} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4 font-mono font-bold text-[#1A56DB]">
                              {certNum || `#${idx + 1}`}
                            </td>
                            <td className="py-3 px-4 font-medium text-gray-900">
                              {cert.student_name || cert.student_full_name || (typeof cert.student === 'object' && cert.student !== null ? cert.student.full_name : cert.student) || 'N/A'}
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {cert.degree_title || cert.degree || cert.field_of_study || 'N/A'}
                            </td>
                            
                            <td className="py-3 px-4 text-gray-500 text-xs">
                              {(() => {
                                return cert.institution_name || 
                                       cert.school_name || 
                                       cert.institutionName || 
                                       (typeof cert.institution === 'object' && cert.institution !== null ? (cert.institution.name || cert.institution.institution_name) : null) || 
                                       (typeof cert.institution === 'string' ? cert.institution : null) ||
                                       `ID: ${cert.institution || 'N/A'}`;
                              })()}
                            </td>

                            <td className="py-3 px-4">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                displayStatus.includes('ANCHOR') ? 'bg-blue-100 text-blue-800' :
                                displayStatus.includes('GRACE') || displayStatus.includes('PEND') ? 'bg-amber-100 text-amber-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {displayStatus}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-gray-500">
                <span className="material-symbols-outlined text-3xl text-gray-400 mb-2">folder_open</span>
                <p className="text-sm font-medium">No records returned from API for <strong>{activeView}</strong>.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}