import React, { useState } from 'react'
import { useAuth } from '../useAuth.js'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export default function CreateInstitutionModal({ isOpen, onClose, onSuccess }) {
  const { accessToken } = useAuth()
  
  const [formData, setFormData] = useState({
    name: '',
    contact_email: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  if (!isOpen) return null

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!accessToken) {
      setError('Authentication token missing. Please log in again.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE}/api/institutions/create/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        
        // Handle DRF object, list, or standard error string responses
        if (response.status === 401) {
          throw new Error('Session expired or unauthorized. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Permission denied. You must be a system admin.')
        } else if (errData.detail) {
          throw new Error(errData.detail)
        } else if (errData.name?.[0]) {
          throw new Error(`Name: ${errData.name[0]}`)
        } else if (errData.contact_email?.[0]) {
          throw new Error(`Email: ${errData.contact_email[0]}`)
        } else {
          throw new Error(`HTTP ${response.status} Error`)
        }
      }

      // Reset form state
      setFormData({ name: '', contact_email: '' })

      // Safely invoke callbacks to prevent runtime exceptions
      if (typeof onSuccess === 'function') {
        onSuccess()
      }

      if (typeof onClose === 'function') {
        onClose()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setError(null)
    if (typeof onClose === 'function') {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 font-sans">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <h3 className="text-lg font-bold text-gray-900">Add New Institution</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-gray-700">
              Institution Name
            </label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Catholic University of Eastern Africa"
              value={formData.name}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1A56DB] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-gray-700">
              Contact Email
            </label>
            <input
              type="email"
              name="contact_email"
              required
              placeholder="e.g. registrar@cuea.edu"
              value={formData.contact_email}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1A56DB] focus:outline-none"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[#1A56DB] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Institution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}