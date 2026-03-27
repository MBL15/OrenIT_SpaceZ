/**
 * Спецификация теста урока «Асгард»: загрузка/сохранение (localStorage) и приведение к формату shuffle.
 */

export const ASGARD_QUIZ_STORAGE_KEY = 'spaceedu-asgard-quiz-spec-v1'

export const DEFAULT_ASGARD_QUIZ_SPEC = [
  {
    id: 1,
    prompt:
      'Дано выражение ¬A ∧ B ∨ C, где A=1, B=0, C=1. Каково значение выражения с приоритетом (¬, затем ∧, затем ∨)?',
    options: [
      { choiceId: 'asg1-true', text: 'Истина (1)', correct: true },
      { choiceId: 'asg1-false', text: 'Ложь (0)', correct: false },
      {
        choiceId: 'asg1-order',
        text: 'Зависит от порядка вычислений',
        correct: false,
      },
    ],
  },
  {
    id: 2,
    prompt:
      'Известны законы де Моргана: ¬(A ∧ B) = ¬A ∨ ¬B и ¬(A ∨ B) = ¬A ∧ ¬B. Выберите выражение, которое логически эквивалентно выражению ¬(¬X ∨ Y).',
    options: [
      { choiceId: 'asg2-equiv', text: 'X ∧ ¬Y', correct: true },
      { choiceId: 'asg2-wrong1', text: '¬X ∨ ¬Y', correct: false },
      { choiceId: 'asg2-wrong2', text: 'X ∨ ¬Y', correct: false },
    ],
  },
  {
    id: 3,
    prompt:
      'В школе разбили окно. Анна сказала: «Это сделал Борис». Борис сказал: «Это сделала Галина». Виктор сказал: «Я этого не делал». Галина сказала: «Борис лжёт, когда говорит, что это сделала я». Известно, что правду сказал ровно один ученик. Кто разбил окно?',
    options: [
      { choiceId: 'asg3-anna', text: 'Анна', correct: false },
      { choiceId: 'asg3-boris', text: 'Борис', correct: false },
      { choiceId: 'asg3-victor', text: 'Виктор', correct: true },
      { choiceId: 'asg3-galina', text: 'Галина', correct: false },
    ],
  },
]

function randomSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeAsgardQuizSpec(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out = []
  for (let qi = 0; qi < raw.length; qi++) {
    const q = raw[qi]
    const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : ''
    const optsIn = Array.isArray(q.options) ? q.options : []
    const options = []
    for (let oi = 0; oi < optsIn.length; oi++) {
      const o = optsIn[oi]
      const text = typeof o.text === 'string' ? o.text.trim() : ''
      if (!text) continue
      options.push({
        choiceId:
          typeof o.choiceId === 'string' && o.choiceId.trim()
            ? o.choiceId.trim()
            : `asg-q${qi + 1}-${randomSuffix()}`,
        text,
        correct: Boolean(o.correct),
      })
    }
    if (options.length < 2) continue
    if (!options.some((o) => o.correct)) continue
    out.push({
      id: typeof q.id === 'number' ? q.id : qi + 1,
      prompt: prompt || `Вопрос ${qi + 1}`,
      options,
    })
  }
  return out.length ? out : null
}

export function loadAsgardQuizSpec() {
  try {
    const raw = localStorage.getItem(ASGARD_QUIZ_STORAGE_KEY)
    if (!raw) return DEFAULT_ASGARD_QUIZ_SPEC
    const parsed = JSON.parse(raw)
    const norm = normalizeAsgardQuizSpec(parsed)
    return norm ?? DEFAULT_ASGARD_QUIZ_SPEC
  } catch {
    return DEFAULT_ASGARD_QUIZ_SPEC
  }
}

export function saveAsgardQuizSpec(spec) {
  try {
    localStorage.setItem(ASGARD_QUIZ_STORAGE_KEY, JSON.stringify(spec))
  } catch {
    /* ignore */
  }
}

export function clearAsgardQuizSpecStorage() {
  try {
    localStorage.removeItem(ASGARD_QUIZ_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** @param {typeof DEFAULT_ASGARD_QUIZ_SPEC} spec */
export function specToQuizSteps(spec) {
  const out = {}
  for (let i = 0; i < spec.length; i++) {
    out[i + 1] = spec[i].options.map((o) => ({
      choiceId: o.choiceId,
      text: o.text,
      correct: o.correct,
    }))
  }
  return out
}
