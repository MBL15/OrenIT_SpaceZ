import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { VANAHEIM_TASKS, VANAHEIM_TOTAL_TESTS_PER_TASK } from '../lib/vanaheimTasks.js'
import { runPythonIOTests } from '../lib/runVanaheimPython.js'
import { useAuth } from '../AuthContext.jsx'
import { useArtemiySkin } from '../hooks/useArtemiySkin.js'
import { lessonCutsceneBgUrl } from '../lib/lessonCutsceneBg.js'
import './LessonAsgardPage.css'
import './LessonJotunheimPage.css'
import './LessonVanaheimPage.css'

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

/** Катсцена после успешного решения всех задач урока */
const OUTRO_CUTSCENE_LINES = [
  {
    side: 'left',
    speaker: 'Ньёрд',
    content: (
      <>
        Вот это да! Все четыре задачи сданы — грядки считаются сами, полив по графику, удобрения по
        pH… Ты настоящий помощник фермы. Мешок знаний твой.
      </>
    ),
  },
  {
    side: 'right',
    speaker: 'Артемий',
    content: (
      <>
        Тогда идём дальше по курсу — мне ещё много миров показать!
      </>
    ),
  },
  {
    side: 'left',
    speaker: 'Ньёрд',
    content: (
      <>
        Возвращайся на карту и выбирай следующий урок. Удачи на пути!
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
  const [phase, setPhase] = useState('cutscene')
  const [cutsceneIndex, setCutsceneIndex] = useState(0)
  const [taskIndex, setTaskIndex] = useState(0)
  const [codes, setCodes] = useState(initialCodes)
  const [testResults, setTestResults] = useState({})
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const [outroIndex, setOutroIndex] = useState(0)

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
    if (phase !== 'tasks' || !allTasksSolved) return
    setOutroIndex(0)
    setPhase('outro')
  }, [phase, allTasksSolved])

  const currentResults = testResults?.[task.id]

  const backToMap = () => {
    navigate('/app', { state: { openTab: 'cs' } })
  }

  const goToNextReplica = () => {
    if (cutsceneIndex < CUTSCENE_LINES.length - 1) {
      setCutsceneIndex((v) => v + 1)
    }
  }

  const goToNextOutro = () => {
    if (outroIndex < OUTRO_CUTSCENE_LINES.length - 1) {
      setOutroIndex((v) => v + 1)
    }
  }

  const line = CUTSCENE_LINES[cutsceneIndex]
  const isLastCutscene = cutsceneIndex >= CUTSCENE_LINES.length - 1

  const outroLine = OUTRO_CUTSCENE_LINES[outroIndex]
  const isLastOutro = outroIndex >= OUTRO_CUTSCENE_LINES.length - 1

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

  if (phase === 'tasks') {
    return (
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
    )
  }

  if (phase === 'outro') {
    return (
      <div className="asg-wrap">
        <div className="asg-layout">
          <div className="asg-panel">
            <section className="asg-cutscene" aria-labelledby="van-outro-title">
              <div className="asg-cutscene-top">
                <button type="button" className="asg-back" onClick={backToMap}>
                  ← К карте курса
                </button>
                <p className="asg-breadcrumb">Катсцена · Урок завершён</p>
                <h1 id="van-outro-title" className="asg-title">
                  Ванахейм: урок пройден
                </h1>
              </div>

              <div
                className="jot-cutscene-stage"
                style={{ backgroundImage: `url(${vanaCutsceneBgUrl})` }}
                onClick={() => {
                  if (!isLastOutro) goToNextOutro()
                }}
                role="presentation"
              >
                <div
                  className={`jot-bubble ${outroLine.side === 'left' ? 'jot-bubble--left' : 'jot-bubble--right'}`}
                >
                  <span className="jot-bubble-speaker">{outroLine.speaker}</span>
                  <span className="jot-bubble-text van-bubble-text">{outroLine.content}</span>
                </div>
              </div>

              <div className="asg-cutscene-actions">
                <button type="button" className="asg-btn-secondary" onClick={backToMap}>
                  На карту курса
                </button>
                <button
                  type="button"
                  className="asg-btn-primary"
                  onClick={() => {
                    if (isLastOutro) {
                      backToMap()
                    } else {
                      goToNextOutro()
                    }
                  }}
                >
                  {isLastOutro ? 'Готово' : 'Далее'}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
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
