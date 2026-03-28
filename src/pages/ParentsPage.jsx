import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { apiFetch, parseErrorDetail } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import ParentAgeCheckForm from '../components/ParentAgeCheckForm.jsx'
import { clearParentUnlock, isParentUnlocked } from '../lib/parentUnlock.js'
import './ParentsPage.css'

function shortLessonTitle(title, maxLen = 12) {
  const t = (title || '').trim()
  if (t.length <= maxLen) return t || '—'
  return `${t.slice(0, maxLen - 1)}…`
}

function formatAssignedAt(iso) {
  if (iso == null || iso === '') return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    return d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return String(iso)
  }
}

function journalStatusRu(status) {
  if (status === 'not_started') return 'Не начато'
  if (status === 'in_progress') return 'В работе'
  return 'Сдано верно'
}

function TasksBarChart({ points, caption, unit }) {
  if (!points.length) {
    return (
      <p className="pp-section-hint" style={{ marginTop: 0 }}>
        Пока нет данных о попытках по урокам.
      </p>
    )
  }
  const max = Math.max(...points.map((p) => p.value), 1)
  const total = points.reduce((a, p) => a + p.value, 0)

  const W = 520
  const H = 220
  const padL = 36
  const padR = 16
  const padT = 16
  const padB = 44
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const n = points.length
  const gap = n > 8 ? 4 : 8
  const barW = (chartW - gap * (n - 1)) / n

  const bars = points.map((p, i) => {
    const h = (p.value / max) * chartH
    const x = padL + i * (barW + gap)
    const y = padT + chartH - h
    return { ...p, x, y, w: barW, h }
  })

  const ariaSummary = `${caption}. Всего попыток: ${total}. ${points.map((p) => `${p.label}: ${p.value}`).join(', ')}.`

  return (
    <div className="pp-chart-wrap">
      <svg
        className="pp-chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaSummary}
      >
        <title>Диаграмма попыток по урокам</title>
        <desc>{ariaSummary}</desc>
        <line
          x1={padL}
          y1={padT + chartH}
          x2={padL + chartW}
          y2={padT + chartH}
          stroke="#cfd8dc"
          strokeWidth="1"
        />
        {bars.map((b) => (
          <g key={b.label}>
            <rect
              className="pp-bar"
              x={b.x}
              y={b.y}
              width={b.w}
              height={Math.max(b.h, 2)}
              rx={6}
              fill="url(#pp-bar-grad)"
            />
            <text
              className="pp-bar-label"
              x={b.x + b.w / 2}
              y={H - 12}
              textAnchor="middle"
            >
              {b.label}
            </text>
            {b.value > 0 ? (
              <text
                className="pp-bar-value"
                x={b.x + b.w / 2}
                y={b.y - 6}
                textAnchor="middle"
              >
                {b.value}
              </text>
            ) : null}
          </g>
        ))}
        <defs>
          <linearGradient id="pp-bar-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#66bb6a" />
            <stop offset="100%" stopColor="#2e7d32" />
          </linearGradient>
        </defs>
      </svg>
      <p className="pp-section-hint" style={{ marginTop: 10, marginBottom: 0 }}>
        {caption} · {unit}
      </p>
    </div>
  )
}

