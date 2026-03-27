/**
 * Дефолты совпадают с app/core.py (переменные DAILY_* , PRACTICE_* , SPEED_*).
 * При смене на бэкенде обновите и здесь подсказки для ученика.
 */
export const PRACTICE_REWARD_DEFAULTS = {
  dailyFirstCorrectCoins: 50,
  dailyEachNextExtraCoins: 10,
  practiceWrongCoinPenalty: 5,
  practiceWrongXpPenalty: 10,
  speedBonusMs: 30_000,
  speedBonusAmount: 5,
  practiceMaxWrongPerLesson: 2,
}

export function formatCoinsDelta(delta) {
  const n = Number(delta)
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n > 0) return `+${n}`
  return String(n)
}

export function formatXpDelta(delta) {
  const n = Number(delta)
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n > 0) return `+${n}`
  return String(n)
}

export function practiceRewardRulesHint() {
  const d = PRACTICE_REWARD_DEFAULTS
  return (
    `За верные ответы в практике: первая верная задача за календарный день (UTC) — ${d.dailyFirstCorrectCoins} монет, ` +
    `каждая следующая верная сегодня +${d.dailyEachNextExtraCoins}. ` +
    `Если ответили быстро (до ~${Math.round(d.speedBonusMs / 1000)} с с момента выдачи задачи), бонус +${d.speedBonusAmount} монет и немного XP. ` +
    `За ошибку может списаться до ${d.practiceWrongCoinPenalty} монет из накопленного по этому уроку и до ${d.practiceWrongXpPenalty} XP из накопленного по уроку. ` +
    `После ${d.practiceMaxWrongPerLesson} неверных ответов по уроку новые ответы не принимаются.`
  )
}
