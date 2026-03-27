/**
 * Перемешивание вариантов ответов в тестах (уроки, задания с выбором).
 *
 * Паттерн для новых заданий:
 * 1. Задайте варианты как `{ choiceId, text, correct }` — `text` без префикса «А)».
 * 2. При каждом старте попытки вызывайте `shuffleQuestionOptions([...])` и рендерьте результат.
 * 3. В состоянии ответа храните `choiceId`, а не индекс кнопки.
 */

const CYRILLIC_MARKS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К']

/** Fisher–Yates, возвращает новый массив */
export function shuffleArray(items) {
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * @template {{ choiceId: string, text: string, correct: boolean }} T
 * @param {T[]} options
 * @returns {(T & { displayText: string })[]}
 */
export function shuffleQuestionOptions(options) {
  if (options.length > CYRILLIC_MARKS.length) {
    throw new Error('shuffleQuestionOptions: слишком много вариантов для меток А–К')
  }
  const shuffled = shuffleArray(options)
  return shuffled.map((opt, i) => ({
    ...opt,
    displayText: `${CYRILLIC_MARKS[i]}) ${opt.text}`,
  }))
}

/**
 * Удобно для урока с несколькими шагами: одна новая перестановка на всю попытку.
 * @param {Record<number, { choiceId: string, text: string, correct: boolean }[]>} steps
 */
export function shuffleAllQuizSteps(steps) {
  /** @type {Record<number, ReturnType<typeof shuffleQuestionOptions>>} */
  const out = {}
  for (const key of Object.keys(steps)) {
    const n = Number(key)
    out[n] = shuffleQuestionOptions(steps[n])
  }
  return out
}
