import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './LessonAsgardPage.css'

const STORAGE_KEY = 'spaceedu-asgard-complete'

function readComplete() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export default function LessonAsgardPage() {
  const navigate = useNavigate()
  const [completedView, setCompletedView] = useState(readComplete)
  const [step, setStep] = useState(0)
  const [readyChecked, setReadyChecked] = useState(false)
  const [answer, setAnswer] = useState(null)

  const backToMap = () => {
    navigate('/app', { state: { openTab: 'cs' } })
  }

  const markComplete = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setCompletedView(true)
  }

  if (completedView) {
    return (
      <div className="asg-wrap">
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
                  setStep(0)
                  setReadyChecked(false)
                  setAnswer(null)
                }}
              >
                Пройти урок снова
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="asg-wrap">
      <div className="asg-panel">
        <header className="asg-header">
          <button type="button" className="asg-back" onClick={backToMap}>
            ← К карте курса
          </button>
          <p className="asg-breadcrumb">Основы информатики · Урок 1</p>
          <h1 className="asg-title">Асгард</h1>
          <div
            className="asg-progress"
            role="group"
            aria-label="Этапы урока"
          >
            {['Введение', 'Цели', 'Задание'].map((label, i) => (
              <button
                key={label}
                type="button"
                className={`asg-step${i === step ? ' asg-step--active' : ''}${i < step ? ' asg-step--done' : ''}`}
                onClick={() => {
                  if (i < step) setStep(i)
                }}
                disabled={i > step}
                aria-current={i === step ? 'step' : undefined}
              >
                <span className="asg-step-num">{i + 1}</span>
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="asg-body">
          {step === 0 && (
            <section className="asg-block" aria-labelledby="asg-s0">
              <h2 id="asg-s0" className="asg-h2">
                Добро пожаловать
              </h2>
              <p className="asg-p">
                Асгард — первая локация курса. Здесь вы настроитесь на формат: короткие
                блоки, практика и прогресс по карте.
              </p>
              <button
                type="button"
                className="asg-btn-primary"
                onClick={() => setStep(1)}
              >
                Далее
              </button>
            </section>
          )}

          {step === 1 && (
            <section className="asg-block" aria-labelledby="asg-s1">
              <h2 id="asg-s1" className="asg-h2">
                Что сделаем в этом уроке
              </h2>
              <ul className="asg-list">
                <li>Познакомимся с интерфейсом SpacEdu</li>
                <li>Поймём, как отмечаются этапы на карте</li>
                <li>Решим мини-задание на внимательность</li>
              </ul>
              <label className="asg-check">
                <input
                  type="checkbox"
                  checked={readyChecked}
                  onChange={(e) => setReadyChecked(e.target.checked)}
                />
                <span>Я готов продолжить</span>
              </label>
              <button
                type="button"
                className="asg-btn-primary"
                disabled={!readyChecked}
                onClick={() => setStep(2)}
              >
                К заданию
              </button>
            </section>
          )}

          {step === 2 && (
            <section className="asg-block" aria-labelledby="asg-s2">
              <h2 id="asg-s2" className="asg-h2">
                Мини-задание
              </h2>
              <p className="asg-p">
                Что из перечисленного чаще всего относят к «информации» в информатике?
              </p>
              <div className="asg-quiz" role="group" aria-label="Варианты ответа">
                {[
                  {
                    id: 'a',
                    text: 'Текст, числа, изображения — данные, которые передают и хранят',
                    correct: true,
                  },
                  { id: 'b', text: 'Только бумажные учебники', correct: false },
                  { id: 'c', text: 'Только электричество в компьютере', correct: false },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`asg-option${answer === opt.id ? ' asg-option--picked' : ''}${answer && opt.correct ? ' asg-option--correct' : ''}${answer && !opt.correct && answer === opt.id ? ' asg-option--wrong' : ''}`}
                    onClick={() => setAnswer(opt.id)}
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="asg-btn-primary"
                disabled={answer !== 'a'}
                onClick={markComplete}
              >
                Завершить урок
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
