import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { apiFetch, parseErrorDetail } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import './ClassPage.css'

function hwStatusLabel(status) {
  if (status === 'completed') return 'Верно решено'
  if (status === 'in_progress') return 'Пока без верного ответа'
  return 'Не начинал'
}

/** Локальная дата YYYY-MM-DD для сравнения с полями input type="date". */
function createdAtLocalYmd(iso) {
  if (iso == null || iso === '') return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function hwRowMatchesDateRange(row, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true
  const ymd = createdAtLocalYmd(row.created_at)
  if (!ymd) return true
  if (dateFrom && ymd < dateFrom) return false
  if (dateTo && ymd > dateTo) return false
  return true
}

export default function TeacherCabinetPage() {
  const { user } = useAuth()
  const [cabinetTab, setCabinetTab] = useState('class')
  const [classes, setClasses] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [newClassName, setNewClassName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [students, setStudents] = useState([])
  const [lessons, setLessons] = useState([])
  const [lessonDetail, setLessonDetail] = useState(null)
  const [pickLessonId, setPickLessonId] = useState('')
  /** Блок заданий: можно накопить задачи из разных уроков, затем назначить одним запросом */
  const [batchTasks, setBatchTasks] = useState([])
  const [assignNote, setAssignNote] = useState('')
  const [assignRewardCoins, setAssignRewardCoins] = useState('25')
  const [assignRewardXp, setAssignRewardXp] = useState('0')
  const [banner, setBanner] = useState('')
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(false)

  const [hwHistory, setHwHistory] = useState([])
  const [hwLoading, setHwLoading] = useState(false)
  const [hwErr, setHwErr] = useState('')
  const [hwSelected, setHwSelected] = useState(null)
  const [hwProgress, setHwProgress] = useState([])
  const [hwProgressLoading, setHwProgressLoading] = useState(false)
  const [hwProgressErr, setHwProgressErr] = useState('')
  const [deletingAssignmentId, setDeletingAssignmentId] = useState(null)
  const [deletingBlockId, setDeletingBlockId] = useState(null)
  const [hwDateFrom, setHwDateFrom] = useState('')
  const [hwDateTo, setHwDateTo] = useState('')

  const filteredHwHistory = useMemo(() => {
    let from = hwDateFrom
    let to = hwDateTo
    if (from && to && from > to) {
      ;[from, to] = [to, from]
    }
    return hwHistory.filter((row) => hwRowMatchesDateRange(row, from, to))
  }, [hwHistory, hwDateFrom, hwDateTo])

  useEffect(() => {
    setHwSelected((prev) => {
      if (!prev) return prev
      return filteredHwHistory.some((r) => r.id === prev.id) ? prev : null
    })
  }, [filteredHwHistory])

  /** В журнале ДЗ: одна кнопка «Удалить весь блок» на блок — у первой строки с этим block_id. */
  const hwBlockDeleteAnchorId = useMemo(() => {
    const m = new Map()
    for (const a of filteredHwHistory) {
      if (a.block_id != null && !m.has(a.block_id)) {
        m.set(a.block_id, a.id)
      }
    }
    return m
  }, [filteredHwHistory])

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

  const refreshHwHistory = useCallback(async () => {
    const res = await apiFetch('/teacher/assignments/history')
    if (!res.ok) return
    const data = await res.json().catch(() => [])
    const list = Array.isArray(data) ? data : []
    setHwHistory(list)
    setHwSelected((prev) => {
      if (!prev) return null
      return list.some((r) => r.id === prev.id) ? prev : null
    })
  }, [])

  const loadClassDetails = useCallback(async (classId) => {
    if (!classId) return
    setErr('')
    const [invRes, stRes] = await Promise.all([
      apiFetch(`/teacher/classes/${classId}/invite`),
      apiFetch(`/teacher/classes/${classId}/students`),
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
  }, [])

  useEffect(() => {
    if (selectedId) loadClassDetails(selectedId)
  }, [selectedId, loadClassDetails])

  useEffect(() => {
    setBatchTasks([])
  }, [selectedId])

  useEffect(() => {
    if (user?.role !== 'teacher' || cabinetTab !== 'homework') return
    let cancelled = false
    setHwErr('')
    setHwLoading(true)
    ;(async () => {
      const res = await apiFetch('/teacher/assignments/history')
      if (cancelled) return
      if (!res.ok) {
        setHwErr(parseErrorDetail(await res.json().catch(() => ({}))))
        setHwHistory([])
        setHwLoading(false)
        return
      }
      const data = await res.json().catch(() => [])
      setHwHistory(Array.isArray(data) ? data : [])
      setHwLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.role, cabinetTab])

  useEffect(() => {
    if (!hwSelected || cabinetTab !== 'homework') {
      setHwProgress([])
      setHwProgressErr('')
      return
    }
    let cancelled = false
    setHwProgressErr('')
    setHwProgressLoading(true)
    const { class_id: cid, id: aid } = hwSelected
    ;(async () => {
      const res = await apiFetch(
        `/teacher/classes/${cid}/assignments/${aid}/progress`,
      )
      if (cancelled) return
      if (!res.ok) {
        setHwProgressErr(parseErrorDetail(await res.json().catch(() => ({}))))
        setHwProgress([])
        setHwProgressLoading(false)
        return
      }
      const data = await res.json().catch(() => [])
      setHwProgress(Array.isArray(data) ? data : [])
      setHwProgressLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [hwSelected, cabinetTab])

  useEffect(() => {
    if (!pickLessonId) {
      setLessonDetail(null)
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

  const toggleBatchTask = (t) => {
    const id = t.id
    const title = t.title || `Задача #${id}`
    setBatchTasks((prev) => {
      const i = prev.findIndex((x) => x.id === id)
      if (i >= 0) return prev.filter((_, j) => j !== i)
      return [...prev, { id, title }]
    })
  }

  const submitAssignment = async (e) => {
    e.preventDefault()
    setErr('')
    setBanner('')
    if (!selectedId) {
      setErr('Выберите класс')
      return
    }
    const task_template_ids = batchTasks.map((x) => x.id)
    if (task_template_ids.length === 0) {
      setErr('Отметьте хотя бы одно задание в блоке')
      return
    }
    let reward_coins = Math.min(100, Math.max(0, Math.round(Number(assignRewardCoins))))
    let reward_xp = Math.min(1000, Math.max(0, Math.round(Number(assignRewardXp))))
    if (Number.isNaN(reward_coins)) reward_coins = 0
    if (Number.isNaN(reward_xp)) reward_xp = 0
    setPending(true)
    try {
      const res = await apiFetch(
        `/teacher/classes/${selectedId}/assignments/batch`,
        {
          method: 'POST',
          body: JSON.stringify({
            task_template_ids,
            note: assignNote.trim() || null,
            reward_coins,
            reward_xp,
          }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(parseErrorDetail(data))
        return
      }
      const n = Array.isArray(data) ? data.length : 0
      setAssignNote('')
      setBatchTasks([])
      setBanner(
        n === 1
          ? 'Задание назначено классу'
          : `Назначено заданий в блоке: ${n}`,
      )
      await loadClassDetails(selectedId)
    } finally {
      setPending(false)
    }
  }

  const handleDeleteAssignment = async (a) => {
    const classId = a.class_id
    if (classId == null) return
    const ok = window.confirm(
      'Удалить только это задание из назначенных? Прогресс учеников по нему будет удалён.',
    )
    if (!ok) return
    setErr('')
    setBanner('')
    setDeletingAssignmentId(a.id)
    try {
      const res = await apiFetch(
        `/teacher/classes/${classId}/assignments/${a.id}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        setErr(parseErrorDetail(await res.json().catch(() => ({}))))
        return
      }
      setBanner('Задание снято с класса')
      if (selectedId === classId) {
        await loadClassDetails(selectedId)
      }
      setHwSelected((prev) => (prev?.id === a.id ? null : prev))
      await refreshHwHistory()
    } finally {
      setDeletingAssignmentId(null)
    }
  }

  const handleDeleteBlock = async (blockId, classId) => {
    if (classId == null || blockId == null) return
    const ok = window.confirm(
      'Удалить весь блок: все задания из этого пакета и связанный прогресс учеников?',
    )
    if (!ok) return
    setErr('')
    setBanner('')
    setDeletingBlockId(blockId)
    try {
      const res = await apiFetch(
        `/teacher/classes/${classId}/assignment-blocks/${blockId}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        setErr(parseErrorDetail(await res.json().catch(() => ({}))))
        return
      }
      setBanner('Блок назначений удалён')
      if (selectedId === classId) {
        await loadClassDetails(selectedId)
      }
      setHwSelected((prev) =>
        prev && prev.block_id === blockId && prev.class_id === classId ? null : prev,
      )
      await refreshHwHistory()
    } finally {
      setDeletingBlockId(null)
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

        <div className="cp-teacher-tabs" role="tablist" aria-label="Разделы кабинета">
          <button
            type="button"
            role="tab"
            aria-selected={cabinetTab === 'class'}
            className={`cp-teacher-tab${cabinetTab === 'class' ? ' cp-teacher-tab--on' : ''}`}
            onClick={() => setCabinetTab('class')}
          >
            Класс и назначения
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cabinetTab === 'homework'}
            className={`cp-teacher-tab${cabinetTab === 'homework' ? ' cp-teacher-tab--on' : ''}`}
            onClick={() => setCabinetTab('homework')}
          >
            Домашние задания
          </button>
        </div>

        {(banner || err) && (
          <div className="cp-teacher-alerts">
            {banner ? <p className="cp-teacher-banner">{banner}</p> : null}
            {err ? <p className="cp-teacher-err">{err}</p> : null}
          </div>
        )}

        {cabinetTab === 'homework' ? (
          <div className="cp-teacher-hw">
            <p className="cp-teacher-hw-intro">
              Выберите назначенное ранее задание слева — справа отобразится список учеников
              класса. Оценка по заданию: <strong>5</strong> без ошибок,{' '}
              <strong>4</strong> при одной ошибке, <strong>3</strong> при двух,{' '}
              <strong>2</strong> при трёх и более (минимальная оценка 2). Снять одно
              задание или весь блок с класса можно кнопками справа от записи в списке.
            </p>
            {hwErr ? <p className="cp-teacher-err">{hwErr}</p> : null}
            {hwLoading ? (
              <p className="cp-teacher-muted">Загрузка списка…</p>
            ) : hwHistory.length === 0 ? (
              <p className="cp-teacher-muted">
                Пока нет назначенных заданий. Назначьте задание во вкладке «Класс и
                назначения».
              </p>
            ) : (
              <>
                <div
                  className="cp-teacher-hw-filters"
                  role="search"
                  aria-label="Фильтр списка по дате назначения"
                >
                  <label className="cp-teacher-hw-filter-label">
                    <span className="cp-teacher-hw-filter-text">С даты</span>
                    <input
                      type="date"
                      className="cp-teacher-hw-date-input"
                      value={hwDateFrom}
                      onChange={(e) => setHwDateFrom(e.target.value)}
                    />
                  </label>
                  <label className="cp-teacher-hw-filter-label">
                    <span className="cp-teacher-hw-filter-text">По дату</span>
                    <input
                      type="date"
                      className="cp-teacher-hw-date-input"
                      value={hwDateTo}
                      onChange={(e) => setHwDateTo(e.target.value)}
                    />
                  </label>
                  {(hwDateFrom || hwDateTo) && (
                    <button
                      type="button"
                      className="cp-teacher-hw-filter-reset"
                      onClick={() => {
                        setHwDateFrom('')
                        setHwDateTo('')
                      }}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                {filteredHwHistory.length === 0 ? (
                  <p className="cp-teacher-muted" style={{ margin: '0 0 12px' }}>
                    Нет записей за выбранные даты. Измените период или сбросьте
                    фильтр.
                  </p>
                ) : (
              <div className="cp-teacher-hw-layout">
                <div>
                  <ul className="cp-teacher-hw-list">
                    {filteredHwHistory.map((row) => (
                      <li key={row.id}>
                        <div className="cp-teacher-hw-list-row">
                          <button
                            type="button"
                            className={`cp-teacher-hw-item${hwSelected?.id === row.id ? ' cp-teacher-hw-item--on' : ''}`}
                            onClick={() => setHwSelected(row)}
                          >
                            <span className="cp-teacher-hw-item-title">
                              {row.class_name} · {row.lesson_title}
                            </span>
                            <span className="cp-teacher-hw-item-meta">
                              {row.task_title || 'Задание'}
                              {row.created_at
                                ? ` · ${new Date(row.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`
                                : ''}
                              <br />
                              Награда: {row.reward_coins ?? 0} мон.
                              {row.reward_xp ? `, ${row.reward_xp} ОП` : ''}
                            </span>
                          </button>
                          <div className="cp-teacher-hw-item-actions">
                            {row.block_id != null &&
                              hwBlockDeleteAnchorId.get(row.block_id) === row.id && (
                                <button
                                  type="button"
                                  className="space-btn space-btn--outline cp-teacher-hw-del-block"
                                  disabled={
                                    deletingAssignmentId != null ||
                                    deletingBlockId != null
                                  }
                                  aria-label="Удалить весь блок заданий"
                                  onClick={() =>
                                    void handleDeleteBlock(row.block_id, row.class_id)
                                  }
                                >
                                  {deletingBlockId === row.block_id
                                    ? 'Удаление…'
                                    : 'Удалить весь блок'}
                                </button>
                              )}
                            <button
                              type="button"
                              className="space-btn space-btn--ghost cp-teacher-hw-del"
                              disabled={
                                deletingAssignmentId != null ||
                                deletingBlockId != null
                              }
                              aria-label="Удалить только это задание"
                              onClick={() => void handleDeleteAssignment(row)}
                            >
                              {deletingAssignmentId === row.id
                                ? 'Удаление…'
                                : 'Удалить задание'}
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="cp-teacher-hw-panel">
                  {!hwSelected ? (
                    <p className="cp-teacher-muted" style={{ margin: 0 }}>
                      Выберите задание в списке слева.
                    </p>
                  ) : (
                    <>
                      <h3>
                        {hwSelected.class_name} —{' '}
                        {hwSelected.task_title || hwSelected.lesson_title}
                      </h3>
                      {hwProgressErr ? (
                        <p className="cp-teacher-err">{hwProgressErr}</p>
                      ) : null}
                      {hwProgressLoading ? (
                        <p className="cp-teacher-muted">Загрузка…</p>
                      ) : (
                        <div className="cp-teacher-hw-table-wrap">
                          <table className="cp-teacher-hw-table">
                            <thead>
                              <tr>
                                <th>Ученик</th>
                                <th>Статус</th>
                                <th>Ошибок</th>
                                <th>Оценка</th>
                                <th>Всего попыток</th>
                                <th>Бонус</th>
                              </tr>
                            </thead>
                            <tbody>
                              {hwProgress.map((p) => (
                                <tr key={p.user_id}>
                                  <td>
                                    <strong>
                                      {p.display_name || p.login}
                                    </strong>
                                    <span
                                      className="cp-teacher-muted"
                                      style={{ display: 'block', fontSize: 12 }}
                                    >
                                      {p.login}
                                    </span>
                                  </td>
                                  <td>
                                    <span
                                      className={`cp-teacher-hw-badge${
                                        p.status === 'completed'
                                          ? ' cp-teacher-hw-badge--ok'
                                          : p.status === 'in_progress'
                                            ? ' cp-teacher-hw-badge--wait'
                                            : ' cp-teacher-hw-badge--new'
                                      }`}
                                    >
                                      {hwStatusLabel(p.status)}
                                    </span>
                                  </td>
                                  <td>{p.wrong_attempts ?? '—'}</td>
                                  <td>
                                    <strong>
                                      {p.grade != null ? p.grade : '—'}
                                    </strong>
                                  </td>
                                  <td>{p.attempts}</td>
                                  <td>
                                    {p.bonus_claimed
                                      ? 'получен'
                                      : p.status === 'completed'
                                        ? 'не получен'
                                        : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {hwProgress.length === 0 && !hwProgressLoading ? (
                            <p className="cp-teacher-muted" style={{ marginTop: 8 }}>
                              В классе пока нет учеников.
                            </p>
                          ) : null}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
                )}
              </>
            )}
          </div>
        ) : (
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

                <section className="cp-teacher-block" aria-label="Ученики">
                  <h3 className="cp-teacher-h3">Ученики ({students.length})</h3>
                  <ul className="cp-teacher-students">
                    {students.map((row) => (
                      <li key={row.user?.id}>
                        <strong>{row.user?.display_name || row.user?.login}</strong>
                        <span className="cp-teacher-muted" style={{ display: 'inline', margin: 0 }}>
                          {' '}
                          · попыток: {row.total_attempts}, верных: {row.correct_attempts}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {students.length === 0 && (
                    <p className="cp-teacher-muted">Пока никто не вступил по коду.</p>
                  )}
                </section>

                <section className="cp-teacher-block" aria-label="Назначить задания">
                  <h3 className="cp-teacher-h3">Назначить блок заданий</h3>
                  <p className="cp-teacher-muted" style={{ marginTop: 0, marginBottom: 12 }}>
                    Выберите урок, отметьте одно или несколько заданий. Можно переключить урок и
                    добавить в тот же блок задачи из другого урока — затем одним нажатием
                    назначить весь блок классу. Доступны только шаблоны из опубликованных уроков.
                  </p>
                  {batchTasks.length > 0 ? (
                    <div style={{ marginBottom: 12 }}>
                      <p className="cp-teacher-muted" style={{ margin: '0 0 6px' }}>
                        В блоке ({batchTasks.length}):
                      </p>
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: 18,
                          fontSize: 13,
                          color: '#33691e',
                        }}
                      >
                        {batchTasks.map((t) => (
                          <li key={t.id}>{t.title}</li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="space-btn space-btn--ghost"
                        style={{ marginTop: 8 }}
                        onClick={() => setBatchTasks([])}
                      >
                        Очистить блок
                      </button>
                    </div>
                  ) : null}
                  <form className="cp-teacher-assign" onSubmit={submitAssignment}>
                    <label className="cp-teacher-label">
                      Урок (подбор задач)
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
                    {lessonDetail?.task_templates?.length ? (
                      <div className="cp-teacher-label" style={{ marginBottom: 12 }}>
                        <span style={{ display: 'block', marginBottom: 8 }}>
                          Задачи урока (отметьте нужные)
                        </span>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            maxHeight: 220,
                            overflowY: 'auto',
                            padding: '10px 12px',
                            border: '1px solid var(--cp-border, #e3e6e8)',
                            borderRadius: 10,
                            background: '#fafafa',
                          }}
                        >
                          {(lessonDetail.task_templates || []).map((t) => (
                            <label
                              key={t.id}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                cursor: 'pointer',
                                fontSize: 14,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={batchTasks.some((x) => x.id === t.id)}
                                onChange={() => toggleBatchTask(t)}
                              />
                              <span>{t.title || `Задача #${t.id}`}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : pickLessonId ? (
                      <p className="cp-teacher-muted">В этом уроке нет шаблонов задач.</p>
                    ) : null}
                    <label className="cp-teacher-label">
                      Комментарий (необязательно)
                      <input
                        className="space-input"
                        value={assignNote}
                        onChange={(e) => setAssignNote(e.target.value)}
                        maxLength={2000}
                      />
                    </label>
                    <label className="cp-teacher-label">
                      Монеты за верное решение (один раз на ученика)
                      <input
                        className="space-input"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        value={assignRewardCoins}
                        onChange={(e) => setAssignRewardCoins(e.target.value)}
                      />
                      <span className="cp-teacher-muted" style={{ display: 'block', marginTop: 4 }}>
                        Начисляются на баланс в профиле — можно тратить в магазине скинов (0–100)
                      </span>
                    </label>
                    <label className="cp-teacher-label">
                      Бонус ОП (необязательно)
                      <input
                        className="space-input"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={1000}
                        value={assignRewardXp}
                        onChange={(e) => setAssignRewardXp(e.target.value)}
                      />
                    </label>
                    <button
                      type="submit"
                      className="space-btn space-btn--primary"
                      disabled={pending || batchTasks.length === 0}
                    >
                      {batchTasks.length <= 1
                        ? 'Назначить'
                        : `Назначить блок (${batchTasks.length})`}
                    </button>
                  </form>
                </section>
              </>
            )}
          </main>
        </div>
        )}
      </div>
    </div>
  )
}
