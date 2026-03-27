import { useState } from 'react'
import {
  clearAsgardQuizSpecStorage,
  DEFAULT_ASGARD_QUIZ_SPEC,
  normalizeAsgardQuizSpec,
  saveAsgardQuizSpec,
} from '../lib/asgardQuizSpec.js'
import './AsgardQuizEditorModal.css'

function IconPencil() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  )
}

function cloneSpec(spec) {
  return JSON.parse(JSON.stringify(spec))
}

function newEmptyOption(correct = false) {
  return {
    choiceId: `asg-new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: '',
    correct,
  }
}

function newEmptyQuestion() {
  return {
    id: Date.now(),
    prompt: '',
    options: [newEmptyOption(true), newEmptyOption(false)],
  }
}

export function AsgardAdminPencilButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      className="asg-admin-pencil"
      onClick={onClick}
      disabled={disabled}
      aria-label="Редактировать тест и варианты ответов"
      title="Редактировать задания"
    >
      <IconPencil />
    </button>
  )
}

export default function AsgardQuizEditorModal({ open, spec, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => cloneSpec(spec))
  const [saveErr, setSaveErr] = useState('')

  if (!open) return null

  const updateQuestion = (qi, patch) => {
    setDraft((prev) => {
      const next = cloneSpec(prev)
      next[qi] = { ...next[qi], ...patch }
      return next
    })
  }

  const updateOption = (qi, oi, patch) => {
    setDraft((prev) => {
      const next = cloneSpec(prev)
      next[qi].options[oi] = { ...next[qi].options[oi], ...patch }
      return next
    })
  }

  const addOption = (qi) => {
    setDraft((prev) => {
      const next = cloneSpec(prev)
      next[qi].options.push(newEmptyOption(false))
      return next
    })
  }

  const removeOption = (qi, oi) => {
    setDraft((prev) => {
      const next = cloneSpec(prev)
      if (next[qi].options.length <= 2) return prev
      next[qi].options.splice(oi, 1)
      return next
    })
  }

  const addQuestion = () => {
    setDraft((prev) => [...cloneSpec(prev), newEmptyQuestion()])
  }

  const removeQuestion = (qi) => {
    setDraft((prev) => {
      if (prev.length <= 1) return prev
      const next = cloneSpec(prev)
      next.splice(qi, 1)
      return next
    })
  }

  const handleSave = () => {
    setSaveErr('')
    const norm = normalizeAsgardQuizSpec(draft)
    if (!norm) {
      setSaveErr(
        'Проверьте вопросы: нужен непустой текст, минимум два варианта ответа и хотя бы один верный.',
      )
      return
    }
    saveAsgardQuizSpec(norm)
    onSaved(norm)
    onClose()
  }

  const handleResetDefaults = () => {
    clearAsgardQuizSpecStorage()
    onSaved(cloneSpec(DEFAULT_ASGARD_QUIZ_SPEC))
    onClose()
  }

  return (
    <div className="asg-edit-backdrop" role="presentation" onClick={onClose}>
      <div
        className="asg-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asg-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="asg-edit-head">
          <h2 id="asg-edit-title" className="asg-edit-title">
            Редактирование теста «Асгард»
          </h2>
          <button type="button" className="asg-edit-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="asg-edit-lead">
          Изменения сохраняются в браузере (localStorage) и видны всем, кто открывает урок на этом
          устройстве. Нужны минимум два варианта ответа и хотя бы один верный.
        </p>
        {saveErr ? (
          <p className="asg-edit-save-err" role="alert">
            {saveErr}
          </p>
        ) : null}

        <div className="asg-edit-scroll">
          {draft.map((q, qi) => (
            <fieldset key={q.id ?? qi} className="asg-edit-q">
              <legend className="asg-edit-legend">Вопрос {qi + 1}</legend>
              <button
                type="button"
                className="asg-edit-remove-q"
                onClick={() => removeQuestion(qi)}
                disabled={draft.length <= 1}
              >
                Удалить вопрос
              </button>
              <label className="asg-edit-label">
                Текст вопроса
                <textarea
                  className="asg-edit-textarea"
                  rows={4}
                  value={q.prompt}
                  onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
                />
              </label>
              <p className="asg-edit-hint">Варианты ответа</p>
              <ul className="asg-edit-opts">
                {q.options.map((o, oi) => (
                  <li key={o.choiceId} className="asg-edit-opt">
                    <input
                      type="text"
                      className="asg-edit-input"
                      value={o.text}
                      onChange={(e) => updateOption(qi, oi, { text: e.target.value })}
                      placeholder="Текст варианта"
                    />
                    <label className="asg-edit-correct">
                      <input
                        type="checkbox"
                        checked={o.correct}
                        onChange={(e) => updateOption(qi, oi, { correct: e.target.checked })}
                      />
                      верный
                    </label>
                    <button
                      type="button"
                      className="asg-edit-remove-o"
                      onClick={() => removeOption(qi, oi)}
                      disabled={q.options.length <= 2}
                    >
                      Удалить
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="asg-edit-add-o" onClick={() => addOption(qi)}>
                + Вариант ответа
              </button>
            </fieldset>
          ))}
          <button type="button" className="asg-edit-add-q" onClick={addQuestion}>
            + Новый вопрос
          </button>
        </div>

        <div className="asg-edit-footer">
          <button type="button" className="asg-edit-btn asg-edit-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="asg-edit-btn asg-edit-btn--outline"
            onClick={handleResetDefaults}
          >
            Сбросить к умолчанию
          </button>
          <button type="button" className="asg-edit-btn asg-edit-btn--primary" onClick={handleSave}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}
