import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { apiFetch, parseErrorDetail } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import '../components/MainSite.css'
import './ClassPage.css'

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

  const startTask = async (taskTemplateId) => {
    setWorkErr('')
    setAnswer('')
    const res = await apiFetch(`/practice/start/${taskTemplateId}`, {
      method: 'POST',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setWorkErr(parseErrorDetail(data))
      return
    }
    setWorkout({
      templateId: taskTemplateId,
      instanceId: data.instance_id,
      prompt: data.prompt || '',
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
      setWorkout((w) =>
        w ? { ...w, result: data, done: true } : w,
      )
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

  return (
    <div className="cp-wrap">
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
                    <button
                      type="button"
                      className="space-btn space-btn--primary"
                      onClick={() => startTask(a.task_template_id)}
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
          className="ms-product-drawer-backdrop"
          role="presentation"
          style={{ zIndex: 50 }}
          onClick={workout.done ? closeWorkout : undefined}
        >
          <aside
            className="ms-product-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-work-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480 }}
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
            {workout.done && workout.result ? (
              <div>
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
                  Начислено монет: {workout.result.currency_awarded ?? 0}, баллов:{' '}
                  {workout.result.score_awarded ?? 0}
                </p>
                <button
                  type="button"
                  className="ms-modal-cta"
                  onClick={closeWorkout}
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <>
                <p className="ms-product-drawer-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {workout.prompt}
                </p>
                <form onSubmit={submitAnswer}>
                  {workErr ? (
                    <p className="space-form-error">{workErr}</p>
                  ) : null}
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
                    <button
                      type="submit"
                      className="ms-modal-cta"
                      disabled={submitting}
                    >
                      {submitting ? 'Проверка…' : 'Проверить'}
                    </button>
                    <button
                      type="button"
                      className="ms-modal-secondary"
                      onClick={closeWorkout}
                    >
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
