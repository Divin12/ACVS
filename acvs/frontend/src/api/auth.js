// Auth API wrappers. Two-step login: password → pending_token (sessionStorage)
// → 6-digit OTP → JWT pair (localStorage). JWTs are then attached to every
// subsequent request from api/bulkCreate.js.
//
// Backend contract: backend/accounts/views.py
//   POST /api/auth/login/                 {email, password} -> {pending_token}
//   POST /api/auth/otp/verify/            {pending_token, code} -> {access, refresh}
//   POST /api/auth/otp/resend/            {pending_token} -> {pending_token}
//   POST /api/auth/password-reset/request/ {email} -> 200 (always; no enumeration)
//   POST /api/auth/password-reset/confirm/ {uid, token, new_password} -> 200
//   POST /api/auth/password-change/       {new_password} (auth) -> {must_change_password: false}
//   GET  /api/auth/me/                    Authorization: Bearer <access> -> {role, institution_name, ...}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

async function asJson(res) {
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON response, leave body as null */
  }
  if (!res.ok) {
    const detail =
      body?.detail ||
      body?.message ||
      (typeof body === 'string' ? body : '') ||
      `Request failed (HTTP ${res.status})`
    const err = new Error(detail)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

export async function login(email, password) {
  const body = await asJson(
    await fetch(`${API_BASE}/api/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  )
  if (!body?.pending_token) {
    throw new Error('Login response missing pending_token')
  }
  return body
}

export async function otpVerify(pendingToken, code) {
  const body = await asJson(
    await fetch(`${API_BASE}/api/auth/otp/verify/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ pending_token: pendingToken, code }),
    }),
  )
  if (!body?.access || !body?.refresh) {
    throw new Error('OTP response missing JWT pair')
  }
  return body
}

export async function otpResend(pendingToken) {
  return asJson(
    await fetch(`${API_BASE}/api/auth/otp/resend/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ pending_token: pendingToken }),
    }),
  )
}

export async function getMe(accessToken) {
  return asJson(
    await fetch(`${API_BASE}/api/auth/me/`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  )
}




export async function registerUser(userData, token) {
  const res = await fetch(`${API_BASE_URL}/api/auth/register/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(userData),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || errorData.message || 'Failed to register user.')
  }

  return res.json()
}







// POST /api/auth/password-change/
// Auth-gated. Body: {new_password}. Sets the user's password and clears
// the must_change_password flag. Used by the forced Set New Password
// flow that an invited staff member lands on after their first OTP
// verify (when their account was created with must_change_password=true).
//
// The same AUTH_PASSWORD_VALIDATORS chain runs here as on the email-reset
// flow, so the rules are identical and the error shape is the same — the
// SetPassword page surfaces details.new_password messages verbatim.
export async function changePassword(accessToken, { new_password }) {
  return asJson(
    await fetch(`${API_BASE}/api/auth/password-change/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ new_password }),
    }),
  )
}

// POST /api/auth/password-reset/request/
// The backend deliberately returns 200 both for "user exists, link sent"
// and "user doesn't exist" — we must NOT surface any difference to the
// caller (no enumeration). On a non-2xx, the error is still thrown via
// asJson so the form can render an error panel; the user only sees the
// generic "if that address is registered…" confirmation when the call
// succeeds outright.
export async function requestPasswordReset(email) {
  await asJson(
    await fetch(`${API_BASE}/api/auth/password-reset/request/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email }),
    }),
  )
}

// POST /api/auth/password-reset/confirm/
// Reached from the emailed reset link, which the backend constructs as
// `${FRONTEND_URL}/reset-password/confirm?uid={uid}&token={token}`
// (see backend/accounts/views.py:_send_reset_email). On failure the backend
// returns 400 with `{error: "validation_error", details: {<field>: <msg>}}`:
//   - details.uid   → "Invalid reset link."
//   - details.token → "Invalid or expired reset token."
//   - details.new_password → list of validator messages (too short,
//     missing uppercase, missing number, missing special char, etc.)
// The page parses details to show field-specific copy rather than a generic
// error. The backend's own copy is already user-facing — passing it through
// verbatim avoids drifting from what the validators actually check.
export async function confirmPasswordReset({ uid, token, new_password }) {
  return asJson(
    await fetch(`${API_BASE}/api/auth/password-reset/confirm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ uid, token, new_password }),
    }),
  )
}