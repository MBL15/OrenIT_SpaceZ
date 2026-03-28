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
    drawerTitle: 'Асгард — старт вашего приключения.',
    drawerBody:
      'Здесь вы задаёте темп всему маршруту: короткие смысловые блоки, сразу практика и ясное «что дальше». Пройдите вводную локацию, чтобы согласовать ожидания с форматом курса и спокойно двигаться к следующим точкам на карте.',
    startPath: '/app/lesson/asgard',
  },
  {
    n: 2,
    left: 42.5,
    top: 86,
    leftAdjustPx: 33,
    topAdjustPx: 22,
    title: 'Йотунхейм — встреча с драконом',
    drawerTitle: 'Йотунхейм — встреча с драконом.',
    drawerBody:
      'В ледяных просторах вас ждёт не просто задача, а настоящая «встреча с драконом»: плотное испытание, где важны хладнокровие и точный расчёт. Соберите всё, что уже освоили, и пройдите его без спешки — победа измеряется ясностью решения, а не скоростью.',
  },
  {
    n: 3,
    left: 21.5,
    top: 71,
    leftAdjustPx: 15,
    topAdjustPx: 3,
    title: 'Ванахейм — знакомство с землёй',
    drawerTitle: 'Ванахейм — знакомство с землёй.',
    drawerBody:
      'Здесь вы буквально «познакомитесь с землёй»: задачи про земледелие и всё, что с ним связано — посевы и сроки, полив и урожай, ротацию грядок, подсчёт урожая и простые схемы хозяйства. Как настоящий участок, материал учит планировать циклы, считать ресурсы и видеть результат не сразу, а после «сезона» практики.',
  },
  {
    n: 4,
    left: 36,
    top: 48,
    leftAdjustPx: 138,
    topAdjustPx: 38,
    title: 'Мидгард — мир людей',
    drawerTitle: 'Мидгард — мир людей.',
    drawerBody:
      'Мидгард — мир людей, где решения принимаются шаг за шагом: здесь вы разберёте задачи с условными операторами и циклами. Научитесь ветвить логику («если… иначе»), повторять действия, пока выполняется условие, и обходить данные по кругу — как в обычной жизни: сначала проверка, потом действие, иногда снова и снова, пока цель не достигнута.',
  },
  {
    n: 5,
    left: 46,
    top: 40,
    leftAdjustPx: 64,
    topAdjustPx: -93,
    title: 'Муспельхейм — огонь логики',
    drawerTitle: 'Муспельхейм — огонь логики.',
    drawerBody:
      'Начать осваивать таблицы истинности — главная цель этой локации. Муспельхейм — огонь логики: вы разберёте, как из простых истин и лжи складывается сложное выражение. Как пламя не терпит полумер, булевы операции требуют ясности — шаг за шагом вы научитесь строить и проверять каждую строку таблицы.',
  },
  {
    n: 6,
    left: 16,
    top: 20,
    leftAdjustPx: 96,
    topAdjustPx: 115,
    title: 'Нифльхейм — ряды в тумане',
    drawerTitle: 'Нифльхейм — ряды в тумане.',
    drawerBody:
      'В холодном тумане Нифльхейма ничего не видно целиком — только следующий шаг по нумерованной цепочке ячеек. Здесь вы работаете с массивами: индексы ведут от первого элемента к последнему, можно заполнять ряд, читать значение по номеру и обходить всю «решётку» шаг за шагом, пока мгла не рассеется в ясную картину данных. Решив все задачи этой локации, вы откроете путь к мосту Бифрёсту, ведущему к следующему пункту маршрута.',
  },
  {
    n: 7,
    left: 80,
    top: 22,
    leftAdjustPx: 39,
    topAdjustPx: 65,
    title: 'Альвхейм — сплетение принципов',
    drawerTitle: 'Альвхейм — сплетение принципов.',
    drawerBody:
      'В светлом Альвхейме вас ждут алгоритмические задачи, в которых переплетается всё, что вы уже прошли: условия и циклы, логика и таблицы истинности, работа с массивами и ясное пошаговое мышление. Здесь нельзя опереться на один приём — нужно собрать маршрут из ранее освоенных идей и довести решение до изящного, цельного результата.',
  },
  {
    n: 8,
    left: 72,
    top: 46,
    leftAdjustPx: 132,
    topAdjustPx: 99,
    title: 'Иггдрасиль',
    drawerTitle: 'Иггдрасиль — ствол, что связывает миры.',
    drawerBody:
      'Древо Иггдрасиля соединяет всё, что вы прошли: финальный аккорд — язык Python как мост между идеей и реализацией. Здесь вы соберёте маршрут целиком и увидите, как отдельные «миры» курса складываются в одну картину.',
  },
]

