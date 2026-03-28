import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { VANAHEIM_TASKS, VANAHEIM_TOTAL_TESTS_PER_TASK } from '../lib/vanaheimTasks.js'
import { runPythonIOTests } from '../lib/runVanaheimPython.js'
import { useAuth } from '../AuthContext.jsx'
import { useArtemiySkin } from '../hooks/useArtemiySkin.js'
import { lessonCutsceneBgUrl } from '../lib/lessonCutsceneBg.js'
import { apiFetch, parseErrorDetail } from '../api.js'
import { useDialogPresence } from '../hooks/useDialogPresence.js'
import './LessonAsgardPage.css'
import './LessonJotunheimPage.css'
import './LessonVanaheimPage.css'

const VANAHEIM_LESSON_TITLE = 'Ванахейм — знакомство с землёй'
const STORAGE_KEY = 'spaceedu-vanaheim-complete'
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
    speaker: 'Ньёрд',
    content: (
      <>
        О, смотри-ка, помощник! В моих садах урожай поспевает, но без автоматизации я пропаду.
        Видишь эти грядки? Поливать их вручную — глупость. Нужно написать правильные{' '}
        <em>циклы</em> для воды и <em>условия</em> для сортировки гнилых плодов.
      </>
    ),
  },
  {
    side: 'right',
    speaker: 'Артемий',
    content: (
      <>
        Так это как в игре: <em>«пока»</em> не пройдёт весь ряд, <em>«если»</em> овощ хороший —
        кладём в корзину?
      </>
    ),
  },
  {
    side: 'left',
    speaker: 'Ньёрд',
    content: (
      <>
        Верно мыслишь! Настрой мне систему: сколько раз повторить полив, какую переменную
        использовать для удобрений. Сделаешь ферму умной — получишь мешок знаний.
      </>
    ),
  },
]

function initialCodes() {
  return Object.fromEntries(VANAHEIM_TASKS.map((t) => [t.id, '']))
}

