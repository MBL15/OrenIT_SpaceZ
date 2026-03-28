import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, fetchStudentAchievements, parseErrorDetail } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import ArtemiySkinShopModal from '../components/ArtemiySkinShopModal.jsx'
import { consumeNewAchievementNotifications } from '../lib/achievementNotifications.js'
import { useArtemiySkin } from '../hooks/useArtemiySkin.js'
import './ProfilePage.css'

/** Синхронно с `XP_PER_LEVEL` в app/services.py — новый уровень каждые 1000 XP. */
const XP_PER_LEVEL = 1000

function achievementsFetchErrorMessage(res, data) {
  if (res.status === 404) {
    const base = (import.meta.env.VITE_API_BASE || '').trim()
    const where = base
      ? `Запрос ушёл на API: ${base}. Там должна быть эта же версия кода.`
      : 'В dev запрос идёт через Vite на тот же компьютер (прокси → обычно порт 8000).'
    return `Ачивки недоступны: сервер ответил «не найдено». ${where} Запуск из корня проекта: uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
  }
  return parseErrorDetail(data)
}

const SKIN_TABS = [
  { id: 'skin', label: 'Скины' },
  { id: 'hat', label: 'Головной убор' },
  { id: 'accessory', label: 'Аксессуар' },
]

function getChildXpProgress(u) {
  if (!u || u.role !== 'child') return null
  let xp = 0
  const rawXp = u.xp_total
  if (typeof rawXp === 'number' && Number.isFinite(rawXp)) {
    xp = Math.max(0, Math.floor(rawXp))
  } else if (rawXp != null && String(rawXp).trim() !== '') {
    const n = Number(rawXp)
    if (Number.isFinite(n)) xp = Math.max(0, Math.floor(n))
  }
  let level = Math.floor(xp / XP_PER_LEVEL) + 1
  const rawLv = u.level
  if (typeof rawLv === 'number' && Number.isFinite(rawLv)) {
    level = rawLv
  }
  return { xp_total: xp, level }
}

export default function ProfilePage() {
  const { user } = useAuth()
  const [shopOpen, setShopOpen] = useState(false)
  const [balance, setBalance] = useState(null)
  const [progress, setProgress] = useState(() => getChildXpProgress(user))
  const [skinSlotTab, setSkinSlotTab] = useState('skin')
  const [achievements, setAchievements] = useState([])
  const [achievementsLoading, setAchievementsLoading] = useState(false)
  const [achievementsErr, setAchievementsErr] = useState('')
  const [achievementToastQueue, setAchievementToastQueue] = useState([])
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
        if (!cancelled) {
          setBalance(null)
          setProgress(null)
          setAchievements([])
          setAchievementsErr('')
        }
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

  useEffect(() => {
    if (!user || user.role !== 'child') {
      setProgress(null)
      return
    }
    setProgress(getChildXpProgress(user))
    let cancelled = false
    ;(async () => {
      const res = await apiFetch('/auth/me')
      if (cancelled || !res.ok) return
      const u = await res.json().catch(() => null)
      if (cancelled || !u) return
      setProgress(getChildXpProgress(u))
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const loadAchievements = useCallback(async () => {
    if (!user || user.role !== 'child') {
      setAchievements([])
      return
    }
    const res = await fetchStudentAchievements()
    if (!res.ok) return
    const data = await res.json().catch(() => [])
    setAchievements(Array.isArray(data) ? data : [])
  }, [user])

  useEffect(() => {
    if (!user || user.role !== 'child') {
      setAchievements([])
      return
    }
    let cancelled = false
    setAchievementsLoading(true)
    setAchievementsErr('')
    ;(async () => {
      const res = await fetchStudentAchievements()
      if (cancelled) return
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setAchievementsErr(achievementsFetchErrorMessage(res, data))
        setAchievements([])
        setAchievementsLoading(false)
        return
      }
      const data = await res.json().catch(() => [])
      setAchievements(Array.isArray(data) ? data : [])
      setAchievementsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (
      user?.role !== 'child' ||
      user?.id == null ||
      achievementsLoading ||
      achievementsErr ||
      achievements.length === 0
    ) {
      return
    }
    const fresh = consumeNewAchievementNotifications(achievements, user.id)
    if (fresh.length > 0) {
      setAchievementToastQueue((q) => [...q, ...fresh])
    }
  }, [achievements, achievementsLoading, achievementsErr, user?.role, user?.id])

  useEffect(() => {
    if (achievementToastQueue.length === 0) return
    const t = window.setTimeout(() => {
      setAchievementToastQueue((q) => q.slice(1))
    }, 4200)
    return () => window.clearTimeout(t)
  }, [achievementToastQueue])

  const toastAch = achievementToastQueue[0]

  return (
    <div className="pf-wrap">
      <div
        className={`pf-panel${user?.role === 'child' ? ' pf-panel--armory' : ''}`}
      >
        <header className="pf-top">
          <Link className="pf-back" to="/app">
            ← К разделам
          </Link>
        </header>

        <main className="pf-main">
          {user?.role === 'child' ? (
            <div className="pf-armory">
              <div className="pf-armory-bar">
                <p className="pf-armory-kicker">Профиль</p>
                <h1 className="pf-armory-title">{displayName}</h1>
              </div>

              <div className="pf-armory-tabs" role="tablist" aria-label="Слоты внешнего вида">
                {SKIN_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={skinSlotTab === t.id}
                    className={`pf-armory-tab${skinSlotTab === t.id ? ' pf-armory-tab--on' : ''}`}
                    title={`Открыть магазин: ${t.label}`}
                    onClick={() => {
                      setSkinSlotTab(t.id)
                      setShopOpen(true)
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="pf-armory-grid">
                <aside className="pf-armory-col pf-armory-col--left" aria-label="Достижения">
                  <h2 className="pf-armory-col-title">Ачивки</h2>
                  <p className="pf-armory-col-hint">
                    {achievements.length > 0
                      ? `Открыто ${achievements.filter((a) => a.unlocked).length} из ${achievements.length}`
                      : 'Награды за обучение и активность'}
                  </p>
                  {achievementsLoading ? (
                    <p className="pf-armory-muted">Загрузка…</p>
                  ) : achievementsErr ? (
                    <p className="pf-armory-err">{achievementsErr}</p>
                  ) : achievements.length === 0 ? (
                    <p className="pf-armory-muted">Нет доступных достижений.</p>
                  ) : (
                    <ul className="pf-ach-tablets">
                      {achievements.map((a) => (
                        <li key={a.id} className="pf-ach-tablet-li">
                          <div
                            className={`pf-ach-tablet${a.unlocked ? ' pf-ach-tablet--unlocked' : ' pf-ach-tablet--locked'}`}
                            title={`${a.title} — ${a.description}`}
                            aria-label={
                              a.unlocked
                                ? `${a.title}. ${a.description}`
                                : `${a.title}, ещё не получено`
                            }
                          >
                            <span className="pf-ach-tablet-icon" aria-hidden="true">
                              {a.icon}
                            </span>
                            <span className="pf-ach-tablet-name">{a.title}</span>
                            {!a.unlocked ? (
                              <span className="pf-ach-tablet-badge" aria-hidden="true">
                                🔒
                              </span>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>

                <section className="pf-armory-col pf-armory-col--center" aria-label="Персонаж">
                  <div className="pf-armory-stage">
                    <div className="pf-avatar-shell pf-avatar-shell--hero">
                      <img
                        className={['pf-mascot', artemiySkinClass].filter(Boolean).join(' ')}
                        src={artemiySrc}
                        alt="Маскот профиля SpacEdu"
                      />
                    </div>
                  </div>
                  {balance !== null && (
                    <div className="pf-coins pf-coins--center" aria-label="Баланс коинов">
                      <span className="pf-coins-label">Монеты</span>
                      <strong className="pf-coins-value">{balance}</strong>
                    </div>
                  )}
                </section>

                <aside className="pf-armory-col pf-armory-col--right" aria-label="Уровень и опыт">
                  <h2 className="pf-armory-col-title pf-sr-only">Уровень и опыт</h2>
                  {progress && (
                    <div className="pf-progress" aria-label="Уровень и опыт">
                      <div className="pf-xp-hero">
                        <span className="pf-xp-hero-label">Всего опыта</span>
                        <div className="pf-xp-hero-line">
                          <strong className="pf-xp-hero-value">{progress.xp_total}</strong>
                          <span className="pf-xp-hero-unit">XP</span>
                        </div>
                      </div>
                      <div className="pf-progress-row">
                        <span className="pf-progress-label">Уровень</span>
                        <strong className="pf-progress-value">{progress.level}</strong>
                      </div>
                      <p className="pf-level-rule">
                        Каждые {XP_PER_LEVEL} суммарного XP — новый уровень.
                      </p>
                      {(() => {
                        const total = progress.xp_total
                        const inLevel = total % XP_PER_LEVEL
                        const toNext = XP_PER_LEVEL - inLevel
                        const pct = (inLevel / XP_PER_LEVEL) * 100
                        return (
                          <div className="pf-level-track">
                            <div className="pf-level-track-head">
                              <span className="pf-level-track-label">
                                До уровня {progress.level + 1}
                              </span>
                              <span className="pf-level-track-nums">
                                {inLevel} / {XP_PER_LEVEL} XP
                              </span>
                            </div>
                            <div
                              className="pf-level-bar"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={XP_PER_LEVEL}
                              aria-valuenow={inLevel}
                              aria-label={`Прогресс внутри уровня: ${inLevel} из ${XP_PER_LEVEL} опыта`}
                            >
                              <div
                                className="pf-level-bar-fill"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="pf-level-next">
                              Осталось <strong>{toNext}</strong> XP до следующего уровня
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </aside>
              </div>

              <footer className="pf-footer pf-footer--armory">
                {user?.login ? (
                  <p className="pf-login-line">
                    <span className="pf-login-k">Логин</span>
                    <span className="pf-login-v">{user.login}</span>
                  </p>
                ) : null}
              </footer>
            </div>
          ) : (
            <div className="pf-sheet">
              <section className="pf-identity" aria-label="Аватар и имя">
                <div className="pf-avatar-shell">
                  <img
                    className={['pf-mascot', artemiySkinClass].filter(Boolean).join(' ')}
                    src={artemiySrc}
                    alt="Маскот профиля SpacEdu"
                  />
                </div>
                <div className="pf-identity-text">
                  <h1 className="pf-username">{displayName}</h1>
                  {user?.role === 'teacher' && (
                    <p className="pf-role-hint">
                      Учитель — классы и задания в разделе «Мои классы».
                    </p>
                  )}
                  {user?.role === 'admin' && (
                    <p className="pf-role-hint">
                      Администратор —{' '}
                      <Link className="pf-role-link" to="/app/admin">
                        админ-панель
                      </Link>
                    </p>
                  )}
                </div>
              </section>

              <footer className="pf-footer">
                <button
                  type="button"
                  className="pf-btn-custom"
                  onClick={() => setShopOpen(true)}
                >
                  Кастомизация
                </button>
                {user?.login ? (
                  <p className="pf-login-line">
                    <span className="pf-login-k">Логин</span>
                    <span className="pf-login-v">{user.login}</span>
                  </p>
                ) : null}
              </footer>
            </div>
          )}
        </main>
      </div>

      <ArtemiySkinShopModal
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        userRole={user?.role}
        focusSlot={user?.role === 'child' ? skinSlotTab : null}
        onEconomyUpdated={() => {
          void loadWallet()
          void refreshSkin()
          void loadAchievements()
          void (async () => {
            const res = await apiFetch('/auth/me')
            if (!res.ok) return
            const u = await res.json().catch(() => null)
            if (!u) return
            setProgress(getChildXpProgress(u))
          })()
        }}
      />

      {toastAch ? (
        <div
          className="pf-ach-toast-layer"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="pf-ach-toast">
            <p className="pf-ach-toast-kicker">Получена ачивка</p>
            <div className="pf-ach-toast-main">
              <span className="pf-ach-toast-icon" aria-hidden="true">
                {toastAch.icon}
              </span>
              <span className="pf-ach-toast-title">{toastAch.title}</span>
            </div>
            <p className="pf-ach-toast-desc">{toastAch.description}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
