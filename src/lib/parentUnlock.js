/** Доступ к разделу «Родителям» после parent_mode verify */

export const PARENT_UNLOCK_KEY = 'orenit_parent_mode_unlock'
export const PARENT_UNLOCK_TTL_MS = 28 * 60 * 1000

export function readUnlockMeta() {
  try {
    const raw = sessionStorage.getItem(PARENT_UNLOCK_KEY)
    if (!raw) return null
    const meta = JSON.parse(raw)
    if (typeof meta?.at !== 'number') return null
    if (Date.now() - meta.at > PARENT_UNLOCK_TTL_MS) {
      sessionStorage.removeItem(PARENT_UNLOCK_KEY)
      return null
    }
    return meta
  } catch {
    return null
  }
}

export function isParentUnlocked() {
  return readUnlockMeta() != null
}

export function persistParentUnlock(modeToken) {
  sessionStorage.setItem(
    PARENT_UNLOCK_KEY,
    JSON.stringify({ at: Date.now(), modeToken: modeToken ?? '' }),
  )
}

export function clearParentUnlock() {
  sessionStorage.removeItem(PARENT_UNLOCK_KEY)
}
