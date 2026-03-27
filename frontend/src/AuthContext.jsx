import { createContext, useContext, useEffect, useState } from 'react'
import { apiLogin, apiRegister, clearToken, fetchMe } from './auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      localStorage.removeItem('spaceedu-users')
      localStorage.removeItem('spaceedu-session')
    } catch {
      /* ignore */
    }
    let cancelled = false
    ;(async () => {
      try {
        const me = await fetchMe()
        if (!cancelled) setUser(me)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = async (loginStr, password) => {
    const r = await apiLogin(loginStr, password)
    if (!r.ok) return r
    const me = await fetchMe()
    setUser(me)
    if (!me) return { ok: false, error: 'Не удалось загрузить профиль' }
    return { ok: true }
  }

  const register = async (loginStr, password, displayName, accountType) => {
    const r = await apiRegister({
      login: loginStr,
      password,
      display_name: displayName,
      account_type: accountType,
    })
    if (!r.ok) return r
    return login(loginStr, password)
  }

  const logout = () => {
    clearToken()
    setUser(null)
  }

  if (!ready) {
    return (
      <div className="orenit-boot" role="status">
        Загрузка…
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth вне AuthProvider')
  return ctx
}