export default function ParentsPage() {
  const { user } = useAuth()
  const [unlocked, setUnlocked] = useState(() => isParentUnlocked())
  const [progressRows, setProgressRows] = useState([])
  const [progressLoading, setProgressLoading] = useState(false)
  const [progressErr, setProgressErr] = useState('')
  const [journalRows, setJournalRows] = useState([])
  const [journalLoading, setJournalLoading] = useState(false)
  const [journalErr, setJournalErr] = useState('')

  const loadProgress = useCallback(async () => {
    setProgressErr('')
    setProgressLoading(true)
    try {
      const res = await apiFetch('/me/progress')
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        setProgressRows([])
        setProgressErr(parseErrorDetail(data))
        return
      }
      setProgressRows(Array.isArray(data) ? data : [])
    } finally {
      setProgressLoading(false)
    }
  }, [])

  const loadJournal = useCallback(async () => {
    setJournalErr('')
    setJournalLoading(true)
    try {
      const res = await apiFetch('/me/assignments/journal')
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        setJournalRows([])
        setJournalErr(parseErrorDetail(data))
        return
      }
      setJournalRows(Array.isArray(data) ? data : [])
    } finally {
      setJournalLoading(false)
    }
  }, [])

  useEffect(() => {
    if (unlocked && user?.role === 'child') {
      loadProgress()
      loadJournal()
    }
  }, [unlocked, user?.role, loadProgress, loadJournal])

  const summary = useMemo(() => {
    if (!progressRows.length) return null
    const theory = progressRows.filter((r) => r.theory_done).length
    const practice = progressRows.filter((r) => r.practice_done).length
    const attempts = progressRows.reduce((a, r) => a + r.total_attempts, 0)
    return {
      lessons: progressRows.length,
      theory,
      practice,
      attempts,
    }
  }, [progressRows])

  const chartPoints = useMemo(
    () =>
      progressRows.map((p) => ({
        label: shortLessonTitle(p.lesson_title),
        value: p.total_attempts,
      })),
    [progressRows],
  )

  const display = (user?.display_name ?? user?.name ?? '').trim()
  const studentLine = display
    ? `Учащийся: ${display}`
    : 'Данные по текущему аккаунту'

  const requestVerificationAgain = () => {
    clearParentUnlock()
    setUnlocked(false)
  }

  if (user?.role === 'teacher' || user?.role === 'admin') {
    return <Navigate to="/app" replace />
  }

  if (!unlocked) {
    return (
      <div className="pp-wrap">
        <div className="pp-panel">
          <header className="pp-top">
            <Link className="pp-back" to="/app">
              ← К разделам
            </Link>
            <h1 className="pp-title">Родителям</h1>
            <p className="pp-sub">
              Короткая проверка: ответьте на пример без калькулятора, чтобы
              открыть статистику по урокам на платформе.
            </p>
          </header>
          <div className="pp-main">
            <div className="pp-gate-head">
              <span className="pp-gate-badge">Шаг 1 из 1</span>
              <h2 className="pp-gate-page-title">Короткая проверка</h2>
              <p className="pp-gate-lead">
                Это нужно, чтобы ребёнок не видел оценки и детальную статистику
                без взрослого рядом.
              </p>
            </div>
            <div className="pp-gate">
              <ParentAgeCheckForm
                onSuccess={() => setUnlocked(true)}
                submitLabel="Подтвердить и открыть раздел"
                secondaryLabel="Другое задание"
                cardClassName="pp-gate-card"
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pp-wrap">
      <div className="pp-panel">
        <header className="pp-top">
          <Link className="pp-back" to="/app">
            ← К разделам
          </Link>
          <h1 className="pp-title">Родителям</h1>
          <p className="pp-sub">{studentLine}</p>
        </header>

        <div className="pp-main">
          <div className="pp-unlock-bar" role="status">
            <span>
              Раздел открыт после проверки. Доступ около 28 минут — затем снова
              понадобится пример.
            </span>
            <button
              type="button"
              className="pp-lock-again"
              onClick={requestVerificationAgain}
            >
              Запросить проверку снова
            </button>
          </div>

          <h2 className="pp-block-title">Прохождение курса</h2>
          <p className="pp-block-lead">
            Опубликованные уроки: для каждого видно, пройдена ли теория и
            практика, и сколько всего было попыток по задачам. Оценок за курс
            здесь нет.
          </p>

          {progressErr ? <p className="pp-gate-err">{progressErr}</p> : null}

          {progressLoading ? (
            <p className="pp-section-hint" style={{ margin: '0 0 16px' }}>
              Загрузка данных курса…
            </p>
          ) : null}

          <section className="pp-section" aria-labelledby="pp-course-table-title">
            <div className="pp-section-head">
              <h2 id="pp-course-table-title" className="pp-section-title">
                Статус по урокам
              </h2>
              <p className="pp-section-hint">
                {summary ? (
                  <>
                    Уроков в курсе: <strong>{summary.lessons}</strong>. Теория
                    пройдена: <strong>{summary.theory}</strong>. Практика
                    пройдена: <strong>{summary.practice}</strong>. Всего
                    попыток по задачам: <strong>{summary.attempts}</strong>.
                  </>
                ) : (
                  'Пока нет данных — ученик ещё не начинал уроки или курс пуст.'
                )}
              </p>
            </div>
            <div className="pp-section-body">
              {!progressLoading && progressRows.length === 0 && !progressErr ? (
                <p className="pp-section-hint" style={{ margin: 0 }}>
                  Нет данных. Когда ребёнок откроет уроки и решит задачи, здесь
                  появится таблица.
                </p>
              ) : null}
              {progressRows.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="pp-grades pp-course-pass-table">
                    <thead>
                      <tr>
                        <th scope="col">Урок</th>
                        <th scope="col">Теория</th>
                        <th scope="col">Практика</th>
                        <th scope="col">Всего попыток</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progressRows.map((row) => (
                        <tr key={row.lesson_id}>
                          <td>{row.lesson_title}</td>
                          <td>
                            <span
                              className={
                                row.theory_done ? 'pp-pass-yes' : 'pp-pass-no'
                              }
                            >
                              {row.theory_done ? 'Пройдено' : 'Не пройдено'}
                            </span>
                          </td>
                          <td>
                            <span
                              className={
                                row.practice_done ? 'pp-pass-yes' : 'pp-pass-no'
                              }
                            >
                              {row.practice_done ? 'Пройдено' : 'Не пройдено'}
                            </span>
                          </td>
                          <td>{row.total_attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>

          <section className="pp-section" aria-labelledby="pp-chart-title">
            <div className="pp-section-head">
              <h2 id="pp-chart-title" className="pp-section-title">
                Попытки по урокам
              </h2>
              <p className="pp-section-hint">
                Суммарное число попыток по задачам урока (без оценок и без
                разбивки на верные и неверные)
              </p>
            </div>
            <div className="pp-section-body">
              <TasksBarChart
                points={chartPoints}
                caption="Все опубликованные уроки курса"
                unit="попыток по уроку"
              />
            </div>
          </section>

          <h2 className="pp-block-title" style={{ marginTop: 8 }}>
            Задания от учителя
          </h2>
          <p className="pp-block-lead">
            Журнал: что выдал учитель классу и что сделал ребёнок — статус,
            попытки и оценки (в том числе за блок, когда все задачи блока сданы).
          </p>

          {journalErr ? <p className="pp-gate-err">{journalErr}</p> : null}

          {journalLoading ? (
            <p className="pp-section-hint" style={{ margin: '0 0 16px' }}>
              Загрузка журнала…
            </p>
          ) : null}

          <section className="pp-section" aria-labelledby="pp-journal-title">
            <div className="pp-section-head">
              <h2 id="pp-journal-title" className="pp-section-title">
                Журнал назначений
              </h2>
              <p className="pp-section-hint">
                Строки по каждой задаче из класса. Блок — несколько задач с
                общим комментарием и наградой.
              </p>
            </div>
            <div className="pp-section-body">
              {!journalLoading && journalRows.length === 0 && !journalErr ? (
                <p className="pp-section-hint" style={{ margin: 0 }}>
                  Пока нет назначений: ученик не в классе по приглашению или
                  учитель ещё ничего не задавал.
                </p>
              ) : null}
              {journalRows.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="pp-grades pp-journal-table">
                    <thead>
                      <tr>
                        <th scope="col">Класс</th>
                        <th scope="col">Урок</th>
                        <th scope="col">Задание</th>
                        <th scope="col">Выдано</th>
                        <th scope="col">Блок</th>
                        <th scope="col">Статус</th>
                        <th scope="col">Попытки (верно / ошибок / всего)</th>
                        <th scope="col">Оценка</th>
                        <th scope="col">За блок</th>
                        <th scope="col">Комментарий</th>
                        <th scope="col">Бонус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journalRows.map((j) => (
                        <tr key={j.assignment_id}>
                          <td>{j.class_name}</td>
                          <td>{j.lesson_title}</td>
                          <td>{j.task_title || '—'}</td>
                          <td>{formatAssignedAt(j.assigned_at)}</td>
                          <td>
                            {j.block_id != null &&
                            j.position_in_block != null &&
                            j.block_tasks_total != null
                              ? `${j.position_in_block}/${j.block_tasks_total}`
                              : '—'}
                          </td>
                          <td>{journalStatusRu(j.status)}</td>
                          <td>
                            {j.correct_attempts} / {j.wrong_attempts} /{' '}
                            {j.total_attempts}
                          </td>
                          <td>
                            {j.grade_2_5 != null ? j.grade_2_5 : '—'}
                          </td>
                          <td>
                            {j.block_grade_2_5 != null ? j.block_grade_2_5 : '—'}
                          </td>
                          <td className="pp-journal-note">
                            {j.note?.trim() ? j.note : '—'}
                          </td>
                          <td>{j.bonus_claimed ? 'да' : 'нет'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
