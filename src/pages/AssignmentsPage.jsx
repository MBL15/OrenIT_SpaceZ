import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, Navigate } from 'react-router-dom'
import { apiFetch, parseErrorDetail } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { useDialogPresence } from '../hooks/useDialogPresence.js'
import { collectStudentStdouts } from '../lib/runVanaheimPython.js'
import './AssignmentsPage.css'

function safeText(v) {
  if (v == null) return ''
  return String(v)
}

function rewardLine(row) {
  const c = Number(row.reward_coins) || 0
  const x = Number(row.reward_xp) || 0
  const bits = []
  bits.push(c > 0 ? `${c} мон.` : 'без монет')
  if (x > 0) bits.push(`${x} XP`)
  return bits.join(' · ')
}

/** Убирает дубликаты по choice_id (иногда в ответе API повторяется вариант). */
function dedupeChoices(choices) {
  if (!Array.isArray(choices)) return []
  const seen = new Set()
  const out = []
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i]
    const id = String(c.choice_id ?? c.choiceId ?? i)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(c)
  }
  return out
}

export default function AssignmentsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loadErr, setLoadErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [workout, setWorkout] = useState(null)
  const [answer, setAnswer] = useState('')
  const [workErr, setWorkErr] = useState('')
  const [startErr, setStartErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [terminalCode, setTerminalCode] = useState('')
  const [dragPlaced, setDragPlaced] = useState({})
  const [dragActive, setDragActive] = useState(null)

  const lastWorkoutRef = useRef(null)
  if (workout) lastWorkoutRef.current = workout

  const closeWorkout = useCallback(() => {
    setWorkout(null)
    setAnswer('')
    setWorkErr('')
    setStartErr('')
  }, [])

  const {
    shouldRender: workoutModalVisible,
    exiting: workoutExiting,
    requestClose: requestCloseWorkout,
    handleExitEnd: handleWorkoutExitEnd,
  } = useDialogPresence(Boolean(workout), closeWorkout)

  const displayWorkout = workout ?? lastWorkoutRef.current

  const load = useCallback(async () => {
    setLoadErr('')
    setLoading(true)
    try {
      const res = await apiFetch('/me/assignments')
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        setLoadErr(parseErrorDetail(data))
        setRows([])
        return
      }
      setRows(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'child') load()
  }, [user?.role, load])

  useEffect(() => {
    if (!workoutModalVisible) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [workoutModalVisible])

  useEffect(() => {
    if (!workout?.instanceId) return
    if (workout.ui_mode === 'terminal_io') {
      setTerminalCode('')
    }
    if (workout.ui_mode === 'dragdrop' && workout.task_payload?.slots) {
      const o = {}
      for (const s of workout.task_payload.slots) {
        o[s.id] = ''
      }
      setDragPlaced(o)
    }
    setDragActive(null)
  }, [workout?.instanceId, workout?.ui_mode, workout?.task_payload])

  if (user?.role !== 'child') {
    return <Navigate to="/app" replace />
  }

  const startTask = async (taskTemplateId, assignmentId, blockMode = null) => {
    setWorkErr('')
    setStartErr('')
    setAnswer('')
    const q =
      assignmentId != null
        ? `?assignment_id=${encodeURIComponent(String(assignmentId))}`
        : ''
    const res = await apiFetch(`/practice/start/${taskTemplateId}${q}`, {
      method: 'POST',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setStartErr(parseErrorDetail(data))
      return
    }
    const instanceId = data.instance_id ?? data.instanceId
    if (instanceId == null || instanceId === '') {
      setStartErr('Сервер не вернул номер задания. Обновите страницу.')
      return
    }
    setWorkout({
      templateId: taskTemplateId,
      instanceId,
      prompt: data.prompt || '',
      ui_mode: data.ui_mode ?? null,
      choices: Array.isArray(data.choices) ? data.choices : null,
      task_payload: data.task_payload ?? null,
      notice: data.notice ?? null,
      blockMode,
    })
  }

  const startBlock = (row) => {
    if (!row.tasks?.length) return
    const first = row.tasks[0]
    startTask(first.task_template_id, first.assignment_id, {
      blockId: row.block_id,
      tasks: row.tasks,
      index: 0,
    })
  }

  const submitAnswer = async (e) => {
    e.preventDefault()
    if (!workout) return
    if (
      workout.ui_mode === 'asgard_mc' &&
      workout.choices?.length > 0 &&
      !answer.trim()
    ) {
      setWorkErr('Выберите вариант ответа')
      return
    }
    if (workout.ui_mode === 'terminal_io' && !terminalCode.trim()) {
      setWorkErr('Напишите программу на Python.')
      return
    }
    let bodyPayload = { answer: answer.trim() }
    if (workout.ui_mode === 'terminal_io') {
      const tests = workout.task_payload?.tests || []
      if (!tests.length) {
        setWorkErr('Нет тестов в задании.')
        return
      }
      setWorkErr('')
      setSubmitting(true)
      try {
        const stdins = tests.map((t) => t.stdin)
        const outs = await collectStudentStdouts(terminalCode, stdins)
        bodyPayload = { answer: '', terminal_outputs: outs }
      } catch (err) {
        setWorkErr(err instanceof Error ? err.message : 'Ошибка выполнения кода')
        setSubmitting(false)
        return
      }
    } else if (workout.ui_mode === 'dragdrop') {
      const mapping = {}
      for (const [k, v] of Object.entries(dragPlaced)) {
        if (v) mapping[k] = v
      }
      const slots = workout.task_payload?.slots || []
      if (slots.length && slots.some((s) => !mapping[s.id])) {
        setWorkErr('Заполните все области.')
        return
      }
      bodyPayload = { answer: '', dragdrop_mapping: mapping }
    }
    setWorkErr('')
    setSubmitting(true)
    try {
      const res = await apiFetch(`/practice/submit/${workout.instanceId}`, {
        method: 'POST',
        body: JSON.stringify(bodyPayload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setWorkErr(parseErrorDetail(data))
        return
      }
      const bm = workout.blockMode
      if (bm && !data.correct) {
        setWorkout((w) => (w ? { ...w, result: data, done: true } : w))
        await load()
        return
      }
      if (
        bm &&
        data.correct &&
        bm.index < bm.tasks.length - 1
      ) {
        const nextIdx = bm.index + 1
        const next = bm.tasks[nextIdx]
        setAnswer('')
        setWorkErr('')
        const q = `?assignment_id=${encodeURIComponent(String(next.assignment_id))}`
        const res2 = await apiFetch(`/practice/start/${next.task_template_id}${q}`, {
          method: 'POST',
        })
        const data2 = await res2.json().catch(() => ({}))
        if (!res2.ok) {
          setWorkErr(parseErrorDetail(data2))
          setWorkout((w) => (w ? { ...w, result: data, done: true } : w))
          return
        }
        const instanceId = data2.instance_id ?? data2.instanceId
        if (instanceId == null || instanceId === '') {
          setWorkErr('Сервер не вернул номер задания.')
          setWorkout((w) => (w ? { ...w, result: data, done: true } : w))
          return
        }
        setWorkout({
          templateId: next.task_template_id,
          instanceId,
          prompt: data2.prompt || '',
          ui_mode: data2.ui_mode ?? null,
          choices: Array.isArray(data2.choices) ? data2.choices : null,
          task_payload: data2.task_payload ?? null,
          notice: data2.notice ?? null,
          blockMode: { ...bm, index: nextIdx },
        })
        await load()
        return
      }
      setWorkout((w) => (w ? { ...w, result: data, done: true } : w))
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  const overlayMouseDown = (e) => {
    if (e.target === e.currentTarget && displayWorkout?.done) requestCloseWorkout()
  }

  return (
    <div className="asm-page">
      <div className="asm-shell">
        <Link className="asm-back" to="/app">
          ← К разделам
        </Link>

        <header className="asm-hero">
          <h1 className="asm-title">Задания от учителя</h1>
          <p className="asm-lead">
            Задания по классам, в которые вы вступили по коду приглашения. За
            верное решение начисляются монеты — их можно потратить в профиле в
            магазине скинов.
          </p>
        </header>

        {startErr ? <p className="asm-alert">{startErr}</p> : null}

        {loading ? (
          <p className="asm-lead" style={{ marginTop: 8 }}>
            Загрузка…
          </p>
        ) : loadErr ? (
          <p className="asm-alert">{loadErr}</p>
        ) : rows.length === 0 ? (
          <p className="asm-empty">
            Пока нет назначенных заданий. Вступите в класс по коду на странице
            «Мой класс».
          </p>
        ) : (
          <ul className="asm-list">
            {rows.map((a) =>
              a.kind === 'block' && Array.isArray(a.tasks) && a.tasks.length > 0 ? (
                <li key={`block-${a.block_id}`} className="asm-card">
                  <div className="asm-card__main">
                    <h2 className="asm-card__lesson">Блок заданий</h2>
                    <p className="asm-card__task" style={{ marginTop: 6 }}>
                      {a.tasks.length} заданий
                    </p>
                    <ol
                      className="asm-block-task-list"
                      style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 14 }}
                    >
                      {a.tasks.map((t) => (
                        <li key={t.assignment_id}>
                          <span className="asm-card__lesson" style={{ fontSize: '1em' }}>
                            {safeText(t.lesson_title)}
                          </span>
                          {t.task_title ? (
                            <span> — {safeText(t.task_title)}</span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                    <div className="asm-card__row">
                      <span className="asm-badge">{safeText(a.class_name)}</span>
                      <span className="asm-badge asm-badge--reward">
                        {rewardLine(a)}
                      </span>
                      {a.bonus_claimed ? (
                        <span className="asm-badge asm-badge--done">
                          бонус получен
                        </span>
                      ) : null}
                    </div>
                    {a.note ? (
                      <p className="asm-card__note">{safeText(a.note)}</p>
                    ) : null}
                  </div>
                  <div className="asm-card__action">
                    <button
                      type="button"
                      className="asm-btn"
                      onClick={() => startBlock(a)}
                    >
                      {a.bonus_claimed ? 'Повторить блок' : 'Решить блок'}
                    </button>
                  </div>
                </li>
              ) : (
                <li key={a.assignment_id} className="asm-card">
                  <div className="asm-card__main">
                    <h2 className="asm-card__lesson">{safeText(a.lesson_title)}</h2>
                    {a.task_title ? (
                      <p className="asm-card__task">{safeText(a.task_title)}</p>
                    ) : null}
                    <div className="asm-card__row">
                      <span className="asm-badge">{safeText(a.class_name)}</span>
                      <span className="asm-badge asm-badge--reward">
                        {rewardLine(a)}
                      </span>
                      {a.bonus_claimed ? (
                        <span className="asm-badge asm-badge--done">
                          бонус получен
                        </span>
                      ) : null}
                    </div>
                    {a.note ? (
                      <p className="asm-card__note">{safeText(a.note)}</p>
                    ) : null}
                  </div>
                  <div className="asm-card__action">
                    <button
                      type="button"
                      className="asm-btn"
                      onClick={() =>
                        startTask(a.task_template_id, a.assignment_id)
                      }
                    >
                      {a.bonus_claimed ? 'Повторить задание' : 'Решить задание'}
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {workoutModalVisible &&
        displayWorkout &&
        createPortal(
          <div
            className={`asm-overlay${workoutExiting ? ' asm-overlay--exit' : ''}`}
            role="presentation"
            onMouseDown={overlayMouseDown}
          >
            <div
              className={`asm-modal${workoutExiting ? ' asm-modal--exit' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="asm-modal-title"
              onAnimationEnd={handleWorkoutExitEnd}
            >
              <div className="asm-modal__head">
                <button
                  type="button"
                  className="asm-modal__close"
                  onClick={requestCloseWorkout}
                  aria-label="Закрыть"
                >
                  ×
                </button>
                <h2 id="asm-modal-title" className="asm-modal__title">
                  {displayWorkout.blockMode
                    ? `Блок: задание ${displayWorkout.blockMode.index + 1} из ${displayWorkout.blockMode.tasks.length}`
                    : 'Задание'}
                </h2>
                {displayWorkout.notice ? (
                  <p className="asm-modal__notice">{displayWorkout.notice}</p>
                ) : null}
              </div>

              {displayWorkout.done && displayWorkout.result ? (
                <>
                  <div className="asm-modal__body">
                    <p className="asm-result-line">
                      {displayWorkout.result.correct ? (
                        <strong style={{ color: '#2e7d32' }}>Верно!</strong>
                      ) : (
                        <>
                          <strong>Пока неверно.</strong>
                          {displayWorkout.result.expected_answer != null ? (
                            <>
                              <br />
                              Ожидалось:{' '}
                              {String(displayWorkout.result.expected_answer)}
                            </>
                          ) : null}
                        </>
                      )}
                    </p>
                    {displayWorkout.result.grade_2_5 != null ? (
                      <p className="asm-result-line" style={{ marginBottom: 8 }}>
                        <strong>Оценка за задание: {displayWorkout.result.grade_2_5}</strong>
                      </p>
                    ) : null}
                    {displayWorkout.result.block_grade_2_5 != null ? (
                      <p className="asm-result-line" style={{ marginBottom: 8 }}>
                        <strong>Оценка за блок: {displayWorkout.result.block_grade_2_5}</strong>
                      </p>
                    ) : null}
                    <p className="asm-result-stats">
                      Изменение баланса: монеты {displayWorkout.result.coins_awarded ?? 0}, XP{' '}
                      {displayWorkout.result.xp_awarded ?? 0}
                    </p>
                  </div>
                  <div className="asm-modal__footer">
                    <button
                      type="button"
                      className="asm-footer-primary"
                      onClick={requestCloseWorkout}
                    >
                      Закрыть
                    </button>
                  </div>
                </>
              ) : (
                <form className="asm-modal__form" onSubmit={submitAnswer}>
                  <div className="asm-modal__body">
                    <p className="asm-modal__task">{displayWorkout.prompt}</p>
                    {workErr ? (
                      <p className="asm-modal__err">{workErr}</p>
                    ) : null}
                    {displayWorkout.ui_mode === 'terminal_io' && displayWorkout.task_payload ? (
                      <div className="asm-terminal">
                        {displayWorkout.task_payload.story ? (
                          <p className="asm-modal__task asm-terminal-story">
                            {String(displayWorkout.task_payload.story)}
                          </p>
                        ) : null}
                        {displayWorkout.task_payload.requirements ? (
                          <p className="asm-terminal-req">{String(displayWorkout.task_payload.requirements)}</p>
                        ) : null}
                        <label htmlFor="asm-terminal-code" className="asm-terminal-label">
                          Программа (Python)
                        </label>
                        <textarea
                          id="asm-terminal-code"
                          className="asm-terminal-code"
                          spellCheck={false}
                          rows={12}
                          value={terminalCode}
                          onChange={(e) => setTerminalCode(e.target.value)}
                          placeholder="# input(), print()"
                        />
                        <p className="asm-terminal-hint">
                          Проверка: {displayWorkout.task_payload.tests?.length ?? 0} тест(ов) на сервере.
                        </p>
                      </div>
                    ) : displayWorkout.ui_mode === 'dragdrop' && displayWorkout.task_payload ? (
                      <div className="asm-dragdrop">
                        <p className="asm-dragdrop-hint">
                          Перетащите карточки в области или выберите из списка под каждой областью.
                        </p>
                        <div className="asm-dragdrop-pool">
                          {(displayWorkout.task_payload.items || []).map((it) => {
                            const used = Object.values(dragPlaced).includes(it.id)
                            if (used) return null
                            return (
                              <div
                                key={it.id}
                                role="button"
                                tabIndex={0}
                                draggable
                                onDragStart={() => setDragActive(it.id)}
                                className="asm-drag-card"
                              >
                                {String(it.text ?? it.id)}
                              </div>
                            )
                          })}
                        </div>
                        <div className="asm-dragdrop-slots">
                          {(displayWorkout.task_payload.slots || []).map((slot) => (
                            <div key={slot.id} className="asm-drag-slot-wrap">
                              <div className="asm-drag-slot-label">{String(slot.label ?? slot.id)}</div>
                              <div
                                className="asm-drag-slot"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                  e.preventDefault()
                                  if (dragActive) {
                                    setDragPlaced((p) => ({ ...p, [slot.id]: dragActive }))
                                    setDragActive(null)
                                  }
                                }}
                              >
                                {dragPlaced[slot.id] ? (
                                  <span className="asm-drag-card asm-drag-card--in">
                                    {String(
                                      (displayWorkout.task_payload.items || []).find(
                                        (x) => x.id === dragPlaced[slot.id],
                                      )?.text ?? dragPlaced[slot.id],
                                    )}
                                  </span>
                                ) : (
                                  <span className="asm-drag-placeholder">Сюда</span>
                                )}
                              </div>
                              <select
                                className="asm-drag-select"
                                value={dragPlaced[slot.id] || ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setDragPlaced((p) => ({ ...p, [slot.id]: v }))
                                }}
                              >
                                <option value="">—</option>
                                {(displayWorkout.task_payload.items || []).map((it) => (
                                  <option key={it.id} value={it.id}>
                                    {String(it.text ?? it.id)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : displayWorkout.ui_mode === 'asgard_mc' &&
                      displayWorkout.choices &&
                      displayWorkout.choices.length > 0 ? (
                      <div>
                        <span className="asm-choices-label">
                          Выберите вариант
                        </span>
                        <div className="asm-choices">
                          {dedupeChoices(displayWorkout.choices).map((c, idx) => {
                            const cid = c.choice_id ?? c.choiceId
                            const idStr =
                              cid != null ? String(cid) : `idx-${idx}`
                            return (
                              <button
                                key={`ch-${idStr}`}
                                type="button"
                                className={`asm-choice${answer === idStr ? ' asm-choice--on' : ''}`}
                                onClick={() => setAnswer(idStr)}
                              >
                                {c.text != null ? String(c.text) : ''}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="asm-field">
                        <label htmlFor="asm-answer">Ответ</label>
                        <input
                          id="asm-answer"
                          className="asm-input"
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          autoComplete="off"
                          autoFocus
                          required
                        />
                      </div>
                    )}
                  </div>
                  <div className="asm-modal__footer">
                    <button
                      type="submit"
                      className="asm-footer-primary"
                      disabled={submitting}
                    >
                      {submitting ? 'Проверка…' : 'Проверить'}
                    </button>
                    <button
                      type="button"
                      className="asm-footer-secondary"
                      onClick={requestCloseWorkout}
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
