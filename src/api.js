/**
 * В dev пустой base + относительные пути → Vite proxy на FastAPI (порт 8000).
 * В проде: VITE_API_BASE=https://api.example.com
 */
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

const TOKEN_KEY = 'orenit_access_token'

function url(path) {
  if (path.startsWith('http')) return path
  return `${BASE}${path}`
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* ignore */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/** Список ачивок ученика: /me/achievements, при 404 — запасной /achievements. */
export async function fetchStudentAchievements() {
  let res = await apiFetch('/me/achievements')
  if (res.status === 404) {
    res = await apiFetch('/achievements')
  }
  return res
}

export async function apiFetch(path, options = {}) {
  const { skipAuth, ...init } = options
  const headers = new Headers(init.headers || {})
  if (
    init.body &&
    typeof init.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token && !skipAuth) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(url(path), { ...init, headers })
}

export function parseErrorDetail(data) {
  if (!data || typeof data !== 'object') return 'Ошибка запроса'
  const d = data.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    const parts = d.map((x) => (typeof x?.msg === 'string' ? x.msg : null)).filter(Boolean)
    if (parts.length) return parts.join(', ')
  }
  if (d && typeof d === 'object' && typeof d.error === 'string') return d.error
  return 'Ошибка запроса'
}
