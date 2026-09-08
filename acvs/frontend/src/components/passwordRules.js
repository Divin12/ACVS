// Shared password rules constant for client-side live validation.
//
// This MUST mirror backend/accounts/validators.py and the
// AUTH_PASSWORD_VALIDATORS chain in backend/acvs/settings.py.
//
// The backend is the source of truth — the page surfaces
// details.new_password messages verbatim on a 400 rather than re-stating
// them. This list exists purely so the user sees which rule they're
// violating AS THEY TYPE.
//
// Special-char set must EXACTLY match
// backend/accounts/validators.py:SpecialCharValidator.SPECIAL_CHARS (25 chars):
//   ! @ # $ % ^ & * ( ) _ + - = [ ] { } | ; : , . < > ?
//
// A loose "anything not alphanumeric" regex (e.g. /[^A-Za-z0-9]/) would
// let accent marks, CJK characters, spaces, and backticks through the
// client checklist while the backend still rejects them — a silent
// mismatch during typing that would only surface as a 400 on submit.
export const PASSWORD_RULES = [
  { id: 'length', label: 'Minimum 12 characters', test: (s) => s.length >= 12 },
  { id: 'upper', label: 'At least one uppercase letter (A-Z)', test: (s) => /[A-Z]/.test(s) },
  { id: 'number', label: 'At least one number (0-9)', test: (s) => /\d/.test(s) },
  {
    id: 'special',
    label: 'At least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)',
    test: (s) => /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(s),
  },
]
