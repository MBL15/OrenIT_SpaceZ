import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import ArtemiySkinShopModal from '../components/ArtemiySkinShopModal.jsx'
import { useArtemiySkin } from '../hooks/useArtemiySkin.js'
import './ProfilePage.css'

export default function ProfilePage() {
  const { user } = useAuth()
  const [shopOpen, setShopOpen] = useState(false)
  const [balance, setBalance] = useState(null)
  const { src: artemiySrc, className: artemiySkinClass, refresh: refreshSkin } =
    useArtemiySkin()

  const displayName =
    user?.display_name?.trim() || user?.name?.trim() || user?.login || 'Профиль'

  const loadWallet = useCallback(async () => {
    if (!user || user.role !== 'child') {
      setBalance(null)
      return
    }
    const res = await apiFetch('/me/wallet')
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    if (data && typeof data.balance === 'number') {
      setBalance(data.balance)
    } else if (data && typeof data.coins === 'number') {
      setBalance(data.coins)
    }
  }, [user])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!user || user.role !== 'child') {
        if (!cancelled) setBalance(null)
        return
      }
      const res = await apiFetch('/me/wallet')
      if (cancelled || !res.ok) return
      const data = await res.json().catch(() => null)
      if (cancelled) return
      if (data && typeof data.balance === 'number') {
        setBalance(data.balance)
      } else if (data && typeof data.coins === 'number') {
        setBalance(data.coins)
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
              className={['pf-mascot', artemiySkinClass].filter(Boolean).join(' ')}
              src={artemiySrc}
              alt="Маскот профиля SpacEdu"
            />
          </div>

          <div className="pf-actions">
            <button
              type="button"
              className="pf-btn-custom"
              onClick={() => setShopOpen(true)}
            >
              Кастомизация
            </button>
            {user?.login ? <p className="pf-email">Логин: {user.login}</p> : null}
          </div>
        </main>
      </div>

      <ArtemiySkinShopModal
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        userRole={user?.role}
        onEconomyUpdated={() => {
          void loadWallet()
          void refreshSkin()
        }}
      />
    </div>
  )
}
