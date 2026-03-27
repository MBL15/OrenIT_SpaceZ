import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import mascotUrl from '../assets/mascot.png'
import './ProfilePage.css'

const POINTS_KEY = 'spaceedu-points'

function readCoins() {
  try {
    const raw = Number(localStorage.getItem(POINTS_KEY) || '0')
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
  } catch {
    return 0
  }
}

export default function ProfilePage() {
  const { user } = useAuth()
  const [hint, setHint] = useState('')
  const [coins] = useState(readCoins)

  const displayName = user?.name?.trim() || user?.email || 'Ученик'

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
          <div className="pf-coins" aria-label="Баланс коинов">
            <span className="pf-coins-label">Баланс коинов</span>
            <strong className="pf-coins-value">{coins}</strong>
          </div>

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
            {user?.email ? <p className="pf-email">{user.email}</p> : null}
          </div>
        </main>
      </div>
    </div>
  )
}
