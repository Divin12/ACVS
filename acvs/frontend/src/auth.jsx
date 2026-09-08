import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  changePassword as apiChangePassword,
  getMe,
  login as apiLogin,
  otpResend as apiOtpResend,
  otpVerify as apiOtpVerify,
} from './api/auth.js'

/* Storage keys.
   - ACCESS / REFRESH in localStorage so a refresh keeps the session alive.
   - PENDING_TOKEN in sessionStorage (OTP is short-lived — losing it on tab
     close is intentional, matches the 5-minute OTP window on the backend). */
const ACCESS_KEY = 'acvs.access'
const REFRESH_KEY = 'acvs.refresh'
const PENDING_KEY = 'acvs.pendingToken'

const AuthContext = createContext(null)
// Exported so useAuth.js (and any future consumer) reads from the SAME
// context object the provider publishes to. Recreating createContext()
// in another file gives you a separate, default-valued context whose
// value is always null — which silently breaks every consumer.
export { AuthContext }

function readStored() {
  return {
    access: localStorage.getItem(ACCESS_KEY),
    refresh: localStorage.getItem(REFRESH_KEY),
    pending: sessionStorage.getItem(PENDING_KEY),
  }
}

export function AuthProvider({ children }) {
  const [{ access, refresh, pending }, setStored] = useState(readStored)
  // user/userStatus: when we have an access token but no user yet, we fetch
  // /api/auth/me/. Without a token there's no need to fetch — user is null
  // and status is 'idle' from the initial state.
  const [user, setUser] = useState(null)
  const [userStatus, setUserStatus] = useState(access ? 'loading' : 'idle')
  // Tracks the access-token value we last kicked off a /me/ fetch for, so
  // StrictMode double-invocation and a mid-flight token swap don't race.
  const fetchedFor = useRef(null)
  // Separate from `user` so we can read it BEFORE /me/ resolves on a
  // cold load (the OTP-verify response body already tells us, and we
  // want RequireAuth to redirect immediately rather than render the
  // children then bounce). Cleared by /me/, by changePassword, and by
  // logout; set by verifyOtp.
  const [mustChangePassword, setMustChangePassword] = useState(false)

  useEffect(() => {
    if (!access) return
    fetchedFor.current = access
    let cancelled = false
    getMe(access)
      .then((me) => {
        if (cancelled || fetchedFor.current !== access) return
        setUser(me)
        // Backend exposes must_change_password on /me/ — sync the flag
        // from the source of truth. The flag's presence on the user
        // object also means RequireAuth's first render after /me/
        // completes will redirect immediately without needing an
        // additional state read.
        setMustChangePassword(Boolean(me?.must_change_password))
        setUserStatus('authenticated')
      })
      .catch(() => {
        if (cancelled || fetchedFor.current !== access) return
        // Token rejected — clear and let the guard bounce the user.
        localStorage.removeItem(ACCESS_KEY)
        localStorage.removeItem(REFRESH_KEY)
        setStored({ access: null, refresh: null, pending: sessionStorage.getItem(PENDING_KEY) })
        setUser(null)
        setMustChangePassword(false)
        setUserStatus('idle')
      })
    return () => {
      cancelled = true
    }
  }, [access])

  const login = useCallback(async (email, password) => {
    const { pending_token } = await apiLogin(email, password)
    sessionStorage.setItem(PENDING_KEY, pending_token)
    setStored((prev) => ({ ...prev, pending: pending_token }))
    return pending_token
  }, [])

  
const verifyOtp = useCallback(
    async (code) => {
      const currentPending = sessionStorage.getItem(PENDING_KEY)
      if (!currentPending) {
        throw new Error('No pending login session. Please sign in again.')
      }
      const {
        access: newAccess,
        refresh: newRefresh,
        must_change_password,
      } = await apiOtpVerify(currentPending, code)

      localStorage.setItem(ACCESS_KEY, newAccess)
      localStorage.setItem(REFRESH_KEY, newRefresh)
      sessionStorage.removeItem(PENDING_KEY)

      // Récupération immédiate du profil de l'utilisateur
      let me = null
      try {
        me = await getMe(newAccess)
        setUser(me)
        setUserStatus('authenticated')
      } catch (e) {
        console.error('Erreur récupération profil user:', e)
      }

      setStored({ access: newAccess, refresh: newRefresh, pending: null })
      setMustChangePassword(Boolean(must_change_password))

      // On retourne `user` dans l'objet pour que OtpVerify puisse le lire directement
      return { 
        access: newAccess, 
        refresh: newRefresh, 
        must_change_password,
        user: me 
      }
    },
    [],
  )

  const resendOtp = useCallback(async () => {
    const currentPending = sessionStorage.getItem(PENDING_KEY)
    if (!currentPending) {
      throw new Error('No pending login session. Please sign in again.')
    }
    return apiOtpResend(currentPending)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    sessionStorage.removeItem(PENDING_KEY)
    setStored({ access: null, refresh: null, pending: null })
    setUser(null)
    setMustChangePassword(false)
    setUserStatus('idle')
  }, [])

  // Used by SetPassword.jsx. The endpoint is auth-gated; the user's
  // identity comes from the JWT. On success, the response body says
  // `must_change_password: false` — clear the local flag immediately
  // so a navigation back to a guarded route doesn't bounce the user
  // through set-password again on the next /me/ round-trip.
  const changePassword = useCallback(
    async (newPassword) => {
      const { must_change_password } = await apiChangePassword(access, {
        new_password: newPassword,
      })
      setMustChangePassword(Boolean(must_change_password))
      return must_change_password === false
    },
    [access],
  )

  const value = useMemo(
    () => ({
      user,
      accessToken: access,
      refreshToken: refresh,
      pendingToken: pending,
      userStatus,
      mustChangePassword,
      login,
      verifyOtp,
      resendOtp,
      logout,
      changePassword,
    }),
    [
      user,
      access,
      refresh,
      pending,
      userStatus,
      mustChangePassword,
      login,
      verifyOtp,
      resendOtp,
      logout,
      changePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}