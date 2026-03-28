import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { apiFetch, parseErrorDetail } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import './ClassPage.css'

function normalizeName(s) {
  return (s || '').trim().toLowerCase()
}

export default function ClassPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  const [xpRows, setXpRows] = useState(null)
  const [lbErr, setLbErr] = useState('')
  const [xpLbErr, setXpLbErr] = useState('')
  const [activeClassId, setActiveClassId] = useState(null)
  const [myClasses, setMyClasses] = useState([])
  const [myClassesLoaded, setMyClassesLoaded] = useState(false)
  const [credential, setCredential] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewErr, setPreviewErr] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [joinMsg, setJoinMsg] = useState('')
  const [joinErr, setJoinErr] = useState('')
  const [joinPending, setJoinPending] = useState(false)
  const credentialRef = useRef('')
  const previewSeqRef = useRef(0)

  if (user?.role === 'teacher') {
    return <Navigate to="/app/teacher" replace />
  }
  if (user?.role === 'admin') {
    return <Navigate to="/app" replace />
  }

  const loadMyClasses = async () => {
    try {
      const res = await apiFetch('/classes/me')
      if (!res.ok) {
        setMyClasses([])
        return
      }
      const data = await res.json().catch(() => [])
      setMyClasses(Array.isArray(data) ? data : [])
    } finally {
      setMyClassesLoaded(true)
    }
  }

  useEffect(() => {
    if (user?.role !== 'child') return
    loadMyClasses()
  }, [user?.role])

  useEffect(() => {
    if (!myClassesLoaded) return
    if (myClasses.length === 0) {
      setActiveClassId(null)
      return
    }
    setActiveClassId((prev) => {
      const ids = new Set(myClasses.map((c) => c.class_id))
      if (prev != null && ids.has(prev)) return prev
      return myClasses[0].class_id
    })
  }, [myClassesLoaded, myClasses])

  useEffect(() => {
    if (user?.role !== 'child' || !myClassesLoaded) return

    if (myClasses.length === 0) {
      setRows([])
      setXpRows([])
      setLbErr('')
      setXpLbErr('')
      return
    }

    if (activeClassId == null) return
    let cancelled = false
    setRows(null)
    setXpRows(null)
    setLbErr('')
    setXpLbErr('')
    ;(async () => {
      const [xpRes, coinsClassRes] = await Promise.all([
        apiFetch(`/leaderboard/class/${activeClassId}`),
        apiFetch(`/leaderboard/coins/class/${activeClassId}?limit=200`),
      ])
      if (cancelled) return

      if (!coinsClassRes.ok) {
        const data = await coinsClassRes.json().catch(() => ({}))
        setLbErr(parseErrorDetail(data))
        setRows([])
      } else {
        const data = await coinsClassRes.json().catch(() => null)
        if (!Array.isArray(data)) {
          setLbErr('Некорректный ответ сервера')
          setRows([])
        } else {
          const mapped = data.map((r) => ({
            id: r.user_id,
            name: r.display_name || `Ученик #${r.user_id}`,
            points: r.coins_earned_total ?? 0,
            rank: r.rank,
          }))
          setRows(mapped)
        }
      }

      if (!xpRes.ok) {
        const data = await xpRes.json().catch(() => ({}))
        setXpLbErr(parseErrorDetail(data))
        setXpRows([])
      } else {
        const data = await xpRes.json().catch(() => null)
        if (!Array.isArray(data)) {
          setXpLbErr('Некорректный ответ сервера')
          setXpRows([])
        } else {
          const mapped = data.map((r) => ({
            id: r.user_id,
            name: r.display_name || `Ученик #${r.user_id}`,
            points: r.xp ?? 0,
            level: typeof r.level === 'number' ? r.level : 1,
            role: null,
            rank: r.rank,
          }))
          setXpRows(mapped)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.role, myClassesLoaded, myClasses.length, activeClassId])

  credentialRef.current = credential

  useEffect(() => {
    if (user?.role !== 'child') {
      setPreview(null)
      setPreviewErr('')
      setPreviewLoading(false)
      return
    }
    if (!myClassesLoaded || myClasses.length > 0) {
      setPreview(null)
      setPreviewErr('')
      setPreviewLoading(false)
      return
    }
    const seq = ++previewSeqRef.current
    const t = credential.trim()
    if (t.length < 6) {
      setPreview(null)
      setPreviewErr('')
      setPreviewLoading(false)
      return
    }
    setPreview(null)
    setPreviewErr('')
    setPreviewLoading(true)
    const id = window.setTimeout(async () => {
      const q = credentialRef.current.trim()
      if (q.length < 6) {
        if (seq === previewSeqRef.current) setPreviewLoading(false)
        return
      }
      const res = await apiFetch(
        `/classes/invite-preview?code=${encodeURIComponent(q)}`,
      )
      if (seq !== previewSeqRef.current) return
      setPreviewLoading(false)
      if (!res.ok) {
        setPreview(null)
        const data = await res.json().catch(() => ({}))
        setPreviewErr(parseErrorDetail(data))
        return
      }
      const data = await res.json().catch(() => null)
      setPreviewErr('')
      setPreview(data)
    }, 420)
    return () => window.clearTimeout(id)
  }, [credential, user?.role, myClassesLoaded, myClasses.length])

  const meName = normalizeName(user?.display_name || user?.name)
  const meId = user?.id

  const merged = useMemo(() => {
    const list = rows || []
    return list.map((m) => {
      const isMe =
        (meId != null && m.id === meId) ||
        (meName && normalizeName(m.name) === meName)
      return { ...m, isMe }
    })
  }, [rows, meId, meName])

  const mergedXp = useMemo(() => {
    const list = xpRows || []
    return list.map((m) => {
      const isMe =
        (meId != null && m.id === meId) ||
        (meName && normalizeName(m.name) === meName)
      return { ...m, isMe }
    })
  }, [xpRows, meId, meName])

  const leaderboard = useMemo(() => [...merged], [merged])
  const leaderboardXp = useMemo(() => [...mergedXp], [mergedXp])

  const activeClassName =
    myClasses.find((c) => c.class_id === activeClassId)?.class_name ?? ''

  const handleJoin = async (e) => {
    e.preventDefault()
    setJoinErr('')
    setJoinMsg('')
    const token = credential.trim()
    if (token.length < 6) {
      setJoinErr('Введите код не короче 6 символов')
      return
    }
    if (!preview && previewErr) {
      setJoinErr('Сначала дождитесь проверки кода или исправьте его')
      return
    }
    setJoinPending(true)
    try {
      const res = await apiFetch('/classes/join', {
        method: 'POST',
        body: JSON.stringify({ invite_token: token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setJoinErr(parseErrorDetail(data))
        return
      }
      const name = data.class_name || ''
      if (data.already_member) {
        setJoinMsg(`Вы уже состоите в классе «${name}»`)
      } else {
        setJoinMsg(`Вы вступили в класс «${name}»`)
      }
      setCredential('')
      setPreview(null)
      setPreviewErr('')
      await loadMyClasses()
    } finally {
      setJoinPending(false)
    }
  }

  const bootPending =
    user?.role === 'child' &&
    (!myClassesLoaded ||
      (myClasses.length === 0 && rows === null) ||
      (myClasses.length > 0 &&
        (activeClassId == null || rows === null || xpRows === null)))

  if (bootPending) {
    return (
      <div className="cp-wrap">
        <div className="cp-panel">
          <p className="cp-sub" style={{ padding: 24 }}>
            Загрузка…
          </p>
        </div>
      </div>
    )
  }

  const lbSubtitle =
    myClasses.length === 0
      ? 'Рейтинги по монетам и опыту — среди одноклассников. Вступите в класс по коду учителя, чтобы они отобразились.'
      : activeClassName
        ? `Класс «${activeClassName}»: таблицы лидеров по монетам и по ОП — среди учеников этого класса.`
        : 'Таблицы лидеров — по выбранному классу.'

  return (
    <div className="cp-wrap">
      <div className="cp-panel">
        <header className="cp-top">
          <div>
            <Link className="cp-back" to="/app">
              ← К разделам
            </Link>
            <h1 className="cp-title">Мой класс</h1>
            <p className="cp-sub">{lbSubtitle}</p>
            {myClasses.length > 1 && activeClassId != null && (
              <div className="cp-class-picker">
                <label>
                  Класс
                  <select
                    value={activeClassId}
                    onChange={(e) =>
                      setActiveClassId(Number(e.target.value))
                    }
                  >
                    {myClasses.map((c) => (
                      <option key={c.class_id} value={c.class_id}>
                        {c.class_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
          <div className="cp-meta">
            <span className="cp-badge">
              Место по монетам{myClasses.length > 0 ? ' (класс)' : ''}:{' '}
              {merged.find((r) => r.isMe)?.rank ?? '—'}
            </span>
          </div>
        </header>

        {user?.role === 'child' && myClassesLoaded && myClasses.length > 0 && (
          <section className="cp-section" aria-label="Ваши классы">
            <div className="cp-section-head">
              <h2 className="cp-section-title">
                {myClasses.length === 1 ? 'Ваш класс' : 'Ваши классы'}
              </h2>
              <p className="cp-section-hint">
                Вы уже состоите в {myClasses.length === 1 ? 'классе' : 'классах'} ниже
              </p>
            </div>
            <div className="cp-join-body">
              <ul className="cp-my-classes">
                {myClasses.map((c) => (
                  <li key={c.class_id}>
                    <span className="cp-my-class-pill">{c.class_name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {user?.role === 'child' &&
          myClassesLoaded &&
          myClasses.length === 0 && (
            <section className="cp-section" aria-label="Вступление по коду">
              <div className="cp-section-head">
                <h2 className="cp-section-title">Вступить в класс по коду</h2>
                <p className="cp-section-hint">
                  Введите код из кабинета учителя — сначала проверим класс, затем
                  можно вступить
                </p>
              </div>
              <div className="cp-join-body">
                <form className="cp-join-row" onSubmit={handleJoin}>
                  <input
                    className="space-input cp-join-input"
                    type="text"
                    placeholder="Например AB12CD34"
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Код приглашения"
                  />
                  <button
                    type="submit"
                    className="space-btn space-btn--primary"
                    disabled={
                      joinPending ||
                      previewLoading ||
                      !preview ||
                      (preview && preview.already_member)
                    }
                  >
                    {joinPending ? 'Вступаем…' : 'Вступить в класс'}
                  </button>
                </form>
                {previewLoading && credential.trim().length >= 6 && (
                  <p className="cp-teacher-muted" style={{ margin: 0 }}>
                    Проверяем код…
                  </p>
                )}
                {preview && !previewLoading && (
                  <div className="cp-join-preview" role="status">
                    <strong>{preview.class_name}</strong>
                    {preview.teacher_name ? (
                      <>Учитель: {preview.teacher_name}</>
                    ) : (
                      <>Класс найден</>
                    )}
                    {preview.already_member && (
                      <>
                        <br />
                        <span style={{ fontWeight: 700 }}>
                          Вы уже в этом классе.
                        </span>
                      </>
                    )}
                  </div>
                )}
                {previewErr &&
                credential.trim().length >= 6 &&
                !previewLoading ? (
                  <p className="space-form-error" style={{ margin: 0 }}>
                    {previewErr}
                  </p>
                ) : null}
                {joinErr ? (
                  <p className="space-form-error" style={{ margin: 0 }}>
                    {joinErr}
                  </p>
                ) : null}
                {joinMsg ? (
                  <p
                    style={{
                      margin: 0,
                      color: 'var(--cp-green-dark)',
                      fontWeight: 600,
                    }}
                  >
                    {joinMsg}
                  </p>
                ) : null}
              </div>
            </section>
          )}

        {user?.role === 'child' && !myClassesLoaded && (
          <p className="cp-sub" style={{ padding: '12px 24px 0', margin: 0 }}>
            Загрузка…
          </p>
        )}

        <div className="cp-main">
          <section className="cp-section" aria-labelledby="cp-lb-title">
              <div className="cp-section-head">
                <h2 id="cp-lb-title" className="cp-section-title">
                  Таблица лидеров по монетам
                </h2>
                <p className="cp-section-hint">
                  {myClasses.length === 0
                    ? 'Заработанные монеты за всё время — рейтинг строится среди одноклассников после вступления в класс.'
                    : 'Заработанные монеты за всё время среди учеников выбранного класса (топ по сумме начислений).'}
                </p>
              </div>
              <div className="cp-section-body">
                {lbErr ? (
                  <p className="space-form-error" style={{ margin: '12px 18px' }}>
                    {lbErr}
                  </p>
                ) : null}
                {!lbErr && leaderboard.length === 0 && myClasses.length > 0 ? (
                  <p className="cp-section-hint" style={{ padding: '12px 18px' }}>
                    Пока нет данных по заработанным монетам.
                  </p>
                ) : null}
                {!lbErr && myClasses.length === 0 ? (
                  <p className="cp-section-hint" style={{ padding: '12px 18px' }}>
                    После вступления в класс здесь появится таблица лидеров по монетам.
                  </p>
                ) : null}
                {leaderboard.length > 0 ? (
                  <div className="cp-lb-header" aria-hidden>
                    <span>Место</span>
                    <span>Ученик</span>
                    <span>Монеты</span>
                  </div>
                ) : null}
                {leaderboard.map((row, i) => {
                  const rank = row.rank ?? i + 1
                  const rankClass =
                    rank === 1
                      ? 'cp-rank--1'
                      : rank === 2
                        ? 'cp-rank--2'
                        : rank === 3
                          ? 'cp-rank--3'
                          : ''
                  const maxBar = Math.max(1, ...leaderboard.map((r) => r.points))
                  const pct = Math.round((row.points / maxBar) * 100)
                  return (
                    <div
                      key={`coin-${row.id}-${i}`}
                      className={`cp-lb-row${row.isMe ? ' cp-lb-row--me' : ''}`}
                    >
                      <div className={`cp-rank ${rankClass}`}>{rank}</div>
                      <div>
                        <div className="cp-lb-name">
                          {row.name}
                          {row.isMe && (
                            <span className="cp-badge" style={{ marginLeft: 8 }}>
                              Вы
                            </span>
                          )}
                        </div>
                        <div
                          className="cp-bar"
                          aria-hidden
                          title="Доля от максимума монет в классе (в топе)"
                        >
                          <div
                            className="cp-bar-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="cp-lb-points cp-lb-points--coins-only">
                        <span className="cp-lb-xp">{row.points} мон.</span>
                      </div>
                    </div>
                  )
                })}
              </div>
          </section>

          <section className="cp-section" aria-labelledby="cp-lb-xp-title">
              <div className="cp-section-head">
                <h2 id="cp-lb-xp-title" className="cp-section-title">
                  Таблица лидеров по ОП
                </h2>
                <p className="cp-section-hint">
                  Суммарный опыт в классе; при равном уровне выше тот, у кого больше ОП.
                </p>
              </div>
              <div className="cp-section-body">
                {xpLbErr ? (
                  <p className="space-form-error" style={{ margin: '12px 18px' }}>
                    {xpLbErr}
                  </p>
                ) : null}
                {!xpLbErr && leaderboardXp.length === 0 && myClasses.length > 0 ? (
                  <p className="cp-section-hint" style={{ padding: '12px 18px' }}>
                    Пока нет данных по ОП для класса.
                  </p>
                ) : null}
                {!xpLbErr && myClasses.length === 0 ? (
                  <p className="cp-section-hint" style={{ padding: '12px 18px' }}>
                    После вступления в класс здесь появится таблица лидеров по ОП.
                  </p>
                ) : null}
                {leaderboardXp.length > 0 ? (
                  <div className="cp-lb-header" aria-hidden>
                    <span>Место</span>
                    <span>Ученик</span>
                    <span>Уровень и ОП</span>
                  </div>
                ) : null}
                {leaderboardXp.map((row, i) => {
                  const rank = row.rank ?? i + 1
                  const rankClass =
                    rank === 1
                      ? 'cp-rank--1'
                      : rank === 2
                        ? 'cp-rank--2'
                        : rank === 3
                          ? 'cp-rank--3'
                          : ''
                  const barScore = row.level * 1_000_000 + row.points
                  const maxBar = Math.max(
                    1,
                    ...leaderboardXp.map((r) => r.level * 1_000_000 + r.points),
                  )
                  const pct = Math.round((barScore / maxBar) * 100)
                  return (
                    <div
                      key={`xp-${row.id}-${i}`}
                      className={`cp-lb-row${row.isMe ? ' cp-lb-row--me' : ''}`}
                    >
                      <div className={`cp-rank ${rankClass}`}>{rank}</div>
                      <div>
                        <div className="cp-lb-name">
                          {row.name}
                          {row.isMe && (
                            <span className="cp-badge" style={{ marginLeft: 8 }}>
                              Вы
                            </span>
                          )}
                        </div>
                        <div
                          className="cp-bar cp-bar--xp"
                          aria-hidden
                          title="Доля от максимума «уровень + ОП» в классе"
                        >
                          <div
                            className="cp-bar-fill cp-bar-fill--xp"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="cp-lb-points">
                        <span className="cp-lb-level">Ур. {row.level}</span>
                        <span className="cp-lb-xp">{row.points} ОП</span>
                      </div>
                    </div>
                  )
                })}
              </div>
          </section>
        </div>
      </div>
    </div>
  )
}
