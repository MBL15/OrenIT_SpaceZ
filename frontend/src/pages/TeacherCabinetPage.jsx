import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { apiFetch, parseErrorDetail } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import './ClassPage.css'

export default function TeacherCabinetPage() {
  const { user } = useAuth()
  const [classes, setClasses] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [newClassName, setNewClassName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [students, setStudents] = useState([])
  const [assignments, setAssignments] = useState([])
  const [lessons, setLessons] = useState([])
  const [lessonDetail, setLessonDetail] = useState(null)
  const [pickLessonId, setPickLessonId] = useState('')
  const [pickTaskId, setPickTaskId] = useState('')
  const [assignNote, setAssignNote] = useState('')
  const [assignRewardCoins, setAssignRewardCoins] = useState('0')
  const [assignRewardXp, setAssignRewardXp] = useState('0')
  const [banner, setBanner] = useState('')
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(false)
  const [deletingAssignmentId, setDeletingAssignmentId] = useState(null)

  const loadClasses = useCallback(async () => {
    const res = await apiFetch('/teacher/classes')
    if (!res.ok) {
      setErr(parseErrorDetail(await res.json().catch(() => ({}))))
      return
    }
    const data = await res.json()
    setClasses(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => {
    if (user?.role !== 'teacher') return
    loadClasses()
  }, [user, loadClasses])

  useEffect(() => {
    if (user?.role !== 'teacher') return
    ;(async () => {
      const res = await apiFetch('/lessons')
      if (!res.ok) return
      const data = await res.json().catch(() => [])
      setLessons(Array.isArray(data) ? data : [])
    })()
  }, [user])

  const loadClassDetails = useCallback(async (classId) => {
    if (!classId) return
    setErr('')
    const [invRes, stRes, asRes] = await Promise.all([
      apiFetch(`/teacher/classes/${classId}/invite`),
      apiFetch(`/teacher/classes/${classId}/students`),
      apiFetch(`/teacher/classes/${classId}/assignments`),
    ])
    if (invRes.ok) {
      const inv = await invRes.json().catch(() => ({}))
      setInviteCode(inv.invite_code || '')
      setInviteToken(inv.invite_token || '')
    } else {
      setInviteCode('')
      setInviteToken('')
      setErr(parseErrorDetail(await invRes.json().catch(() => ({}))))
    }
    if (stRes.ok) {
      const s = await stRes.json().catch(() => [])
      setStudents(Array.isArray(s) ? s : [])
    } else setStudents([])
    if (asRes.ok) {
      const a = await asRes.json().catch(() => [])
      setAssignments(Array.isArray(a) ? a : [])
    } else setAssignments([])
  }, [])

  useEffect(() => {
    if (selectedId) loadClassDetails(selectedId)
  }, [selectedId, loadClassDetails])

  useEffect(() => {
    if (!pickLessonId) {
      setLessonDetail(null)
      setPickTaskId('')
      return
    }
    let cancelled = false
    ;(async () => {
      const res = await apiFetch(`/lessons/${pickLessonId}`)
      if (cancelled) return
      if (!res.ok) {
        setLessonDetail(null)
        return
      }
      const d = await res.json().catch(() => null)
      setLessonDetail(d)
      const first = d?.task_templates?.[0]?.id
      setPickTaskId(first != null ? String(first) : '')
    })()
    return () => {
      cancelled = true
    }
  }, [pickLessonId])

  if (user?.role === 'admin') {
    return <Navigate to="/app/admin" replace />
  }
  if (user?.role !== 'teacher') {
    return <Navigate to="/app/class" replace />
  }

  const handleCreateClass = async (e) => {
    e.preventDefault()
    setBanner('')
    setErr('')
    const name = newClassName.trim()
    if (!name) return
    setPending(true)
    try {
      const res = await apiFetch('/teacher/classes', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(parseErrorDetail(data))
        return
      }
      setNewClassName('')
      setBanner(`Класс «${data.name}» создан`)
      await loadClasses()
      if (data.id) setSelectedId(data.id)
    } finally {
      setPending(false)
    }
  }

  const copyText = async (label, text) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setBanner(`${label} скопирован в буфер`)
    } catch {
      setBanner('Не удалось скопировать — выделите текст вручную')
    }
  }

  const refreshInvite = async () => {
    if (!selectedId) return
    setErr('')
    const res = await apiFetch(`/teacher/classes/${selectedId}/invite/refresh`, {
      method: 'POST',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(parseErrorDetail(data))
      return
    }
    setInviteCode(data.invite_code || '')
    setInviteToken(data.invite_token || '')
    setBanner('Код приглашения обновлён — старый код больше не действует')
  }

  const submitAssignment = async (e) => {
    e.preventDefault()
    setErr('')
    setBanner('')
    if (!selectedId || !pickTaskId) {
      setErr('Выберите урок и задание')
      return
    }
    const task_template_id = Number(pickTaskId)
    if (Number.isNaN(task_template_id)) return
    let reward_coins = parseInt(String(assignRewardCoins).trim(), 10)
    let reward_xp = parseInt(String(assignRewardXp).trim(), 10)
    if (!Number.isFinite(reward_coins) || reward_coins < 0) reward_coins = 0
    if (!Number.isFinite(reward_xp) || reward_xp < 0) reward_xp = 0
    reward_coins = Math.min(100, reward_coins)
    reward_xp = Math.min(1000, reward_xp)
    setPending(true)
    try {
      const res = await apiFetch(`/teacher/classes/${selectedId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          task_template_id,
          note: assignNote.trim() || null,
          reward_coins,
          reward_xp,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(parseErrorDetail(data))
        return
      }
      setAssignNote('')
      setAssignRewardCoins('0')
      setAssignRewardXp('0')
      setBanner('Задание назначено классу')
      await loadClassDetails(selectedId)
    } finally {
      setPending(false)
    }
  }

  const deleteAssignment = async (assignmentId) => {
    if (!selectedId) return
    if (
      !window.confirm(
        'Удалить это задание? Оно пропадёт у учеников из списка назначенных.',
      )
    ) {
      return
    }
    setErr('')
    setBanner('')
    setDeletingAssignmentId(assignmentId)
    try {
      const res = await apiFetch(
        `/teacher/classes/${selectedId}/assignments/${assignmentId}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErr(parseErrorDetail(data))
        return
      }
      setBanner('Задание удалено')
      await loadClassDetails(selectedId)
    } finally {
      setDeletingAssignmentId(null)
    }
  }

  const selectedClass = classes.find((c) => c.id === selectedId)

  return (
    <div className="cp-wrap">
      <div className="cp-panel">
        <header className="cp-teacher-head">
          <Link className="cp-back" to="/app">
            ← К разделам
          </Link>
          <h1 className="cp-title">Кабинет учителя</h1>
          <p className="cp-sub">Классы, код приглашения и задания</p>
        </header>

        {(banner || err) && (
          <div className="cp-teacher-alerts">
            {banner ? <p className="cp-teacher-banner">{banner}</p> : null}
            {err ? <p className="cp-teacher-err">{err}</p> : null}
          </div>
        )}

        <div className="cp-teacher-grid">
          <aside className="cp-teacher-side">
            <h2 className="cp-teacher-h2">Мои классы</h2>
            <form className="cp-teacher-form" onSubmit={handleCreateClass}>
              <input
                className="space-input"
                placeholder="Название нового класса"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
              />
              <button
                type="submit"
                className="space-btn space-btn--primary"
                disabled={pending}
              >
                Создать класс
              </button>
            </form>
            <ul className="cp-teacher-class-list">
              {classes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`cp-teacher-class-btn${selectedId === c.id ? ' cp-teacher-class-btn--on' : ''}`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
            {classes.length === 0 && (
              <p className="cp-teacher-muted">Пока нет классов — создайте первый.</p>
            )}
          </aside>

          <main>
            {!selectedId ? (
              <p className="cp-teacher-muted">Выберите класс слева.</p>
            ) : (
              <>
                <h2 className="cp-teacher-h2">{selectedClass?.name}</h2>

                <div className="cp-teacher-class-main-layout">
                  <div className="cp-teacher-class-primary">
                    <section className="cp-teacher-block" aria-label="Приглашение">
                      <h3 className="cp-teacher-h3">Код для учеников</h3>
                      <p className="cp-teacher-muted">
                        Ученик открывает «Мой класс», вводит код и сначала видит название
                        класса, затем подтверждает вступление. Можно продиктовать код
                        или скопировать.
                      </p>
                      <div className="cp-teacher-code-row">
                        <div className="cp-teacher-code" aria-live="polite">
                          {inviteCode || '—'}
                        </div>
                        <button
                          type="button"
                          className="space-btn space-btn--primary"
                          onClick={() => copyText('Код', inviteCode)}
                          disabled={!inviteCode}
                        >
                          Копировать код
                        </button>
                        <button
                          type="button"
                          className="space-btn space-btn--outline"
                          onClick={refreshInvite}
                        >
                          Новый код
                        </button>
                      </div>
                      <details className="cp-teacher-token-details">
                        <summary>Полный токен (редко нужен)</summary>
                        <code className="cp-teacher-token-long">{inviteToken || '—'}</code>
                        <button
                          type="button"
                          className="space-btn space-btn--ghost"
                          style={{ marginTop: 8 }}
                          onClick={() => copyText('Токен', inviteToken)}
                          disabled={!inviteToken}
                        >
                          Копировать токен
                        </button>
                      </details>
                    </section>

                    <section className="cp-teacher-block" aria-label="Назначить задание">
                  <h3 className="cp-teacher-h3">Назначить задание</h3>
                  <p className="cp-teacher-muted" style={{ marginTop: 0, marginBottom: 12 }}>
                    В каталоге — три задания из «Основы информатики — Асгард» (как в уроке на карте:
                    те же тексты и варианты). Ученик открывает их только здесь, по назначению; это не
                    смешивается с прохождением урока на карте. Если удалить назначение и создать
                    снова — для ученика это новое задание, награда снова возможна.
                  </p>
                  <form className="cp-teacher-assign" onSubmit={submitAssignment}>
                    <label className="cp-teacher-label">
                      Урок
                      <select
                        className="space-input"
                        value={pickLessonId}
                        onChange={(e) => setPickLessonId(e.target.value)}
                      >
                        <option value="">—</option>
                        {lessons.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="cp-teacher-label">
                      Задача (шаблон)
                      <select
                        className="space-input"
                        value={pickTaskId}
                        onChange={(e) => setPickTaskId(e.target.value)}
                        disabled={!lessonDetail?.task_templates?.length}
                      >
                        <option value="">—</option>
                        {(lessonDetail?.task_templates || []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title || `Задача #${t.id}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="cp-teacher-label">
                      Комментарий (необязательно)
                      <input
                        className="space-input"
                        value={assignNote}
                        onChange={(e) => setAssignNote(e.target.value)}
                        maxLength={2000}
                      />
                    </label>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 12,
                        marginBottom: 4,
                      }}
                    >
                      <label className="cp-teacher-label" style={{ marginBottom: 0 }}>
                        Бонус монет (за верный ответ, один раз)
                        <input
                          className="space-input"
                          type="number"
                          min={0}
                          max={100}
                          inputMode="numeric"
                          value={assignRewardCoins}
                          onChange={(e) => setAssignRewardCoins(e.target.value)}
                        />
                        <span className="cp-teacher-muted" style={{ fontSize: 11, marginTop: 4 }}>
                          макс. 100
                        </span>
                      </label>
                      <label className="cp-teacher-label" style={{ marginBottom: 0 }}>
                        Бонус XP (за верный ответ, один раз)
                        <input
                          className="space-input"
                          type="number"
                          min={0}
                          max={1000}
                          inputMode="numeric"
                          value={assignRewardXp}
                          onChange={(e) => setAssignRewardXp(e.target.value)}
                        />
                        <span className="cp-teacher-muted" style={{ fontSize: 11, marginTop: 4 }}>
                          макс. 1000
                        </span>
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="space-btn space-btn--primary"
                      disabled={pending}
                    >
                      Назначить
                    </button>
                  </form>
                    </section>

                    <section className="cp-teacher-block" aria-label="Назначенные">
                      <h3 className="cp-teacher-h3">Назначенные задания</h3>
                      <ul className="cp-teacher-assignments-list">
                        {assignments.map((a) => (
                          <li key={a.id} className="cp-teacher-assignment-row">
                            <div className="cp-teacher-assignment-body">
                              <span className="cp-teacher-assignment-title">
                                {a.lesson_title}
                                {a.task_title ? ` — ${a.task_title}` : ''}
                              </span>
                              {(a.reward_coins > 0 || a.reward_xp > 0) && (
                                <span className="cp-teacher-muted cp-teacher-assignment-meta">
                                  +{a.reward_coins || 0} мон., +{a.reward_xp || 0} XP
                                </span>
                              )}
                              {a.note ? (
                                <span className="cp-teacher-muted cp-teacher-assignment-meta">
                                  {a.note}
                                </span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="cp-teacher-assignment-delete"
                              onClick={() => deleteAssignment(a.id)}
                              disabled={deletingAssignmentId === a.id}
                              aria-label={`Удалить задание: ${a.lesson_title}`}
                            >
                              {deletingAssignmentId === a.id ? '…' : 'Удалить'}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {assignments.length === 0 && (
                        <p className="cp-teacher-muted">Пока нет назначений.</p>
                      )}
                    </section>
                  </div>

                  <aside
                    className="cp-teacher-students-aside"
                    aria-label="Ученики класса"
                  >
                    <h3 className="cp-teacher-h3">Ученики ({students.length})</h3>
                    {students.length === 0 ? (
                      <p className="cp-teacher-muted" style={{ marginTop: 0 }}>
                        Пока никто не вступил по коду.
                      </p>
                    ) : (
                      <div className="cp-teacher-table-wrap">
                        <table className="cp-teacher-students-table">
                          <thead>
                            <tr>
                              <th scope="col">Ученик</th>
                              <th scope="col" className="cp-teacher-th-num">
                                Попыток
                              </th>
                              <th scope="col" className="cp-teacher-th-num">
                                Верных
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {students.map((row) => (
                              <tr key={row.user?.id}>
                                <td>
                                  {row.user?.display_name || row.user?.login || '—'}
                                </td>
                                <td className="cp-teacher-td-num">{row.total_attempts ?? 0}</td>
                                <td className="cp-teacher-td-num">{row.correct_attempts ?? 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </aside>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
