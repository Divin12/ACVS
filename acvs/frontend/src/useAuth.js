import { useContext } from 'react'
import { AuthContext } from './auth.jsx'

// IMPORTANT: this file imports the SINGLE AuthContext object from auth.jsx,
// not a fresh createContext(). Two contexts would silently break every
// consumer (the hook would always see the default value, null, and throw).
//
// useAuth.js is split out only so auth.jsx keeps the
// react-refresh/only-export-components rule — components-only files get HMR;
// helpers in the same file disable HMR for everything in it.

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}