export default function LessonVanaheimPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { skinItemId, shopItems } = useArtemiySkin()
  const vanaCutsceneBgUrl = useMemo(
    () => lessonCutsceneBgUrl('vanaheim', user?.role, skinItemId, shopItems),
    [user?.role, skinItemId, shopItems],
  )

  const [vanaheimLessonId, setVanaheimLessonId] = useState(null)
  const [progressGateReady, setProgressGateReady] = useState(
    () => user?.role !== 'child',
  )
  const [completedView, setCompletedView] = useState(() =>
    user?.role === 'child' ? false : readGuestComplete(),
  )
  const [repeatVisitNotice, setRepeatVisitNotice] = useState(false)
  const [showCorrectModal, setShowCorrectModal] = useState(false)
  const [rewardModal, setRewardModal] = useState(null)
  const rewardFlowStartedRef = useRef(false)

  const [phase, setPhase] = useState('cutscene')
  const [cutsceneIndex, setCutsceneIndex] = useState(0)
  const [taskIndex, setTaskIndex] = useState(0)
  const [codes, setCodes] = useState(initialCodes)
  const [testResults, setTestResults] = useState({})
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')

  const task = VANAHEIM_TASKS[taskIndex]
  const totalTasks = VANAHEIM_TASKS.length

  const publicTests = useMemo(() => task.tests.filter((x) => x.public), [task.tests])

  const solvedMap = useMemo(() => {
    const m = {}
    for (const t of VANAHEIM_TASKS) {
      const r = testResults[t.id]
      m[t.id] = Boolean(
        r &&
          r.length === VANAHEIM_TOTAL_TESTS_PER_TASK &&
          r.every((x) => x.ok),
      )
    }
    return m
  }, [testResults])

  const allTasksSolved = useMemo(
    () => VANAHEIM_TASKS.every((t) => solvedMap[t.id]),
    [solvedMap],
  )

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
          ? list.find((l) => l.title === VANAHEIM_LESSON_TITLE)
          : null
        if (found?.id == null) return
        setVanaheimLessonId(found.id)
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

  const handleLessonComplete = useCallback(async () => {
    setRewardModal(null)

    let lessonId = vanaheimLessonId
    if (user?.role === 'child' && lessonId == null) {
      try {
        const res = await apiFetch('/lessons')
        if (res.ok) {
          const list = await res.json().catch(() => [])
          const found = Array.isArray(list)
            ? list.find((l) => l.title === VANAHEIM_LESSON_TITLE)
            : null
          if (found?.id != null) {
            lessonId = found.id
            setVanaheimLessonId(found.id)
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
  }, [user?.role, vanaheimLessonId])

  useEffect(() => {
    if (phase !== 'tasks' || !allTasksSolved) {
      if (!allTasksSolved) rewardFlowStartedRef.current = false
      return
    }
    if (rewardFlowStartedRef.current) return
    rewardFlowStartedRef.current = true
    void handleLessonComplete()
  }, [
    phase,
    allTasksSolved,
    handleLessonComplete,
    user?.role,
    vanaheimLessonId,
  ])

  const currentResults = testResults?.[task.id]

  const backToMap = () => {
    navigate('/app', { state: { openTab: 'cs' } })
  }

  const goToNextReplica = () => {
    if (cutsceneIndex < CUTSCENE_LINES.length - 1) {
      setCutsceneIndex((v) => v + 1)
    }
  }

  const line = CUTSCENE_LINES[cutsceneIndex]
  const isLastCutscene = cutsceneIndex >= CUTSCENE_LINES.length - 1

  const runTests = async () => {
    setRunError('')
    setRunning(true)
    try {
      const suite = await runPythonIOTests(codes[task.id], task.tests, task.referenceCode)
      setTestResults((prev) => ({ ...prev, [task.id]: suite }))
    } catch (e) {
      setRunError(
        typeof e?.message === 'string' ? e.message : 'Не удалось запустить Python в браузере.',
      )
    } finally {
      setRunning(false)
    }
  }

  const resetStarter = () => {
    setCodes((c) => ({ ...c, [task.id]: '' }))
    setTestResults((prev) => {
      const next = { ...prev }
      delete next[task.id]
      return next
    })
  }

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
              <h1 className="asg-title">Урок «Ванахейм» пройден</h1>
              {repeatVisitNotice ? (
                <div className="asg-repeat-banner" role="status">
                  <p className="asg-p">
                    Этот урок вы уже проходили. При повторном прохождении монеты и ОП начисляться не
                    будут.
                  </p>
                </div>
              ) : (
                <p className="asg-lead">
                  Вы завершили урок «Ванахейм». Можно возвращаться к карте и открывать следующие точки.
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
                    rewardFlowStartedRef.current = false
                    setPhase('cutscene')
                    setCutsceneIndex(0)
                    setTaskIndex(0)
                    setCodes(initialCodes())
                    setTestResults({})
                    setShowCorrectModal(false)
                    setRewardModal(null)
                    setRunError('')
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

  if (phase === 'tasks') {
    return (
      <>
      <div className="asg-wrap">
        <div className="asg-layout">
          <div className="asg-panel">
            <header className="asg-header">
              <button type="button" className="asg-back" onClick={backToMap}>
                ← К карте курса
              </button>
              <p className="asg-breadcrumb">Основы информатики · Урок 3 · Python</p>
              <h1 className="asg-title">Ванахейм: циклы и условия</h1>
            </header>

            <div className="asg-body van-tasks-body">
              <nav className="van-task-tabs" aria-label="Задачи урока">
                {VANAHEIM_TASKS.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`van-task-tab${i === taskIndex ? ' van-task-tab--on' : ''}`}
                    onClick={() => {
                      setTaskIndex(i)
                      setRunError('')
                    }}
                  >
                    <span className="van-task-tab-n">{i + 1}</span>
                    {t.title}
                    {solvedMap[t.id] ? (
                      <span className="van-task-tab-done" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                ))}
              </nav>

              <section className="asg-block van-task-section" aria-labelledby="van-task-title">
                <h2 id="van-task-title" className="asg-h2">
                  Задача {taskIndex + 1} из {totalTasks}: {task.title}
                </h2>
                <p className="asg-p">{task.story}</p>
                <p className="asg-p van-task-req">{task.requirements}</p>

                {task.bookExample ? (
                  <div className="van-book-example">
                    <h3 className="van-io-title">Пример ввода и вывода</h3>
                    <div className="van-book-example-grid">
                      <div>
                        <p className="van-book-example-label">Пример ввода</p>
                        <pre className="van-io-pre">{task.bookExample.stdin}</pre>
                      </div>
                      <div>
                        <p className="van-book-example-label">Пример вывода</p>
                        <pre className="van-io-pre">{task.bookExample.stdout}</pre>
                      </div>
                    </div>
                    {task.bookExample.note ? (
                      <p className="van-book-example-note">{task.bookExample.note}</p>
                    ) : null}
                  </div>
                ) : null}

                <p className="van-io-hint van-io-hint--after-example">
                  Автопроверка сравнивает <strong>stdout</strong> с эталоном. Дополнительно
                  запускаются {VANAHEIM_TOTAL_TESTS_PER_TASK - 1} скрытых теста (ввод и эталон не
                  показываются).
                </p>

                <div className="asg-terminal van-terminal-wrap">
                  <div className="asg-terminal-head">Python · редактор (изначально пустой)</div>
                  <textarea
                    className="van-terminal-input"
                    spellCheck={false}
                    value={codes[task.id]}
                    onChange={(e) =>
                      setCodes((c) => ({ ...c, [task.id]: e.target.value }))
                    }
                    aria-label="Код на Python"
                  />
                </div>

                <div className="van-task-actions">
                  <button
                    type="button"
                    className="asg-btn-primary"
                    disabled={running}
                    onClick={() => void runTests()}
                  >
                    {running ? 'Проверка…' : 'Запустить проверку'}
                  </button>
                  <button
                    type="button"
                    className="asg-btn-secondary"
                    disabled={running}
                    onClick={resetStarter}
                  >
                    Очистить код
                  </button>
                </div>

                {runError ? <p className="van-run-err">{runError}</p> : null}

                {currentResults ? (
                  <div className="van-test-grid" role="list" aria-label="Результаты проверки">
                    {(() => {
                      const pub = currentResults.find((x) => x.public)
                      const hidden = currentResults.filter((x) => !x.public)
                      const hiddenOk = hidden.filter((x) => x.ok).length
                      const hiddenTotal = hidden.length
                      const pubRow = publicTests[0]
                      return (
                        <>
                          {pub ? (
                            <div
                              role="listitem"
                              className={`van-test-row${pub.ok ? ' van-test-row--ok' : ' van-test-row--fail'}`}
                            >
                              <div className="van-test-head">
                                <span className="van-test-badge">{pub.ok ? '✓' : '✗'}</span>
                                <span className="van-test-label">Публичный тест</span>
                              </div>
                              {pubRow ? (
                                <dl className="van-test-io">
                                  <div>
                                    <dt>Вход (stdin)</dt>
                                    <dd>
                                      <pre className="van-io-pre van-io-pre--compact">
                                        {pubRow.stdin}
                                      </pre>
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Ожидаемый вывод</dt>
                                    <dd>
                                      <pre className="van-io-pre van-io-pre--compact">
                                        {pub.expected ?? '—'}
                                      </pre>
                                    </dd>
                                  </div>
                                </dl>
                              ) : null}
                              {!pub.ok && pub.error ? (
                                <pre className="van-test-err">{pub.error}</pre>
                              ) : null}
                            </div>
                          ) : null}
                          <div
                            role="listitem"
                            className={`van-hidden-summary${hiddenOk === hiddenTotal ? ' van-hidden-summary--ok' : ' van-hidden-summary--fail'}`}
                          >
                            <span className="van-test-badge">
                              {hiddenOk === hiddenTotal ? '✓' : '✗'}
                            </span>
                            <span>
                              Скрытые тесты ({hiddenTotal}):{' '}
                              {hiddenOk === hiddenTotal
                                ? 'все пройдены'
                                : `пройдено ${hiddenOk} из ${hiddenTotal}`}
                            </span>
                            {hiddenOk < hiddenTotal ? (
                              <p className="van-hidden-note">
                                Ввод и эталон скрытых тестов не показываются.
                              </p>
                            ) : null}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                ) : null}

                {currentResults &&
                currentResults.length === VANAHEIM_TOTAL_TESTS_PER_TASK &&
                currentResults.every((x) => x.ok) ? (
                  <p className="van-all-pass" role="status">
                    Все тесты пройдены (1 публичный и {VANAHEIM_TOTAL_TESTS_PER_TASK - 1} скрытых).
                    Можно переходить к следующей задаче.
                  </p>
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
              aria-labelledby="van-result-title"
              onAnimationEnd={handleResultModalExitEnd}
            >
              <h2 id="van-result-title" className="asg-h2">
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
          <section className="asg-cutscene" aria-labelledby="van-cutscene-title">
            <div className="asg-cutscene-top">
              <button type="button" className="asg-back" onClick={backToMap}>
                ← К карте курса
              </button>
              <p className="asg-breadcrumb">Катсцена · Урок 3</p>
              <h1 id="van-cutscene-title" className="asg-title">
                Ванахейм: у Ньёрда в садах
              </h1>
            </div>

            <div
              className="jot-cutscene-stage"
              style={{ backgroundImage: `url(${vanaCutsceneBgUrl})` }}
              onClick={goToNextReplica}
              role="presentation"
            >
              <div
                className={`jot-bubble ${line.side === 'left' ? 'jot-bubble--left' : 'jot-bubble--right'}`}
              >
                <span className="jot-bubble-speaker">{line.speaker}</span>
                <span className="jot-bubble-text van-bubble-text">{line.content}</span>
              </div>
            </div>

            <div className="asg-cutscene-actions">
              <button
                type="button"
                className="asg-btn-secondary"
                onClick={() => setPhase('tasks')}
              >
                Пропустить
              </button>
              <button
                type="button"
                className="asg-btn-primary"
                onClick={() => {
                  if (!isLastCutscene) {
                    goToNextReplica()
                  } else {
                    setPhase('tasks')
                  }
                }}
              >
                {isLastCutscene ? 'К задачам' : 'Далее'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
