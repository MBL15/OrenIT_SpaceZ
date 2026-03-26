import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import courseMapImg from '../assets/course-map.png'
import './MainSite.css'

/** Позиции центров кругов с цифрами на карте (в процентах от блока) */
const MAP_LESSONS = [
  {
    n: 1,
    left: 80.5,
    top: 84,
    leftAdjustPx: -6,
    title: 'Асгард',
    description:
      'Первая остановка на карте знаний. Здесь начинается путь в основы информатики: познакомьтесь с форматом курса и выполните вводные задания.',
    cta: 'Начать заниматься',
  },
  {
    n: 2,
    left: 42.5,
    top: 86,
    leftAdjustPx: 33,
    topAdjustPx: 22,
    title: 'Урок 2',
    description: 'Содержание этого этапа скоро появится. Следите за обновлениями.',
    cta: 'Начать заниматься',
  },
  {
    n: 3,
    left: 21.5,
    top: 71,
    leftAdjustPx: 15,
    topAdjustPx: 3,
    title: 'Урок 3',
    description: 'Содержание этого этапа скоро появится.',
    cta: 'Начать заниматься',
  },
  {
    n: 4,
    left: 36,
    top: 48,
    leftAdjustPx: 138,
    topAdjustPx: 38,
    title: 'Урок 4',
    description: 'Содержание этого этапа скоро появится.',
    cta: 'Начать заниматься',
  },
  {
    n: 5,
    left: 46,
    top: 40,
    leftAdjustPx: 64,
    topAdjustPx: -93,
    title: 'Урок 5',
    description: 'Содержание этого этапа скоро появится.',
    cta: 'Начать заниматься',
  },
  {
    n: 6,
    left: 16,
    top: 20,
    leftAdjustPx: 96,
    topAdjustPx: 115,
    title: 'Урок 6',
    description: 'Содержание этого этапа скоро появится.',
    cta: 'Начать заниматься',
  },
  {
    n: 7,
    left: 80,
    top: 22,
    leftAdjustPx: 39,
    topAdjustPx: 65,
    title: 'Урок 7',
    description: 'Содержание этого этапа скоро появится.',
    cta: 'Начать заниматься',
  },
  {
    n: 8,
    left: 72,
    top: 46,
    leftAdjustPx: 132,
    topAdjustPx: 99,
    title: 'Урок 8',
    description: 'Содержание этого этапа скоро появится.',
    cta: 'Начать заниматься',
  },
]

const SECTIONS = [
  { id: 'latest', title: 'Последнее', btn: 'ПЕРЕЙТИ', glyph: '≡' },
  { id: 'cs', title: 'Основы информатики', btn: 'ПЕРЕЙТИ', glyph: '</>' },
  { id: 'product', title: 'Продуктовая разработка', btn: 'ПЕРЕЙТИ', glyph: '◎' },
  { id: 'olympiad', title: 'Олимпиады', btn: 'ПЕРЕЙТИ', glyph: '★' },
]

const LAST_TAB_KEY = 'spaceedu-last-tab'

function readLastTab() {
  try {
    const v = localStorage.getItem(LAST_TAB_KEY)
    if (v === 'cs' || v === 'product' || v === 'olympiad') return v
  } catch {
    /* ignore */
  }
  return null
}

function writeLastTab(id) {
  try {
    localStorage.setItem(LAST_TAB_KEY, id)
  } catch {
    /* ignore */
  }
}

function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19V5M8 19v-6M12 19V9M16 19v-4M20 19v-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SectionGrid({ onOpen, canOpenLatest }) {
  return (
    <div className="ms-grid">
      {SECTIONS.map((s) => {
        const isLatest = s.id === 'latest'
        const disabled = isLatest && !canOpenLatest
        return (
          <article key={s.id} className="ms-card">
            <div className="ms-card-glyph">{s.glyph}</div>
            <h3>{s.title}</h3>
            <button
              type="button"
              className="ms-card-btn"
              disabled={disabled}
              title={
                disabled
                  ? 'Сначала откройте любой раздел — «Последнее» откроет его'
                  : undefined
              }
              onClick={() => onOpen(s.id)}
            >
              {s.btn}
            </button>
          </article>
        )
      })}
    </div>
  )
}

