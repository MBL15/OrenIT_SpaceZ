import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/app'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    const r = login(email, password)
    if (r.ok) navigate(from, { replace: true })
    else setError(r.error)
  }

  return (
    <div className="space-page space-auth">
      <div className="space-auth-card">
        <Link to="/" className="space-auth-back">
          ← На главную
        </Link>
        <div className="space-brand space-brand--center">
          <span className="space-brand-mark">◆</span>
          <span className="space-brand-word">SpacEdu</span>
        </div>
        <h1 className="space-auth-title">Вход</h1>
        <p className="space-auth-sub">Введите email и пароль</p>

        <form className="space-form" onSubmit={handleSubmit}>
          {error && <p className="space-form-error">{error}</p>}
          <label className="space-label">
            Email
            <input
              className="space-input"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="space-label">
            Пароль
            <input
              className="space-input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="space-btn space-btn--primary space-btn--block">
            Войти
          </button>
        </form>

        <p className="space-auth-footer">
          Нет аккаунта?{' '}
          <Link className="space-link-inline" to="/register">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  )
}
