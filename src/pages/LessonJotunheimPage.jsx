import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { JOTUNHEIM_QUIZ_SPEC, JOTUN_OPS } from '../lib/jotunheimQuizSpec.js'
import { shuffleArray } from '../lib/shuffleQuizOptions.js'
import { useAuth } from '../AuthContext.jsx'
import { useArtemiySkin } from '../hooks/useArtemiySkin.js'
import { lessonCutsceneBgUrl } from '../lib/lessonCutsceneBg.js'
import { apiFetch, parseErrorDetail } from '../api.js'
import { useDialogPresence } from '../hooks/useDialogPresence.js'
import './LessonAsgardPage.css'
import './LessonJotunheimPage.css'

/** Совпадает с названием урока в БД (seed). */
const JOTUNHEIM_LESSON_TITLE = 'Йотунхейм — встреча с драконом'
const STORAGE_KEY = 'spaceedu-jotunheim-complete'
const OFFLINE_REWARD_COINS = 10
const OFFLINE_REWARD_XP = 100

function readGuestComplete() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const CUTSCENE_LINES = [
  {
    side: 'left',
    speaker: 'Алиса',
    text:
      'Огонь приветствует тебя, зверек! Я — Алиса, хранительница порядка. Многие пытались пройти мимо, но сгорали в пламени… неверных ответов. Я задам тебе задачи из самого сердца ОГЭ. Покажешь мне таблицы истинности и фрагменты кода — получишь мое уважение.',
  },
  {
    side: 'right',
    speaker: 'Артемий',
    text: 'Я не хочу сгореть! Давайте ваши задания!',
  },
  {
    side: 'left',
    speaker: 'Алиса',
    text:
      'Не дрожи. Я атакую логическими запросами. Твоя защита — правильный ответ. Три точных попадания — и я сложу крылья.',
  },
]

