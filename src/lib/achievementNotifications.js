/** localStorage: уже «анонсированные» открытые ачивки (по пользователю). */
export function achievementsAnnouncedStorageKey(userId) {
  return `orenit_achievements_announced_ids_${userId}`
}

function readAnnouncedSet(userId) {
  try {
    const raw = localStorage.getItem(achievementsAnnouncedStorageKey(userId))
    if (raw == null) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return new Set(parsed.map(String))
  } catch {
    return null
  }
}

function writeAnnouncedIds(userId, ids) {
  try {
    localStorage.setItem(
      achievementsAnnouncedStorageKey(userId),
      JSON.stringify([...new Set(ids.map(String))]),
    )
  } catch {
    /* private mode / quota */
  }
}

/**
 * После загрузки списка ачивок: первая синхронизация сохраняет текущие открытые без уведомлений;
 * далее возвращает только вновь открытые записи и дописывает их в storage.
 * @param {Array<{ id: string, unlocked: boolean }>} achievements
 * @param {number} userId
 */
export function consumeNewAchievementNotifications(achievements, userId) {
  if (userId == null || !Number.isFinite(userId)) return []
  const unlocked = achievements.filter((a) => a.unlocked).map((a) => a.id)
  const announced = readAnnouncedSet(userId)
  if (announced === null) {
    writeAnnouncedIds(userId, unlocked)
    return []
  }
  const newIds = unlocked.filter((id) => !announced.has(String(id)))
  if (newIds.length === 0) return []
  writeAnnouncedIds(userId, [...announced, ...unlocked])
  const want = new Set(newIds.map(String))
  return achievements.filter((a) => a.unlocked && want.has(String(a.id)))
}
