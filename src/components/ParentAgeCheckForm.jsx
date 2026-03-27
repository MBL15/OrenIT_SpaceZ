import { useCallback, useEffect, useState } from 'react'
import { apiFetch, parseErrorDetail } from '../api.js'
import { persistParentUnlock } from '../lib/parentUnlock.js'
import '../pages/ParentsPage.css'

/**
 * Проверка для взрослого (parent_mode). Без оболочки страницы/модалки.
 */
export default function ParentAgeCheckForm({
  onSuccess,
  submitLabel = 'Далее',
  secondaryLabel = 'Задание',
  cardClassName = 'pp-gate-card pp-gate-card--minimal ms-parents-gate-form',
}) {
  const [question, setQuestion] = useState('')
  const [challengeToken, setChallengeToken] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(false)

  const loadChallenge = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await apiFetch('/parent_mode/challenge', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setQuestion('')
        setChallengeToken('')
        setErr(parseErrorDetail(data))
        return
      }
      setQuestion(data.question || '')
      setChallengeToken(data.challenge_token || '')
      setAnswer('')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadChallenge()
  }, [loadChallenge])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!challengeToken) {
      setErr('Нет задания. Обновите страницу.')
      return
    }
    setPending(true)
    try {
      const res = await apiFetch('/parent_mode/verify', {
        method: 'POST',
        body: JSON.stringify({
          challenge_token: challengeToken,
          answer: answer.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(parseErrorDetail(data))
        await loadChallenge()
        return
      }
      persistParentUnlock(data.mode_token ?? '')
      onSuccess()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={cardClassName}>
      {loading ? (
        <p className="pp-gate-loading">…</p>
      ) : (
        <form className="pp-gate-form" onSubmit={handleSubmit}>
          <p className="pp-gate-question">{question || '—'}</p>
          <input
            className="pp-gate-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Ответ, целое число"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Ответ"
            disabled={pending || !challengeToken}
          />
          {err ? <p className="pp-gate-err">{err}</p> : null}
          <div className="pp-gate-actions">
            <button
              type="submit"
              className="pp-gate-submit"
              disabled={pending || loading || !challengeToken}
            >
              {pending ? '…' : submitLabel}
            </button>
            <button
              type="button"
              className="pp-gate-secondary"
              disabled={loading || pending}
              onClick={() => loadChallenge()}
            >
              {secondaryLabel}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