export default function LessonJotunheimPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { skinItemId, shopItems } = useArtemiySkin()
  const jotunCutsceneBgUrl = useMemo(
    () => lessonCutsceneBgUrl('jotunheim', user?.role, skinItemId, shopItems),
    [user?.role, skinItemId, shopItems],
  )

  const [jotunheimLessonId, setJotunheimLessonId] = useState(null)
  /** Пока false — для ученика не показываем катсцену (ждём урок + прогресс, чтобы сразу дать «уже пройдено»). */
  const [progressGateReady, setProgressGateReady] = useState(
    () => user?.role !== 'child',
  )
  const [completedView, setCompletedView] = useState(() =>
    user?.role === 'child' ? false : readGuestComplete(),
  )
  /** true — зашли на страницу, урок уже был сдан (показать предупреждение о повторе). */
  const [repeatVisitNotice, setRepeatVisitNotice] = useState(false)
  const [showCorrectModal, setShowCorrectModal] = useState(false)
  const [rewardModal, setRewardModal] = useState(null)

  /** cutscene | quiz */
  const [view, setView] = useState('cutscene')
  const [cutsceneIndex, setCutsceneIndex] = useState(0)

  const [questionStep, setQuestionStep] = useState(1)
  /** выбранный в пропуске id: and | or | imp */
  const [slotOpId, setSlotOpId] = useState(null)
  /** null | 'correct' | 'wrong' */
  const [slotOutcome, setSlotOutcome] = useState(null)

  const totalQuestions = JOTUNHEIM_QUIZ_SPEC.length
  const isLastQuestion = totalQuestions > 0 && questionStep === totalQuestions
  const currentQuestion = JOTUNHEIM_QUIZ_SPEC[questionStep - 1]

  const bankOrder = useMemo(() => shuffleArray(JOTUN_OPS.map((o) => ({ ...o }))), [questionStep])

  useEffect(() => {
    setSlotOpId(null)
    setSlotOutcome(null)
  }, [questionStep])

  useEffect(() => {
    if (user?.role !== 'child') {
      setProgressGateReady(true)
      return undefined
    }
    let cancelled = false
    setProgressGateReady(false)
    ;(async () => {
      try {
        const res = await apiFetch('/lessons')
        if (!res.ok || cancelled) return
        const list = await res.json().catch(() => [])
        const found = Array.isArray(list)
          ? list.find((l) => l.title === JOTUNHEIM_LESSON_TITLE)
          : null
        if (found?.id == null) return
        setJotunheimLessonId(found.id)
        const pr = await apiFetch('/me/progress')
        if (!pr.ok || cancelled) return
        const rows = await pr.json().catch(() => [])
        const row = Array.isArray(rows)
          ? rows.find((r) => Number(r.lesson_id) === Number(found.id))
          : null
        if (row?.theory_done) {
          setCompletedView(true)
          setRepeatVisitNotice(true)
        }
      } finally {
        if (!cancelled) setProgressGateReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.role])

  const finishCorrectModal = useCallback(() => {
    setShowCorrectModal(false)
    setCompletedView(true)
    setRepeatVisitNotice(false)
  }, [])

  const {
    shouldRender: resultModalVisible,
    exiting: resultModalExiting,
    requestClose: requestCloseResultModal,
    handleExitEnd: handleResultModalExitEnd,
  } = useDialogPresence(showCorrectModal, finishCorrectModal)

  const handleLessonComplete = async () => {
    setRewardModal(null)

    let lessonId = jotunheimLessonId
    if (user?.role === 'child' && lessonId == null) {
      try {
        const res = await apiFetch('/lessons')
        if (res.ok) {
          const list = await res.json().catch(() => [])
          const found = Array.isArray(list)
            ? list.find((l) => l.title === JOTUNHEIM_LESSON_TITLE)
            : null
          if (found?.id != null) {
            lessonId = found.id
            setJotunheimLessonId(found.id)
          }
        }
      } catch {
        /* ниже — офлайн / гость */
      }
    }

    if (user?.role === 'child' && lessonId != null) {
      try {
        const res = await apiFetch(`/lessons/${lessonId}/theory-complete`, {
          method: 'POST',
        })
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

  const backToMap = () => {
    navigate('/app', { state: { openTab: 'cs' } })
  }

  const goToNextReplica = () => {
    if (cutsceneIndex < CUTSCENE_LINES.length - 1) {
      setCutsceneIndex((v) => v + 1)
    }
  }

  const startQuiz = () => {
    setQuestionStep(1)
    setSlotOpId(null)
    setSlotOutcome(null)
    setView('quiz')
  }

  const placeOpInSlot = useCallback(
    (opId) => {
      if (!currentQuestion) return
      setSlotOpId(opId)
      setSlotOutcome(opId === currentQuestion.correctOpId ? 'correct' : 'wrong')
    },
    [currentQuestion],
  )

  const onDragStartOp = (e, opId) => {
    e.dataTransfer.setData('text/plain', opId)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const onDragOverSlot = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDropSlot = (e) => {
    e.preventDefault()
    const opId = e.dataTransfer.getData('text/plain')
    if (opId === 'and' || opId === 'or' || opId === 'imp') {
      placeOpInSlot(opId)
    }
  }

  const line = CUTSCENE_LINES[cutsceneIndex]

  if (user?.role === 'child' && !progressGateReady) {
    return (
      <div className="asg-wrap">
        <div className="asg-layout">
          <div className="asg-panel">
            <p className="asg-p" style={{ padding: '2rem' }}>
              Загрузка…
            </p>
          </div>
        </div>
      </div>
    )
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
              <h1 className="asg-title">Урок «Йотунхейм» пройден</h1>
              {repeatVisitNotice ? (
                <div className="asg-repeat-banner" role="status">
                  <p className="asg-p">
                    Этот урок вы уже проходили. При повторном прохождении монеты и ОП начисляться не
                    будут.
                  </p>
                </div>
              ) : (
                <p className="asg-lead">
                  Вы завершили урок «Йотунхейм». Можно возвращаться к карте и открывать следующие
                  точки.
                </p>
              )}
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
                    setRepeatVisitNotice(false)
                    setView('cutscene')
                    setCutsceneIndex(0)
                    setQuestionStep(1)
                    setSlotOpId(null)
                    setSlotOutcome(null)
                    setShowCorrectModal(false)
                    setRewardModal(null)
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

  if (view === 'quiz' && currentQuestion) {
    const slotSymbol = slotOpId ? JOTUN_OPS.find((o) => o.id === slotOpId)?.symbol : null

    return (
      <>
        <div className="asg-wrap">
        <div className="asg-layout">
          <div className="asg-panel">
            <header className="asg-header">
              <button type="button" className="asg-back" onClick={backToMap}>
                ← К карте курса
              </button>
              <p className="asg-breadcrumb">Основы информатики · Урок 2 · ОГЭ-стиль</p>
              <h1 className="asg-title">Йотунхейм — логические операции</h1>
            </header>
            <div className="asg-body">
              <section className="asg-block" aria-labelledby="jot-quiz">
                <div className="asg-test-heading">
                  <h2 id="jot-quiz" className="asg-h2 asg-h2--test">
                    Задание {questionStep} из {totalQuestions || 1}
                  </h2>
                </div>
                <p className="asg-p jot-quiz-hint">
                  Перетащите карточку с нужным знаком в рамку выражения (или нажмите на карточку). Истина
                  = 1, ложь = 0.
                </p>
                <p className="asg-p">{currentQuestion.prompt}</p>

                <div className="jot-expr" aria-label="Логическое выражение с пропуском">
                  <span className="jot-expr-part">{currentQuestion.exprBefore}</span>
                  <div
                    className={`jot-slot${slotOutcome === 'correct' ? ' jot-slot--ok' : ''}${slotOutcome === 'wrong' ? ' jot-slot--bad' : ''}`}
                    onDragOver={onDragOverSlot}
                    onDrop={onDropSlot}
                    role="group"
                    aria-label="Пропуск: перетащите сюда ∧, ∨ или →"
                  >
                    {slotSymbol ?? <span className="jot-slot-placeholder">?</span>}
                  </div>
                  <span className="jot-expr-part">{currentQuestion.exprAfter}</span>
                </div>

                <p className="jot-bank-label">Карточки операций:</p>
                <div className="jot-bank">
                  {bankOrder.map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      draggable
                      className="jot-op-card"
                      title={`${op.symbol} — ${op.subtitle}`}
                      aria-label={`Операция ${op.symbol}, ${op.subtitle}`}
                      onDragStart={(e) => onDragStartOp(e, op.id)}
                      onClick={() => placeOpInSlot(op.id)}
                    >
                      <span className="jot-op-card-symbol">{op.symbol}</span>
                      <span className="jot-op-card-sub">{op.subtitle}</span>
                    </button>
                  ))}
                </div>

                {slotOutcome === 'wrong' ? (
                  <p className="asg-p jot-quiz-feedback jot-quiz-feedback--bad" role="status">
                    Неверно — перетащите другую карточку в пропуск или нажмите на неё.
                  </p>
                ) : null}
                {slotOutcome === 'correct' ? (
                  <>
                    <p className="asg-p jot-quiz-feedback jot-quiz-feedback--ok" role="status">
                      Верно!
                    </p>
                    <button
                      type="button"
                      className="asg-btn-primary"
                      onClick={() => {
                        if (isLastQuestion) {
                          void handleLessonComplete()
                        } else {
                          setQuestionStep((s) => s + 1)
                        }
                      }}
                    >
                      {isLastQuestion
                        ? 'Завершить блок вопросов'
                        : `Задание ${questionStep + 1}`}
                    </button>
                  </>
                ) : null}
              </section>
            </div>
          </div>
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
              aria-labelledby="jot-result-title"
              onAnimationEnd={handleResultModalExitEnd}
            >
              <h2 id="jot-result-title" className="asg-h2">
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
                    Вы получили +{rewardModal.coins} мон. и +{rewardModal.xp} ОП.
                    {rewardModal.balance != null
                      ? ` Текущий баланс: ${rewardModal.balance} мон.`
                      : ''}
                  </>
                ) : rewardModal?.mode === 'offline' ? (
                  <>
                    За тест положено +{OFFLINE_REWARD_COINS} мон. и +{OFFLINE_REWARD_XP} ОП.
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
      </>
    )
  }

  return (
    <div className="asg-wrap">
      <div className="asg-layout">
        <div className="asg-panel">
          <section className="asg-cutscene" aria-labelledby="jot-cutscene-title">
            <div className="asg-cutscene-top">
              <button type="button" className="asg-back" onClick={backToMap}>
                ← К карте курса
              </button>
              <p className="asg-breadcrumb">Катсцена · Урок 2</p>
              <h1 id="jot-cutscene-title" className="asg-title">
                Йотунхейм: встреча с Алисой
              </h1>
            </div>

            <div
              className="jot-cutscene-stage"
              style={{ backgroundImage: `url(${jotunCutsceneBgUrl})` }}
              onClick={goToNextReplica}
              role="presentation"
            >
              <div
                className={`jot-bubble ${line.side === 'left' ? 'jot-bubble--left' : 'jot-bubble--right'}`}
              >
                <span className="jot-bubble-speaker">{line.speaker}</span>
                <span className="jot-bubble-text">{line.text}</span>
              </div>
            </div>

            <div className="asg-cutscene-actions">
              <button type="button" className="asg-btn-secondary" onClick={startQuiz}>
                Пропустить катсцену
              </button>
              <button
                type="button"
                className="asg-btn-primary"
                onClick={() => {
                  if (cutsceneIndex < CUTSCENE_LINES.length - 1) {
                    goToNextReplica()
                  } else {
                    startQuiz()
                  }
                }}
              >
                {cutsceneIndex < CUTSCENE_LINES.length - 1 ? 'Далее' : 'К заданиям'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
