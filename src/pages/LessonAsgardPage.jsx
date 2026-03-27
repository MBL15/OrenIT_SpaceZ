import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import artemiyUrl from '../assets/artemiy.png'
import odinUrl from '../assets/odin.png'
import asgardCutsceneBgUrl from '../assets/asgard-cutscene-bg.png'
import './LessonAsgardPage.css'

const STORAGE_KEY = 'spaceedu-asgard-complete'
const POINTS_KEY = 'spaceedu-points'
const LESSON_REWARD = 100
const CUTSCENE_LINES = [
  {
    side: 'right',
    text: 'Привет, я Артемий, чем я могу вам помочь?',
  },
  {
    side: 'left',
    text: 'Привет, мне нужно чтобы ты получил золотое яблоко',
  },
  {
    side: 'right',
    text: 'А что для этого нужно',
  },
  {
    side: 'left',
    text: 'ПОзнать логику',
  },
]

function readComplete() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function addPoints(amount) {
  try {
    const current = Number(localStorage.getItem(POINTS_KEY) || '0')
    const safeCurrent = Number.isFinite(current) ? current : 0
    const next = safeCurrent + amount
    localStorage.setItem(POINTS_KEY, String(next))
    return next
  } catch {
    return amount
  }
}

export default function LessonAsgardPage() {
  const navigate = useNavigate()
  const [completedView, setCompletedView] = useState(readComplete)
  const [answer, setAnswer] = useState(null)
  const [inCutscene, setInCutscene] = useState(true)
  const [lessonStage, setLessonStage] = useState('theory')
  const [cutsceneIndex, setCutsceneIndex] = useState(0)
  const [showCorrectModal, setShowCorrectModal] = useState(false)
  const [lastAwardedPoints, setLastAwardedPoints] = useState(null)

  useEffect(() => {
    if (!inCutscene || cutsceneIndex !== 0) return undefined
    const timer = window.setTimeout(() => {
      setCutsceneIndex(1)
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [inCutscene, cutsceneIndex])

  const backToMap = () => {
    navigate('/app', { state: { openTab: 'cs' } })
  }

  const goToNextReplica = () => {
    if (cutsceneIndex < CUTSCENE_LINES.length - 1) {
      setCutsceneIndex((v) => v + 1)
    }
  }

  const handleCorrectAnswer = () => {
    if (!readComplete()) {
      try {
        localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        /* ignore */
      }
      setLastAwardedPoints(addPoints(LESSON_REWARD))
    }
    setShowCorrectModal(true)
  }

  if (completedView) {
    return (
      <div className="asg-wrap">
        <div className="asg-layout">
          <div className="asg-panel">
            <div className="asg-success">
              <button type="button" className="asg-back asg-back--success" onClick={backToMap}>
                ← К карте курса
              </button>
              <span className="asg-success-icon" aria-hidden>
                ✓
              </span>
              <h1 className="asg-title">Урок «Асгард» пройден</h1>
              <p className="asg-lead">
                Вы завершили вводную локацию. Можно возвращаться к карте и открывать следующие точки.
              </p>
              <div className="asg-success-actions">
                <button type="button" className="asg-btn-primary" onClick={backToMap}>
                  Вернуться к карте
                </button>
                <button
                  type="button"
                  className="asg-btn-secondary"
                  onClick={() => {
                    try {
                      localStorage.removeItem(STORAGE_KEY)
                    } catch {
                      /* ignore */
                    }
                    try {
                      localStorage.removeItem(POINTS_KEY)
                    } catch {
                      /* ignore */
                    }
                    setCompletedView(false)
                    setAnswer(null)
                    setShowCorrectModal(false)
                    setLessonStage('theory')
                    setInCutscene(true)
                    setCutsceneIndex(0)
                    setLastAwardedPoints(null)
                  }}
                >
                  Пройти урок снова
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="asg-wrap">
      <div className="asg-layout">
        <div className="asg-panel">
          {inCutscene ? (
            <section className="asg-cutscene" aria-labelledby="asg-cutscene-title">
              <div className="asg-cutscene-top">
                <button type="button" className="asg-back" onClick={backToMap}>
                  ← К карте курса
                </button>
                <p className="asg-breadcrumb">Катсцена · Урок 1</p>
                <h1 id="asg-cutscene-title" className="asg-title">
                  Асгард: старт приключения
                </h1>
              </div>

              <div
                className="asg-cutscene-stage"
                style={{ backgroundImage: `url(${asgardCutsceneBgUrl})` }}
                onClick={goToNextReplica}
              >
                <div className="asg-actor asg-actor--left">
                  <img src={odinUrl} alt="Один" />
                  {CUTSCENE_LINES[cutsceneIndex].side === 'left' ? (
                    <div className="asg-bubble asg-bubble--left">
                      {CUTSCENE_LINES[cutsceneIndex].text}
                    </div>
                  ) : null}
                </div>

                <div className="asg-actor asg-actor--right">
                  <img src={artemiyUrl} alt="Артемий" />
                  {CUTSCENE_LINES[cutsceneIndex].side === 'right' ? (
                    <div className="asg-bubble asg-bubble--right">
                      {CUTSCENE_LINES[cutsceneIndex].text}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="asg-cutscene-actions">
                <button
                  type="button"
                  className="asg-btn-secondary"
                  onClick={() => {
                    setLessonStage('theory')
                    setInCutscene(false)
                  }}
                >
                  Пропустить
                </button>
                <button
                  type="button"
                  className="asg-btn-primary"
                  onClick={() => {
                    if (cutsceneIndex < CUTSCENE_LINES.length - 1) return goToNextReplica()
                    setLessonStage('theory')
                    setInCutscene(false)
                  }}
                >
                  {cutsceneIndex < CUTSCENE_LINES.length - 1 ? 'Далее' : 'Начать урок'}
                </button>
              </div>
            </section>
          ) : (
            <>
              <header className="asg-header">
                <button type="button" className="asg-back" onClick={backToMap}>
                  ← К карте курса
                </button>
                <p className="asg-breadcrumb">Основы информатики · Урок 1</p>
                <h1 className="asg-title">Асгард</h1>
              </header>

              <div className="asg-body">
                {lessonStage === 'theory' ? (
                  <section className="asg-block" aria-labelledby="asg-theory">
                    <h2 id="asg-theory" className="asg-h2">
                      Теоретический блок
                    </h2>
                    <p className="asg-p">
                      Логика помогает строить верные рассуждения: мы работаем с высказываниями,
                      проверяем истинность условий и выбираем правильный путь решения.
                    </p>
                    <ul className="asg-list">
                      <li>Высказывание может быть истинным или ложным.</li>
                      <li>Условия в задаче можно объединять: И, ИЛИ, НЕ.</li>
                      <li>Пошаговая проверка условий ведет к правильному ответу.</li>
                    </ul>
                    <button
                      type="button"
                      className="asg-btn-primary"
                      onClick={() => setLessonStage('test')}
                    >
                      Перейти к тесту
                    </button>
                  </section>
                ) : (
                  <section className="asg-block" aria-labelledby="asg-task-placeholder">
                    <h2 id="asg-task-placeholder" className="asg-h2">
                      Тест (заглушка)
                    </h2>
                    <p className="asg-p">
                      После теории ученик переходит на тест. Пока — макет вариантов ответа и
                      терминала.
                    </p>
                    <div className="asg-quiz" role="group" aria-label="Варианты ответа">
                      {[
                        { id: 'a', text: 'Логика учит проверять условия и делать выводы', correct: true },
                        { id: 'b', text: 'Логика нужна только для сложения чисел', correct: false },
                        { id: 'c', text: 'Логика не связана с решением задач', correct: false },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`asg-option${answer === opt.id ? ' asg-option--picked' : ''}`}
                          onClick={() => {
                            setAnswer(opt.id)
                            if (opt.correct) handleCorrectAnswer()
                          }}
                        >
                          {opt.text}
                        </button>
                      ))}
                    </div>
                    <div className="asg-terminal" role="region" aria-label="Терминал">
                      <div className="asg-terminal-head">Терминал (заглушка)</div>
                      <pre className="asg-terminal-body">
{`$ python quest.py
> Ожидание ввода...
> Здесь будет интерактив задания.`}
                      </pre>
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {showCorrectModal ? (
        <div className="asg-result-backdrop" role="presentation">
          <div className="asg-result-modal" role="dialog" aria-modal="true" aria-labelledby="asg-result-title">
            <h2 id="asg-result-title" className="asg-h2">
              Все правильно!
            </h2>
            <p className="asg-p">
              Вы получили +{LESSON_REWARD} баллов.
              {lastAwardedPoints != null ? ` Текущий баланс: ${lastAwardedPoints}.` : ''}
            </p>
            <button
              type="button"
              className="asg-btn-primary"
              onClick={() => {
                setShowCorrectModal(false)
                setCompletedView(true)
              }}
            >
              Продолжить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