// Базовый размер, относительно которого были подобраны px-смещения на карте.
// Конвертируем их в проценты, чтобы точки масштабировались вместе с изображением.
const MAP_REFERENCE_SIZE_PX = 1000

function toResponsivePercent(basePercent, adjustPx = 0) {
  return basePercent + (adjustPx / MAP_REFERENCE_SIZE_PX) * 100
}

const SECTION_TAIL = [
  { id: 'cs', title: 'Основы информатики', btn: 'ПЕРЕЙТИ', glyph: '</>' },
  { id: 'product', title: 'Продуктовая разработка', btn: 'ПЕРЕЙТИ', glyph: '◎' },
  { id: 'olympiad', title: 'Олимпиады', btn: 'ПЕРЕЙТИ', glyph: '★' },
]

function sectionsForUser(user) {
  const isChild = user?.role === 'child'
  if (user?.role === 'admin') {
    return [
      {
        id: 'admin_panel',
        title: 'Админ-панель',
        btn: 'ОТКРЫТЬ',
        glyph: '⚙',
      },
      ...SECTION_TAIL,
    ]
  }
  const roleFirst = isChild
    ? {
        id: 'assignments',
        title: 'Задания от учителя',
        btn: 'ПЕРЕЙТИ',
        glyph: '✎',
      }
    : {
        id: 'teacher_hub',
        title: 'Кабинет учителя',
        btn: 'ПЕРЕЙТИ',
        glyph: '▣',
      }
  return [roleFirst, ...SECTION_TAIL]
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

function SectionGrid({ sections, onOpen }) {
  return (
    <div className="ms-grid">
      {sections.map((s) => (
        <article key={s.id} className="ms-card">
          <div className="ms-card-glyph">{s.glyph}</div>
          <h3>{s.title}</h3>
          <button
            type="button"
            className="ms-card-btn"
            onClick={() => onOpen(s.id)}
          >
            {s.btn}
          </button>
        </article>
      ))}
    </div>
  )
}

/** Панель справа для любой точки на карте (основы информатики) */
function RealmLessonDrawer({ lesson, onClose }) {
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

  const titleId = `ms-realm-drawer-title-${lesson.n}`

  const handleStart = () => {
    if (lesson.startPath) navigate(lesson.startPath)
    onClose()
  }

  return (
    <div
      className="ms-product-drawer-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="ms-product-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
        <h2 id={titleId} className="ms-product-drawer-title">
          {lesson.drawerTitle}
        </h2>
        <p className="ms-product-drawer-text">{lesson.drawerBody}</p>
        <div className="ms-product-drawer-actions">
          {lesson.startPath ? (
            <button type="button" className="ms-modal-cta" onClick={handleStart}>
              Начать приключение
            </button>
          ) : (
            <button type="button" className="ms-modal-secondary" disabled>
              Скоро в курсе
            </button>
          )}
          <button
            type="button"
            className="ms-modal-secondary"
            onClick={onClose}
          >
            Вернуться к карте
          </button>
        </div>
      </aside>
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
                left: `${toResponsivePercent(lesson.left, lesson.leftAdjustPx)}%`,
                top: `${toResponsivePercent(lesson.top, lesson.topAdjustPx)}%`,
              }}
              aria-label={`Урок ${lesson.n}: ${lesson.title}`}
              title={`Урок ${lesson.n}: ${lesson.title}`}
              onClick={() => setActiveLesson(lesson)}
            />
          ))}
        </div>
      </figure>
      {activeLesson ? (
        <RealmLessonDrawer
          lesson={activeLesson}
          onClose={() => setActiveLesson(null)}
        />
      ) : null}
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

