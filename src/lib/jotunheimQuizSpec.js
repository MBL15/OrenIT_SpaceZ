/**
 * Три задания в духе №2 ОГЭ: в пропуск между частями выражения перетаскивается ∧, ∨ или →.
 * correctOpId: and | or | imp
 */

export const JOTUN_OPS = [
  { id: 'and', symbol: '∧', subtitle: 'И' },
  { id: 'or', symbol: '∨', subtitle: 'ИЛИ' },
  { id: 'imp', symbol: '→', subtitle: 'если… то…' },
]

/** @typedef {{ id: number, prompt: string, exprBefore: string, exprAfter: string, correctOpId: 'and'|'or'|'imp' }} JotunheimTask */

export const JOTUNHEIM_QUIZ_SPEC = [
  {
    id: 1,
    prompt:
      'Известны значения: A = 1, B = 0. Перетащите нужный знак в выражение так, чтобы A ? B было истинным.',
    exprBefore: 'A ',
    exprAfter: ' B',
    correctOpId: 'or',
  },
  {
    id: 2,
    prompt:
      'Известны значения: A = 0, B = 0. Подставьте операцию в пропуск, чтобы A ? B было истинным.',
    exprBefore: 'A ',
    exprAfter: ' B',
    correctOpId: 'imp',
  },
  {
    id: 3,
    prompt:
      'Даны A = 0, B = 1. Подставьте знак в пропуск так, чтобы высказывание (A ? B) ∧ B было ложным.',
    exprBefore: '(A ',
    exprAfter: ' B) ∧ B',
    correctOpId: 'and',
  },
]
