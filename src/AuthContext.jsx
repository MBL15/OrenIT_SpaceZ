import { createContext, useContext, useEffect, useState } from 'react'
import {
  clearSession,
  getSession,
  loginUser,
  registerUser,
  setSession,
} from './auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setUser(getSession())
    setReady(true)
  }, [])

  const login = (email, password) => {
    const r = loginUser(email, password)
    if (r.ok) {
      setUser(r.user)
      return { ok: true }
    }
    return r
  }

  const register = (email, password, name) => {
    const r = registerUser({ email, password, name })
    if (!r.ok) return r
    const session = {
      email: email.trim().toLowerCase(),
      name: name.trim(),
    }
    setSession(session)
    setUser(session)
    return { ok: true }
  }

  const logout = () => {
    clearSession()
    setUser(null)
  }

  if (!ready) return null

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
