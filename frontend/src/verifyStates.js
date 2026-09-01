// Tiny shared module so the API client and the badge can both reference
// the same state keys without an import cycle.
export default Object.freeze({
  VALID: 'valid',
  DISABLED: 'disabled',
  NOT_FOUND: 'not_found',
})
