import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { apiFetch, parseErrorDetail } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import {
  formatCoinsDelta,
  formatXpDelta,
  practiceRewardRulesHint,
} from '../lib/practiceRewards.js'
import '../components/MainSite.css'
import './ClassPage.css'
import './LessonAsgardPage.css'
import './AssignmentsPage.css'

export default function AssignmentsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loadErr, setLoadErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [workout, setWorkout] = useState(null)
  const [answer, setAnswer] = useState('')
  const [workErr, setWorkErr] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  if (user?.role !== 'child') {
    return <Navigate to="/app" replace />
  }

  const startTask = async (taskTemplateId, assignmentId) => {
    setWorkErr('')
    setAnswer('')
    const meta =
      assignmentId != null
        ? rows.find((r) => r.assignment_id === assignmentId)
        : null
    const q =
      assignmentId != null
        ? `?assignment_id=${encodeURIComponent(String(assignmentId))}`
        : ''
    const res = await apiFetch(`/practice/start/${taskTemplateId}${q}`, {
      method: 'POST',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setWorkErr(parseErrorDetail(data))
      return
    }
    const choicesRaw = Array.isArray(data.choices) ? data.choices : null
    const choices = choicesRaw
      ? choicesRaw.map((c) => ({
          choiceId: c.choice_id ?? c.choiceId,
          text: c.text ?? '',
        }))
      : null
    setWorkout({
      templateId: taskTemplateId,
      assignmentId: assignmentId ?? null,
      instanceId: data.instance_id,
      prompt: data.prompt || '',
      startNotice: data.notice || null,
      repeatWithoutRewards: Boolean(data.repeat_without_rewards),
      uiMode: data.ui_mode || null,
      choices,
      phase: 'active',
      wrongPick: null,
      maxRewardCoins: meta ? Number(meta.reward_coins) || 0 : 0,
      maxRewardXp: meta ? Number(meta.reward_xp) || 0 : 0,
    })
  }

  const submitAnswer = async (e) => {
    e.preventDefault()
    if (!workout) return
    setWorkErr('')
    setSubmitting(true)
    try {
      const res = await apiFetch(`/practice/submit/${workout.instanceId}`, {
        method: 'POST',
        body: JSON.stringify({ answer: answer.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setWorkErr(parseErrorDetail(data))
        return
      }
      if (data.correct) {
        setWorkout((w) => (w ? { ...w, result: data, done: true, phase: 'done' } : w))
      }
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  const submitChoice = async (choiceId) => {
    if (!workout || workout.phase === 'wrong') return
    setWorkErr('')
    setSubmitting(true)
    try {
      const res = await apiFetch(`/practice/submit/${workout.instanceId}`, {
        method: 'POST',
        body: JSON.stringify({ answer: choiceId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setWorkErr(parseErrorDetail(data))
        return
      }
      if (data.correct) {
        setWorkout((w) => (w ? { ...w, result: data, done: true, phase: 'done' } : w))
      } else {
        setWorkout((w) =>
          w
            ? {
                ...w,
                phase: 'wrong',
                wrongPick: choiceId,
                wrongPenalty: {
                  coins: data.coins_awarded ?? data.currency_awarded,
                  xp: data.xp_awarded ?? data.score_awarded,
                },
              }
            : w,
        )
      }
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  const closeWorkout = () => {
    setWorkout(null)
    setAnswer('')
    setWorkErr('')
  }

  const isAsgardMc = workout?.uiMode === 'asgard_mc' && workout?.choices?.length

  return (
    <div className="cp-wrap assign-work-page">
      <div className="cp-panel">
        <header className="cp-top">
          <div>
            <Link className="cp-back" to="/app">
              ← К разделам
            </Link>
            <h1 className="cp-title">Задания от учителя</h1>
            <p className="cp-sub">
              Задания по классам, в которые вы вступили по коду приглашения
            </p>
          </div>
        </header>

        <div style={{ padding: '20px 24px 32px' }}>
          {loading ? (
            <p className="cp-sub">Загрузка…</p>
          ) : loadErr ? (
            <p className="space-form-error">{loadErr}</p>
          ) : rows.length === 0 ? (
            <p className="cp-teacher-muted">
              Пока нет назначенных заданий. Вступите в класс по коду на странице
              «Мой класс».
            </p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {rows.map((a) => (
                <li
                  key={a.assignment_id}
                  className="cp-section"
                  style={{ overflow: 'hidden' }}
                >
                  <div className="cp-section-head">
                    <h2 className="cp-section-title">{a.lesson_title}</h2>
                    <p className="cp-section-hint">
                      Класс: {a.class_name}
                      {a.task_title ? ` · ${a.task_title}` : ''}
                    </p>
                  </div>
                  <div style={{ padding: '14px 18px' }}>
                    {a.note ? (
                      <p className="cp-teacher-muted" style={{ marginTop: 0 }}>
                        {a.note}
                      </p>
                    ) : null}
                    {a.bonus_claimed ? (
                      <p className="cp-teacher-muted" style={{ marginTop: 8 }} role="status">
                        Вы уже получали награду за это назначение. Если учитель удалит задание и
                        назначит снова — это будет новое назначение, награда снова возможна.
                      </p>
                    ) : null}
                    {(Number(a.reward_coins) > 0 || Number(a.reward_xp) > 0) && (
                      <p className="cp-teacher-muted" style={{ marginTop: 8 }}>
                        Награда за первое верное решение по этому назначению: +
                        {Number(a.reward_coins) || 0} мон., +{Number(a.reward_xp) || 0} XP. При
                        неверном ответе с урока списывается до стольких же монет и XP (с баланса и
                        опыта, без связи с практикой урока на карте).
                      </p>
                    )}
                    <button
                      type="button"
                      className="space-btn space-btn--primary"
                      onClick={() => startTask(a.task_template_id, a.assignment_id)}
                    >
                      Решить задание
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {workout && (
        <div
          className="ms-product-drawer-backdrop ms-product-drawer-backdrop--center assign-work-backdrop"
          role="presentation"
          onClick={workout.done ? closeWorkout : undefined}
        >
          <aside
            className="ms-product-drawer ms-product-drawer--center assign-work-drawer assign-work-drawer--dark"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-work-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="ms-modal-close"
              onClick={closeWorkout}
              aria-label="Закрыть"
            >
              ×
            </button>
            <h2 id="assign-work-title" className="ms-product-drawer-title">
              Задание
            </h2>
            {!workout.done && workout.startNotice ? (
              <p
                className="ms-product-drawer-text"
                role="status"
                style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  marginTop: 0,
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'rgba(76, 175, 80, 0.12)',
                  border: '1px solid rgba(76, 175, 80, 0.35)',
                }}
              >
                {workout.startNotice}
              </p>
            ) : null}
            {!workout.done && workout.assignmentId == null ? (
              <details
                className="ms-product-drawer-text"
                style={{ fontSize: 13, opacity: 0.9, marginTop: 0 }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  Как начисляются монеты и опыт
                </summary>
                <p style={{ margin: '8px 0 0', lineHeight: 1.45 }}>
                  {practiceRewardRulesHint()}
                </p>
              </details>
            ) : null}
            {workErr ? <p className="space-form-error">{workErr}</p> : null}
            {workout.done && workout.result ? (
              <div>
                {workout.result.notice ? (
                  <p className="ms-product-drawer-text" role="status" style={{ marginBottom: 12 }}>
                    {workout.result.notice}
                  </p>
                ) : null}
                <p className="ms-product-drawer-text">
                  {workout.result.correct ? (
                    <strong style={{ color: '#2e7d32' }}>Верно!</strong>
                  ) : (
                    <>
                      <strong>Пока неверно.</strong>
                      {workout.result.expected_answer != null ? (
                        <>
                          <br />
                          Ожидалось: {String(workout.result.expected_answer)}
                        </>
                      ) : null}
                    </>
                  )}
                </p>
                <p className="ms-product-drawer-text" style={{ fontSize: 14 }}>
                  Коины (изменение баланса):{' '}
                  <strong>
                    {formatCoinsDelta(
                      workout.result.coins_awarded ?? workout.result.currency_awarded,
                    )}
                  </strong>
                  {', '}
                  опыт (XP, с учётом урока):{' '}
                  <strong>
                    {formatXpDelta(
                      workout.result.xp_awarded ?? workout.result.score_awarded,
                    )}
                  </strong>
                </p>
                <button type="button" className="ms-modal-cta" onClick={closeWorkout}>
                  Закрыть
                </button>
              </div>
            ) : isAsgardMc ? (
              <div className="asg-side assign-work-asg">
                <p className="asg-p assign-work-asg-prompt">{workout.prompt}</p>
                {workout.phase === 'wrong' ? (
                  <div className="assign-work-wrong-block">
                    <p className="assign-work-wrong-title" role="status">
                      Ответ неверный.
                    </p>
                    <div className="assign-work-penalty" role="status">
                      <p className="assign-work-penalty-label">Штраф (изменение баланса и опыта)</p>
                      <p className="assign-work-penalty-values">
                        <span className="assign-work-penalty-coins">
                          {formatCoinsDelta(workout.wrongPenalty?.coins)}
                        </span>
                        <span className="assign-work-penalty-sep"> мон.</span>
                        {', '}
                        <span className="assign-work-penalty-xp">
                          {formatXpDelta(workout.wrongPenalty?.xp)} XP
                        </span>
                      </p>
                      {(Number(workout.wrongPenalty?.coins) === 0 &&
                        Number(workout.wrongPenalty?.xp) === 0 &&
                        (workout.maxRewardCoins > 0 || workout.maxRewardXp > 0)) ? (
                        <p className="assign-work-penalty-note">
                          По правилам назначения могло списаться до {workout.maxRewardCoins} мон. и{' '}
                          {workout.maxRewardXp} XP; сейчас списание не выполнено (например, нулевой
                          баланс или опыт).
                        </p>
                      ) : null}
                    </div>
                    <p className="assign-work-wrong-hint">
                      Закройте окно и снова нажмите «Решить задание», чтобы получить новую попытку.
                    </p>
                  </div>
                ) : null}
                <div className="asg-quiz" role="group" aria-label="Варианты ответа">
                  {workout.choices.map((c) => {
                    const wrong =
                      workout.phase === 'wrong' && workout.wrongPick === c.choiceId
                    return (
                      <button
                        key={c.choiceId}
                        type="button"
                        className={`asg-option${wrong ? ' asg-option--wrong' : ''}`}
                        disabled={submitting || workout.phase === 'wrong'}
                        onClick={() => submitChoice(c.choiceId)}
                      >
                        {c.text}
                      </button>
                    )
                  })}
                </div>
                <div className="ms-product-drawer-actions assign-work-drawer-actions">
                  <button type="button" className="ms-modal-secondary" onClick={closeWorkout}>
                    {workout.phase === 'wrong' ? 'Закрыть' : 'Отмена'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="ms-product-drawer-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {workout.prompt}
                </p>
                <form onSubmit={submitAnswer}>
                  <label className="cp-teacher-label" style={{ marginBottom: 12 }}>
                    Ответ
                    <input
                      className="space-input"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      autoFocus
                      required
                    />
                  </label>
                  <div className="ms-product-drawer-actions">
                    <button type="submit" className="ms-modal-cta" disabled={submitting}>
                      {submitting ? 'Проверка…' : 'Проверить'}
                    </button>
                    <button type="button" className="ms-modal-secondary" onClick={closeWorkout}>
                      Отмена
                    </button>
                  </div>
                </form>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
