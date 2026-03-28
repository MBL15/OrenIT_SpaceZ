import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import artemiyUrl from '../assets/artemiy.png'
import odinUrl from '../assets/odin.png'
import asgardCutsceneBgUrl from '../assets/asgard-cutscene-bg.png'
import AsgardQuizEditorModal, {
  AsgardAdminPencilButton,
} from '../components/AsgardQuizEditorModal.jsx'
import { isAdminUser } from '../auth.js'
import { useAuth } from '../AuthContext.jsx'
import { apiFetch, parseErrorDetail } from '../api.js'
import {
  loadAsgardQuizSpec,
  specToQuizSteps,
} from '../lib/asgardQuizSpec.js'
import { shuffleAllQuizSteps } from '../lib/shuffleQuizOptions.js'
import { useDialogPresence } from '../hooks/useDialogPresence.js'
import './LessonAsgardPage.css'

const STORAGE_KEY = 'spaceedu-asgard-complete'
/** Совпадает с названием урока в БД (seed / asgard_platform). */
const ASGARD_LESSON_TITLE = 'Основы информатики — Асгард'
const OFFLINE_REWARD_COINS = 10
const OFFLINE_REWARD_XP = 100

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

function readGuestComplete() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export default function LessonAsgardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = isAdminUser(user)

  const [quizSpec, setQuizSpec] = useState(() => loadAsgardQuizSpec())
  const [quizEditorOpen, setQuizEditorOpen] = useState(false)
  const [quizEditorKey, setQuizEditorKey] = useState(0)
  const [asgardLessonId, setAsgardLessonId] = useState(null)

  const openQuizEditor = () => {
    setQuizEditorKey((k) => k + 1)
    setQuizEditorOpen(true)
  }

  const [completedView, setCompletedView] = useState(() =>
    user?.role === 'child' ? false : readGuestComplete(),
  )
  const [questionStep, setQuestionStep] = useState(1)
  const [answers, setAnswers] = useState({})
  const [correctAnswers, setCorrectAnswers] = useState({})
  const [inCutscene, setInCutscene] = useState(true)
  const [lessonStage, setLessonStage] = useState('theory')
  const [cutsceneIndex, setCutsceneIndex] = useState(0)
  const [showCorrectModal, setShowCorrectModal] = useState(false)
  /** Награда для модалки: с API или демо. */
  const [rewardModal, setRewardModal] = useState(null)
  const [shuffledQuiz, setShuffledQuiz] = useState(null)

  const finishCorrectModal = useCallback(() => {
    setShowCorrectModal(false)
    setCompletedView(true)
  }, [])

  const {
    shouldRender: resultModalVisible,
    exiting: resultModalExiting,
    requestClose: requestCloseResultModal,
    handleExitEnd: handleResultModalExitEnd,
  } = useDialogPresence(showCorrectModal, finishCorrectModal)

  const totalQuestions = quizSpec.length
  const isLastQuestion = totalQuestions > 0 && questionStep === totalQuestions

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await apiFetch('/lessons')
      if (!res.ok || cancelled) return
      const list = await res.json().catch(() => [])
      const found = Array.isArray(list)
        ? list.find((l) => l.title === ASGARD_LESSON_TITLE)
        : null
      if (found?.id != null) setAsgardLessonId(found.id)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (user?.role !== 'child' || asgardLessonId == null) return undefined
    let cancelled = false
    ;(async () => {
      const res = await apiFetch('/me/progress')
      if (!res.ok || cancelled) return
      const rows = await res.json().catch(() => [])
      const row = Array.isArray(rows)
        ? rows.find((r) => r.lesson_id === asgardLessonId)
        : null
      if (row?.theory_done) setCompletedView(true)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.role, asgardLessonId])

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

  const handleCorrectAnswer = async () => {
    setRewardModal(null)

    if (user?.role === 'child' && asgardLessonId != null) {
      try {
        const res = await apiFetch(
          `/lessons/${asgardLessonId}/theory-complete`,
          { method: 'POST' },
        )
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          let balance = null
          const wRes = await apiFetch('/me/wallet')
          if (wRes.ok) {
            const w = await wRes.json().catch(() => ({}))
            balance = w.coins ?? w.balance ?? null
          }
          const xp = data.xp_awarded ?? 0
          const coins = data.coins_awarded ?? 0
          setRewardModal({
            mode: 'api',
            xp,
            coins,
            balance,
            duplicate: xp === 0 && coins === 0,
          })
        } else if (res.status === 403) {
          try {
            localStorage.setItem(STORAGE_KEY, '1')
          } catch {
            /* ignore */
          }
          setRewardModal({
            mode: 'offline',
            xp: OFFLINE_REWARD_XP,
            coins: OFFLINE_REWARD_COINS,
            balance: null,
          })
        } else {
          setRewardModal({
            mode: 'error',
            message: parseErrorDetail(data),
          })
        }
      } catch {
        try {
          localStorage.setItem(STORAGE_KEY, '1')
        } catch {
          /* ignore */
        }
        setRewardModal({
          mode: 'offline',
          xp: OFFLINE_REWARD_XP,
          coins: OFFLINE_REWARD_COINS,
          balance: null,
        })
      }
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        /* ignore */
      }
      setRewardModal({
        mode: 'offline',
        xp: OFFLINE_REWARD_XP,
        coins: OFFLINE_REWARD_COINS,
        balance: null,
      })
    }

    setShowCorrectModal(true)
  }

  const handleQuestionAnswer = (step, choiceId, isCorrect) => {
    setAnswers((prev) => ({ ...prev, [step]: choiceId }))
    setCorrectAnswers((prev) => ({ ...prev, [step]: isCorrect }))
  }

  const startTest = () => {
    setShuffledQuiz(shuffleAllQuizSteps(specToQuizSteps(quizSpec)))
    setQuestionStep(1)
    setAnswers({})
    setCorrectAnswers({})
    setLessonStage('test')
  }

  const applyQuizSpecUpdate = (next) => {
    setQuizSpec(next)
    setLessonStage('theory')
    setShuffledQuiz(null)
    setQuestionStep(1)
    setAnswers({})
    setCorrectAnswers({})
  }

  const currentQuestion = quizSpec[questionStep - 1]
  const currentShuffled = shuffledQuiz?.[questionStep]

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
                    setCompletedView(false)
                    setAnswers({})
                    setCorrectAnswers({})
                    setQuestionStep(1)
                    setShowCorrectModal(false)
                    setRewardModal(null)
                    setLessonStage('theory')
                    setInCutscene(true)
                    setCutsceneIndex(0)
                    setShuffledQuiz(null)
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
                className="asg-cutscene-stage asg-cutscene-stage--bg-only"
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
                    <div className="asg-theory-actions">
                      <button type="button" className="asg-btn-primary" onClick={startTest}>
                        Перейти к тесту
                      </button>
                      {isAdmin ? (
                        <AsgardAdminPencilButton onClick={openQuizEditor} />
                      ) : null}
                    </div>
                  </section>
                ) : (
                  <section className="asg-block" aria-labelledby="asg-task-placeholder">
                    <div className="asg-test-heading">
                      <h2 id="asg-task-placeholder" className="asg-h2 asg-h2--test">
                        Тест (вопрос {questionStep} из {totalQuestions || 1})
                      </h2>
                      {isAdmin ? (
                        <AsgardAdminPencilButton onClick={openQuizEditor} />
                      ) : null}
                    </div>
                    {currentQuestion && currentShuffled ? (
                      <>
                        <p className="asg-p">{currentQuestion.prompt}</p>
                        <div
                          className="asg-quiz"
                          role="group"
                          aria-label={`Варианты ответа вопроса ${questionStep}`}
                        >
                          {currentShuffled.map((opt) => (
                            <button
                              key={opt.choiceId}
                              type="button"
                              className={`asg-option${answers[questionStep] === opt.choiceId ? ' asg-option--picked' : ''}${answers[questionStep] === opt.choiceId && !opt.correct ? ' asg-option--wrong' : ''}`}
                              onClick={() =>
                                handleQuestionAnswer(questionStep, opt.choiceId, opt.correct)
                              }
                            >
                              {opt.displayText}
                            </button>
                          ))}
                        </div>
                        {correctAnswers[questionStep] ? (
                          <>
                            <p className="asg-p">Да, правильно!</p>
                            <button
                              type="button"
                              className="asg-btn-primary"
                              onClick={() =>
                                isLastQuestion
                                  ? void handleCorrectAnswer()
                                  : setQuestionStep((s) => s + 1)
                              }
                            >
                              {isLastQuestion
                                ? 'Завершить блок вопросов'
                                : `Перейти к вопросу ${questionStep + 1}`}
                            </button>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <p className="asg-p">
                        Нет данных теста. Вернитесь к теории и откройте тест снова.
                      </p>
                    )}
                  </section>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {resultModalVisible ? (
        <div
          className={`asg-result-backdrop${resultModalExiting ? ' asg-result-backdrop--exit' : ''}`}
          role="presentation"
        >
          <div
            className={`asg-result-modal${resultModalExiting ? ' asg-result-modal--exit' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="asg-result-title"
            onAnimationEnd={handleResultModalExitEnd}
          >
            <h2 id="asg-result-title" className="asg-h2">
              Все правильно!
            </h2>
            <p className="asg-p">
              {rewardModal?.mode === 'error' ? (
                <>{rewardModal.message}</>
              ) : rewardModal?.mode === 'api' && rewardModal.duplicate ? (
                <>
                  Награда за этот урок уже была начислена ранее (повторное прохождение без бонуса).
                </>
              ) : rewardModal?.mode === 'api' ? (
                <>
                  Вы получили +{rewardModal.coins} мон. и +{rewardModal.xp} XP.
                  {rewardModal.balance != null
                    ? ` Текущий баланс: ${rewardModal.balance} мон.`
                    : ''}
                </>
              ) : rewardModal?.mode === 'offline' ? (
                <>
                  За тест положено +{OFFLINE_REWARD_COINS} мон. и +{OFFLINE_REWARD_XP} XP.
                  {user?.role !== 'child'
                    ? ' Войдите как ученик, чтобы начисление сохранилось в профиле.'
                    : ' Начисление на аккаунт недоступно (проверьте связь с сервером).'}
                </>
              ) : (
                <>Завершение урока…</>
              )}
            </p>
            <button
              type="button"
              className="asg-btn-primary"
              onClick={requestCloseResultModal}
            >
              Продолжить
            </button>
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <AsgardQuizEditorModal
          key={quizEditorKey}
          open={quizEditorOpen}
          spec={quizSpec}
          onClose={() => setQuizEditorOpen(false)}
          onSaved={applyQuizSpecUpdate}
        />
      ) : null}
    </div>
  )
}
