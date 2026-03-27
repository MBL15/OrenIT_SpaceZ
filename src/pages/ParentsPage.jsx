import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import ParentAgeCheckForm from '../components/ParentAgeCheckForm.jsx'
import { clearParentUnlock, isParentUnlocked } from '../lib/parentUnlock.js'
import './ParentsPage.css'

/** Демо-данные; заменить ответом API */
const SUBJECT_PERFORMANCE = [
  { subject: 'Основы информатики', avg: 4.7, tasksDone: 24 },
  { subject: 'Продуктовая разработка', avg: 4.4, tasksDone: 12 },
  { subject: 'Олимпиады', avg: 4.6, tasksDone: 8 },
]

const TASKS_CHART = {
  week: {
    caption: 'За последние 7 дней',
    unit: 'заданий в день',
    points: [
      { label: 'Пн', value: 2 },
      { label: 'Вт', value: 3 },
      { label: 'Ср', value: 1 },
      { label: 'Чт', value: 4 },
      { label: 'Пт', value: 2 },
      { label: 'Сб', value: 5 },
      { label: 'Вс', value: 3 },
    ],
  },
  month: {
    caption: 'По неделям текущего месяца',
    unit: 'заданий за неделю',
    points: [
      { label: '1 н.', value: 12 },
      { label: '2 н.', value: 18 },
      { label: '3 н.', value: 15 },
      { label: '4 н.', value: 22 },
    ],
  },
  semester: {
    caption: 'По месяцам семестра',
    unit: 'заданий за месяц',
    points: [
      { label: 'Сен', value: 28 },
      { label: 'Окт', value: 32 },
      { label: 'Ноя', value: 30 },
      { label: 'Дек', value: 35 },
      { label: 'Янв', value: 38 },
      { label: 'Фев', value: 40 },
    ],
  },
}

const PERIOD_KEYS = /** @type {const} */ (['week', 'month', 'semester'])

const PERIOD_LABELS = {
  week: 'Неделя',
  month: 'Месяц',
  semester: 'Семестр',
}

function gradeTone(avg) {
  if (avg >= 4.5) return 'pp-grade--high'
  if (avg >= 4) return 'pp-grade--mid'
  return ''
}

function overallAvg(rows) {
  if (!rows.length) return 0
  const s = rows.reduce((a, r) => a + r.avg, 0)
  return Math.round((s / rows.length) * 10) / 10
}

function TasksBarChart({ periodKey }) {
  const { points, caption, unit } = TASKS_CHART[periodKey]
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
  const gap = 8
  const barW = (chartW - gap * (n - 1)) / n

  const bars = points.map((p, i) => {
    const h = (p.value / max) * chartH
    const x = padL + i * (barW + gap)
    const y = padT + chartH - h
    return { ...p, x, y, w: barW, h }
  })

  const ariaSummary = `${caption}. Всего выполнено заданий: ${total}. ${points.map((p) => `${p.label}: ${p.value}`).join(', ')}.`

  return (
    <div className="pp-chart-wrap">
      <svg
        className="pp-chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaSummary}
      >
        <title>Диаграмма выполненных заданий</title>
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
  const [period, setPeriod] = useState(/** @type {'week' | 'month' | 'semester'} */ ('month'))

  const avgAll = useMemo(() => overallAvg(SUBJECT_PERFORMANCE), [])
  const chartTotal = useMemo(
    () => TASKS_CHART[period].points.reduce((a, p) => a + p.value, 0),
    [period],
  )

  const studentLine = user?.name
    ? `Учащийся: ${user.name}`
    : 'Данные по текущему аккаунту'

  const requestVerificationAgain = () => {
    clearParentUnlock()
    setUnlocked(false)
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
              открыть статистику.
            </p>
          </header>
          <div className="pp-main">
            <div className="pp-gate-head">
              <span className="pp-gate-badge">Шаг 1 из 1</span>
              <h2 className="pp-gate-page-title">Короткая проверка</h2>
              <p className="pp-gate-lead">
                Это нужно, чтобы ребёнок не видел оценки без взрослого рядом.
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

          <p className="pp-note" role="status">
            Показаны демонстрационные данные. После подключения к журналу здесь
            появятся реальные оценки и статистика заданий.
          </p>

          <section className="pp-section" aria-labelledby="pp-grades-title">
            <div className="pp-section-head">
              <h2 id="pp-grades-title" className="pp-section-title">
                Успеваемость
              </h2>
              <p className="pp-section-hint">
                Средний балл по разделам (пятибальная шкала) · среднее по всем
                разделам: <strong>{avgAll}</strong>
              </p>
            </div>
            <div className="pp-section-body">
              <table className="pp-grades">
                <thead>
                  <tr>
                    <th scope="col">Раздел</th>
                    <th scope="col">Средний балл</th>
                    <th scope="col">Заданий сдано (семестр)</th>
                  </tr>
                </thead>
                <tbody>
                  {SUBJECT_PERFORMANCE.map((row) => (
                    <tr key={row.subject}>
                      <td>{row.subject}</td>
                      <td>
                        <span className={`pp-grade ${gradeTone(row.avg)}`}>
                          {row.avg}
                        </span>
                      </td>
                      <td className="pp-grade">{row.tasksDone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pp-section" aria-labelledby="pp-chart-title">
            <div className="pp-section-head">
              <h2 id="pp-chart-title" className="pp-section-title">
                Выполненные задания
              </h2>
              <p className="pp-section-hint">
                Сколько заданий ребёнок сделал за выбранный промежуток времени
              </p>
            </div>
            <div className="pp-section-body">
              <div className="pp-chart-toolbar">
                <div
                  className="pp-period"
                  role="group"
                  aria-label="Период для диаграммы заданий"
                >
                  <span className="pp-period-legend">Период:</span>
                  {PERIOD_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`pp-period-btn${period === key ? ' pp-period-btn--active' : ''}`}
                      onClick={() => setPeriod(key)}
                      aria-pressed={period === key}
                    >
                      {PERIOD_LABELS[key]}
                    </button>
                  ))}
                </div>
                <span className="pp-chart-summary">
                  Всего за период: <strong>{chartTotal}</strong>
                </span>
              </div>
              <TasksBarChart periodKey={period} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