export default function MainSite({ user, onLogout, onOpenParents }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState('latest')
  const [displayTab, setDisplayTab] = useState('latest')
  const [isClosingTab, setIsClosingTab] = useState(false)
  useEffect(() => {
    if (location.state?.openTab === 'cs') {
      setTab('cs')
      setDisplayTab('cs')
      setIsClosingTab(false)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    if (!isClosingTab) return undefined
    const timer = window.setTimeout(() => {
      setDisplayTab(tab)
      setIsClosingTab(false)
    }, 260)
    return () => window.clearTimeout(timer)
  }, [isClosingTab, tab])

  const openSection = (id) => {
    if (id === 'assignments') {
      navigate('/app/assignments')
      return
    }
    if (id === 'teacher_hub') {
      navigate('/app/teacher')
      return
    }
    if (id === 'admin_panel') {
      navigate('/app/admin')
      return
    }
    setTab(id)
    setDisplayTab(id)
    setIsClosingTab(false)
  }

  const closeCurrentTab = () => {
    if (tab === 'latest') return
    setIsClosingTab(true)
    setTab('latest')
  }

  const displayName =
    user?.display_name?.trim() || user?.name?.trim() || user?.login || ''
  const hideParentsLink =
    user?.role === 'teacher' || user?.role === 'admin'
  const sections = sectionsForUser(user)

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
                {displayName ? (
                  <span className="ms-brand-user">{displayName}</span>
                ) : null}
              </span>
              {!hideParentsLink && onOpenParents ? (
                <button type="button" className="ms-pill" onClick={onOpenParents}>
                  <IconChart />
                  Родителям
                </button>
              ) : null}
            </div>
            <div className="ms-topbar-right">
              {user?.role === 'child' ? (
                <Link className="ms-link" to="/app/class">
                  Мой класс
                </Link>
              ) : null}
              {user?.role === 'admin' ? (
                <Link className="ms-link" to="/app/admin">
                  Админка
                </Link>
              ) : null}
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
          {displayTab !== 'latest' && (
            <div className="ms-back">
              <button
                type="button"
                className="ms-back-btn"
                onClick={closeCurrentTab}
              >
                ← К разделам
              </button>
            </div>
          )}

          {displayTab === 'latest' && (
            <div className={`ms-latest-stack${isClosingTab ? ' ms-latest-stack--enter' : ''}`}>
              <div className="ms-intro">
                <h2 className="ms-intro-title">Добро пожаловать</h2>
                <p className="ms-intro-text">
                  Выберите раздел ниже — материалы откроются здесь же.
                  {user?.role === 'child'
                    ? ' Задания от учителя — отдельная страница (первая карточка).'
                    : user?.role === 'teacher'
                      ? ' Кабинет классов — первая карточка.'
                      : user?.role === 'admin'
                        ? ' Админ-панель — первая карточка или ссылка «Админка» в шапке.'
                        : null}
                </p>
              </div>
              <div className="ms-latest-body">
                <SectionGrid sections={sections} onOpen={openSection} />
              </div>
              <aside className="ms-shelf" aria-label="Подсказки по кабинету">
                <div className="ms-shelf-item">
                  <span className="ms-shelf-kicker">Навигация</span>
                  <p className="ms-shelf-text">
                    Разделы открываются на этой же странице — не нужно искать
                    меню в другом месте.
                  </p>
                </div>
                <div className="ms-shelf-item">
                  <span className="ms-shelf-kicker">Мой класс</span>
                  <p className="ms-shelf-text">
                    {user?.role === 'child'
                      ? 'В разделе — лидерборд по уровню опыта среди одноклассников и список класса; задания от учителя — первой карточкой.'
                      : user?.role === 'admin'
                        ? 'Пользователи — в админ-панели.'
                        : 'Классы и ученики — по первой карточке на этой странице.'}
                  </p>
                </div>
                <div className="ms-shelf-item">
                  <span className="ms-shelf-kicker">Помощь</span>
                  <p className="ms-shelf-text">
                    Кнопка «?» внизу справа — уведомления и ответы на частые
                    вопросы.
                  </p>
                </div>
              </aside>
            </div>
          )}
          {displayTab === 'cs' && (
            <div className={`ms-cs-stack${isClosingTab ? ' ms-tab-closing' : ''}`}>
              <p className="ms-page-hint" role="note">
                Нажмите на круг с номером урока — справа откроется карточка локации
                с кратким вступлением и кнопками.
              </p>
              <div className="ms-map-stage">
                <CourseMap />
              </div>
            </div>
          )}
          {displayTab === 'product' && (
            <div className={`ms-subpage-fill${isClosingTab ? ' ms-tab-closing' : ''}`}>
              <Placeholder
                title="Продуктовая разработка"
                text="Раздел в разработке."
              />
            </div>
          )}
          {displayTab === 'olympiad' && (
            <div className={`ms-subpage-fill${isClosingTab ? ' ms-tab-closing' : ''}`}>
              <Placeholder
                title="Олимпиады"
                text="Раздел олимпиад в разработке."
              />
            </div>
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
