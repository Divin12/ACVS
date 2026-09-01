// Lifecycle states for the registrar-side certificate list. The backend's
// `Certificate.Status` TextChoices are the source of truth — keep these keys
// in lockstep so they can be passed directly to /api/certificates/?status=<key>.

export default Object.freeze({
  ALL: 'all',
  GRACE_PERIOD: 'grace_period',
  ANCHORED: 'anchored',
  DISABLED: 'disabled',
})

export const LIST_STATE_OPTIONS = [
  { value: 'all', label: 'Tous les états' },
  { value: 'grace_period', label: 'Grace Period' },
  { value: 'anchored', label: 'Anchored' },
  { value: 'disabled', label: 'Disabled' },
]
