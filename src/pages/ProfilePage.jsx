import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import mascotUrl from '../assets/mascot.png'
import './ProfilePage.css'

export default function ProfilePage() {
  const { user } = useAuth()
  const [hint, setHint] = useState('')
  const [balance, setBalance] = useState(null)

  const displayName =
    user?.display_name?.trim() || user?.name?.trim() || user?.login || 'Профиль'

  useEffect(() => {
    if (!user || user.role !== 'child') {
      setBalance(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const res = await apiFetch('/me/wallet')
      if (cancelled || !res.ok) return
      const data = await res.json().catch(() => null)
      if (!cancelled && data && typeof data.balance === 'number') {
        setBalance(data.balance)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  return (
    <div className="pf-wrap">
      <div className="pf-panel">
        <header className="pf-top">
          <Link className="pf-back" to="/app">
            ← К разделам
          </Link>
        </header>

        <main className="pf-main">
          <h1 className="pf-username">{displayName}</h1>
          {user?.role === 'child' && balance !== null && (
            <div className="pf-coins" aria-label="Баланс коинов">
              <span className="pf-coins-label">Монеты</span>
              <strong className="pf-coins-value">{balance}</strong>
            </div>
          )}
          {user?.role === 'teacher' && (
            <p className="pf-email" style={{ marginBottom: 12 }}>
              Роль: учитель — классы и задания в разделе «Мои классы».
            </p>
          )}
          {user?.role === 'admin' && (
            <p className="pf-email" style={{ marginBottom: 12 }}>
              Роль: администратор —{' '}
              <Link className="space-link-inline" to="/app/admin">
                админ-панель
              </Link>{' '}
              (управление пользователями).
            </p>
          )}

          <div className="pf-mascot-wrap">
            <img
              className="pf-mascot"
              src={mascotUrl}
              alt="Маскот SpacEdu — ученик в худи с рюкзаком"
            />
          </div>

          <div className="pf-actions">
            <button
              type="button"
              className="pf-btn-custom"
              onClick={() =>
                setHint(
                  'Кастомизация появится позже: скины маскота, рамка профиля и тема.',
                )
              }
            >
              Кастомизация
            </button>
            {hint ? <p className="pf-hint">{hint}</p> : null}
            {user?.login ? <p className="pf-email">Логин: {user.login}</p> : null}
          </div>
        </main>
      </div>
    </div>
  )
}
