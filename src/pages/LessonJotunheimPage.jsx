import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { JOTUNHEIM_QUIZ_SPEC, JOTUN_OPS } from '../lib/jotunheimQuizSpec.js'
import { shuffleArray } from '../lib/shuffleQuizOptions.js'
import { useAuth } from '../AuthContext.jsx'
import { useArtemiySkin } from '../hooks/useArtemiySkin.js'
import { lessonCutsceneBgUrl } from '../lib/lessonCutsceneBg.js'
import './LessonAsgardPage.css'
import './LessonJotunheimPage.css'

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

/** Катсцена после успешного прохождения всех трёх задач */
const OUTRO_LINES = [
  {
    side: 'left',
    speaker: 'Алиса',
    text: 'Ты ответил правильно на мои вопросы. Я тебя пропускаю дальше.',
  },
  {
    side: 'right',
    speaker: 'Артемий',
    text: 'Спасибо! Тогда иду по карте дальше.',
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
  /** cutscene | quiz | outro | success */
  const [view, setView] = useState('cutscene')
  const [cutsceneIndex, setCutsceneIndex] = useState(0)
  const [outroIndex, setOutroIndex] = useState(0)

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
    setOutroIndex(0)
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
  const outroLine = OUTRO_LINES[outroIndex]

  const goToNextOutro = () => {
    if (outroIndex < OUTRO_LINES.length - 1) {
      setOutroIndex((v) => v + 1)
    }
  }

  if (view === 'success') {
    return (
      <div className="asg-wrap">
        <div className="asg-layout">
          <div className="asg-panel">
            <div className="asg-success" style={{ padding: '32px 24px' }}>
              <button type="button" className="asg-back asg-back--success" onClick={backToMap}>
                ← К карте курса
              </button>
              <span className="asg-success-icon" aria-hidden>
                ✓
              </span>
              <h1 className="asg-title">Урок «Йотунхейм» пройден</h1>
              <p className="asg-lead">
                Логические операции освоены. Возвращайтесь к карте курса или пройдите урок снова.
              </p>
              <div className="asg-success-actions">
                <button type="button" className="asg-btn-primary" onClick={backToMap}>
                  Вернуться к карте
                </button>
                <button
                  type="button"
                  className="asg-btn-secondary"
                  onClick={() => {
                    setView('cutscene')
                    setCutsceneIndex(0)
                    setOutroIndex(0)
                    setQuestionStep(1)
                    setSlotOpId(null)
                    setSlotOutcome(null)
                  }}
                >
                  С начала урока
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'outro') {
    return (
      <div className="asg-wrap">
        <div className="asg-layout">
          <div className="asg-panel">
            <section className="asg-cutscene" aria-labelledby="jot-outro-title">
              <div className="asg-cutscene-top">
                <button type="button" className="asg-back" onClick={backToMap}>
                  ← К карте курса
                </button>
                <p className="asg-breadcrumb">Катсцена · После испытания</p>
                <h1 id="jot-outro-title" className="asg-title">
                  Йотунхейм: прощание с Алисой
                </h1>
              </div>

              <div
                className="jot-cutscene-stage"
                style={{ backgroundImage: `url(${jotunCutsceneBgUrl})` }}
                onClick={goToNextOutro}
                role="presentation"
              >
                <div
                  className={`jot-bubble ${outroLine.side === 'left' ? 'jot-bubble--left' : 'jot-bubble--right'}`}
                >
                  <span className="jot-bubble-speaker">{outroLine.speaker}</span>
                  <span className="jot-bubble-text">{outroLine.text}</span>
                </div>
              </div>

              <div className="asg-cutscene-actions">
                <button
                  type="button"
                  className="asg-btn-primary"
                  onClick={() => {
                    if (outroIndex < OUTRO_LINES.length - 1) {
                      goToNextOutro()
                    } else {
                      setView('success')
                    }
                  }}
                >
                  {outroIndex < OUTRO_LINES.length - 1 ? 'Далее' : 'Продолжить'}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'quiz' && currentQuestion) {
    const slotSymbol = slotOpId ? JOTUN_OPS.find((o) => o.id === slotOpId)?.symbol : null

    return (
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
                          setOutroIndex(0)
                          setView('outro')
                        } else {
                          setQuestionStep((s) => s + 1)
                        }
                      }}
                    >
                      {isLastQuestion ? 'К финальной сцене' : `Задание ${questionStep + 1}`}
                    </button>
                  </>
                ) : null}
              </section>
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