function LessonModal({ lesson, onClose }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!lesson) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [lesson, onClose])

  if (!lesson) return null

  const handleStart = () => {
    if (lesson.n === 1) {
      navigate('/app/lesson/asgard')
    }
    onClose()
  }

  return (
    <div
      className="ms-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="ms-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ms-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="ms-modal-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
        <h2 id="ms-modal-title" className="ms-modal-title">
          {lesson.title}
        </h2>
        <p className="ms-modal-text">{lesson.description}</p>
        <p className="ms-modal-offer">
          Готовы приступить к занятиям в этой точке маршрута?
        </p>
        <div className="ms-modal-actions">
          <button
            type="button"
            className="ms-modal-cta"
            onClick={handleStart}
          >
            {lesson.cta}
          </button>
          <button type="button" className="ms-modal-secondary" onClick={onClose}>
            Позже
          </button>
        </div>
      </div>
    </div>
  )
}

function CourseMap() {
  const [activeLesson, setActiveLesson] = useState(null)

  return (
    <>
      <figure className="ms-map">
        <img
          className="ms-map-img"
          src={courseMapImg}
          alt="Карта курса «Основы информатики»: маршрут из восьми уроков по фантастическому миру"
        />
        <div className="ms-map-hits">
          {MAP_LESSONS.map((lesson) => (
            <button
              key={lesson.n}
              type="button"
              className={`ms-map-hit${lesson.n >= 1 && lesson.n <= 8 ? ' ms-map-hit--asgard' : ''}`}
              style={{
                left:
                  lesson.leftAdjustPx != null
                    ? `calc(${lesson.left}% + ${lesson.leftAdjustPx}px)`
                    : `${lesson.left}%`,
                top:
                  lesson.topAdjustPx != null
                    ? `calc(${lesson.top}% + ${lesson.topAdjustPx}px)`
                    : `${lesson.top}%`,
              }}
              aria-label={`Урок ${lesson.n}: ${lesson.title}`}
              title={`Урок ${lesson.n}`}
              onClick={() => setActiveLesson(lesson)}
            />
          ))}
        </div>
      </figure>
      <LessonModal
        lesson={activeLesson}
        onClose={() => setActiveLesson(null)}
      />
    </>
  )
}

function Placeholder({ title, text }) {
  return (
    <div className="ms-placeholder">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  )
}

export default function MainSite({ user, onLogout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState('latest')
  const [lastVisitedId, setLastVisitedId] = useState(readLastTab)

  useEffect(() => {
    if (location.state?.openTab === 'cs') {
      setTab('cs')
      setLastVisitedId('cs')
      writeLastTab('cs')
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate])

  const openSection = (id) => {
    if (id === 'latest') {
      if (lastVisitedId) setTab(lastVisitedId)
      return
    }
    setLastVisitedId(id)
    writeLastTab(id)
    setTab(id)
  }

  return (
    <div className="ms-wrap">
      <div className="ms-panel">
        <header className="ms-topbar">
          <div className="ms-topbar-row">
            <div className="ms-topbar-left">
              <span className="ms-brand">
                <span className="ms-brand-mark" aria-hidden>
                  ◆
                </span>
                SpacEdu
              </span>
              <a href="#parent" className="ms-pill">
                <IconChart />
                Родителю
              </a>
            </div>
            <div className="ms-topbar-right">
              <Link className="ms-link" to="/app/class">
                Мой класс
              </Link>
              <Link className="ms-profile" to="/app/profile">
                <span className="ms-avatar" aria-hidden />
                <span>Мой профиль</span>
                <IconChevron />
              </Link>
              <button type="button" className="ms-btn-logout" onClick={onLogout}>
                Выйти
              </button>
            </div>
          </div>
        </header>

        <main className="ms-main">
          {tab !== 'latest' && (
            <div className="ms-back">
              <button
                type="button"
                className="ms-back-btn"
                onClick={() => setTab('latest')}
              >
                ← К разделам
              </button>
            </div>
          )}

          {tab === 'latest' && (
            <SectionGrid
              onOpen={openSection}
              canOpenLatest={Boolean(lastVisitedId)}
            />
          )}
          {tab === 'cs' && <CourseMap />}
          {tab === 'product' && (
            <Placeholder
              title="Продуктовая разработка"
              text="Здесь появятся курсы и треки по продуктовой разработке."
            />
          )}
          {tab === 'olympiad' && (
            <Placeholder
              title="Олимпиады"
              text="Раздел олимпиад в разработке."
            />
          )}
        </main>
      </div>

      <button type="button" className="ms-help" aria-label="Помощь">
        ?
        <span className="ms-help-badge">10</span>
      </button>
    </div>
  )
}
