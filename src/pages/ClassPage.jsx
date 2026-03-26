import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import './ClassPage.css'

/** Демо-данные: позже можно заменить ответом API */
const CLASS_MEMBERS = [
  { id: 1, name: 'Александрова Мария', points: 1280, role: null },
  { id: 2, name: 'Борисов Дмитрий', points: 1195, role: 'Староста' },
  { id: 3, name: 'Волкова Анна', points: 1150, role: null },
  { id: 4, name: 'Григорьев Илья', points: 1088, role: null },
  { id: 5, name: 'Денисова Елена', points: 1040, role: null },
  { id: 6, name: 'Егоров Матвей', points: 980, role: null },
  { id: 7, name: 'Жуков Павел', points: 945, role: null },
  { id: 8, name: 'Зайцева София', points: 910, role: null },
  { id: 9, name: 'Иванов Артём', points: 876, role: null },
  { id: 10, name: 'Козлова Виктория', points: 820, role: null },
]

function normalizeName(s) {
  return (s || '').trim().toLowerCase()
}

export default function ClassPage() {
  const { user } = useAuth()
  const meName = normalizeName(user?.name)

  const merged = CLASS_MEMBERS.map((m) => {
    const isMe = meName && normalizeName(m.name) === meName
    return { ...m, isMe }
  })

  const leaderboard = [...merged].sort((a, b) => b.points - a.points)
  const maxPoints = leaderboard[0]?.points || 1

  const classList = [...merged].sort((a, b) =>
    a.name.localeCompare(b.name, 'ru'),
  )

  return (
    <div className="cp-wrap">
      <div className="cp-panel">
        <header className="cp-top">
          <div>
            <Link className="cp-back" to="/app">
              ← К разделам
            </Link>
            <h1 className="cp-title">Мой класс</h1>
            <p className="cp-sub">9 «А» · 2024–2025 учебный год</p>
          </div>
          <div className="cp-meta">
            <span className="cp-badge">Учеников: {CLASS_MEMBERS.length}</span>
          </div>
        </header>

        <div className="cp-main">
          <section className="cp-section" aria-labelledby="cp-lb-title">
            <div className="cp-section-head">
              <h2 id="cp-lb-title" className="cp-section-title">
                Таблица лидеров
              </h2>
              <p className="cp-section-hint">По сумме баллов за семестр</p>
            </div>
            <div className="cp-section-body">
              {leaderboard.map((row, i) => {
                const rank = i + 1
                const rankClass =
                  rank === 1
                    ? 'cp-rank--1'
                    : rank === 2
                      ? 'cp-rank--2'
                      : rank === 3
                        ? 'cp-rank--3'
                        : ''
                const pct = Math.round((row.points / maxPoints) * 100)
                return (
                  <div
                    key={row.id}
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
                      <div className="cp-bar" aria-hidden>
                        <div
                          className="cp-bar-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="cp-lb-points">{row.points}</div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="cp-section" aria-labelledby="cp-class-title">
            <div className="cp-section-head">
              <h2 id="cp-class-title" className="cp-section-title">
                Список класса
              </h2>
              <p className="cp-section-hint">По алфавиту</p>
            </div>
            <div className="cp-section-body">
              {classList.map((row, index) => (
                <div
                  key={row.id}
                  className={`cp-class-row${row.isMe ? ' cp-class-row--me' : ''}`}
                >
                  <span className="cp-num">{index + 1}</span>
                  <div className="cp-class-info">
                    <span className="cp-avatar" aria-hidden />
                    <div style={{ minWidth: 0 }}>
                      <div className="cp-class-name">{row.name}</div>
                      {row.role && (
                        <span className="cp-badge" style={{ marginTop: 4 }}>
                          {row.role}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="cp-class-pts">
                    {row.points} б.
                    {row.isMe && (
                      <span className="cp-badge" style={{ marginLeft: 8 }}>
                        Вы
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
