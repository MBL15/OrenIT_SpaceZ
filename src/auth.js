import {
  apiFetch,
  clearToken,
  getToken,
  parseErrorDetail,
  setToken,
} from './api'

export function normalizeUser(u) {
  if (!u) return null
  return {
    id: u.id,
    login: u.login,
    display_name: u.display_name,
    role: u.role,
    avatar_id: u.avatar_id,
    name: u.display_name,
    email: u.login,
  }
}

export async function apiLogin(login, password) {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ login: login.trim(), password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: parseErrorDetail(data) }
  }
  if (!data.access_token) {
    return { ok: false, error: 'Нет токена в ответе сервера' }
  }
  setToken(data.access_token)
  return { ok: true }
}

export async function apiRegister({ login, password, display_name, account_type }) {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({
      login: login.trim(),
      password,
      display_name: display_name.trim(),
      account_type: account_type === 'teacher' ? 'teacher' : 'child',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: parseErrorDetail(data) }
  }
  return { ok: true }
}

export async function fetchMe() {
  if (!getToken()) return null
  const res = await apiFetch('/auth/me')
  if (!res.ok) {
    clearToken()
    return null
  }
  const u = await res.json().catch(() => null)
  return normalizeUser(u)
}

export { clearToken, getToken }
