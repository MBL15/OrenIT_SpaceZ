import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [role, setRole] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (password !== password2) {
      setError('Пароли не совпадают')
      return
    }
    if (password.length < 6) {
      setError('Пароль не короче 6 символов')
      return
    }
    const r = register(email, password, name)
    if (r.ok) navigate('/app', { replace: true })
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
        <h1 className="space-auth-title">Регистрация</h1>
        <p className="space-auth-sub">
          {role ? 'Создайте аккаунт, чтобы войти в кабинет' : 'Сначала выберите формат аккаунта'}
        </p>
        {!role ? (
          <div className="space-role-select" role="group" aria-label="Тип аккаунта">
            <button
              type="button"
              className="space-role-btn"
              onClick={() => setRole('student_parent')}
            >
              Ученик/родитель
            </button>
            <button
              type="button"
              className="space-role-btn"
              onClick={() => setRole('teacher')}
            >
              Учитель
            </button>
          </div>
        ) : (
          <form className="space-form" onSubmit={handleSubmit}>
            {error && <p className="space-form-error">{error}</p>}
            <p className="space-role-note">
              Выбран тип: {role === 'teacher' ? 'Учитель' : 'Ученик/родитель'}
            </p>
            <button
              type="button"
              className="space-role-change"
              onClick={() => {
                setRole('')
                setError('')
              }}
            >
              Изменить тип аккаунта
            </button>
            <label className="space-label">
              Имя
              <input
                className="space-input"
                type="text"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>
            <label className="space-label">
              Повторите пароль
              <input
                className="space-input"
                type="password"
                name="password2"
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="space-btn space-btn--primary space-btn--block">
              Создать аккаунт
            </button>
          </form>
        )}

        <p className="space-auth-footer">
          Уже зарегистрированы?{' '}
          <Link className="space-link-inline" to="/login">
            Войти
          </Link>
        </p>
      </div>
    </div>
  )
}
