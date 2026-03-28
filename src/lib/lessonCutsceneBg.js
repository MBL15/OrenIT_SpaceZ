import asgardKnight from '../assets/asgard-cutscene-bg.png'
import asgardMascot from '../assets/asgard-cutscene-mascot.png'
import asgardAcademy from '../assets/asgard-cutscene-academy.png'
import jotunKnight from '../assets/jotunheim-alice-cutscene.png'
import jotunMascot from '../assets/jotunheim-cutscene-mascot.png'
import jotunAcademy from '../assets/jotunheim-cutscene-academy.png'
import vanaKnight from '../assets/vanaheim-njord-cutscene.png'
import vanaMascot from '../assets/vanaheim-cutscene-mascot.png'
import vanaAcademy from '../assets/vanaheim-cutscene-academy.png'

/**
 * @param {number | null | undefined} skinItemId
 * @param {{ id: number, slug: string }[]} shopItems
 */
function skinSlug(skinItemId, shopItems) {
  if (skinItemId == null) return null
  const item = shopItems.find((x) => x.id === skinItemId)
  return item?.slug ?? null
}

/**
 * Фон катсцены урока в зависимости от экипировки ученика.
 * Без скина / базовый маскот → *-cutscene-mascot.png (Артемий в худи).
 * `skin-academy` (космический) → *-cutscene-academy.png.
 * `skin-knight` → основной «рыцарский» арт уровня (*-bg / alice / njord).
 *
 * @param {'asgard' | 'jotunheim' | 'vanaheim'} lesson
 * @param {string | undefined} userRole
 * @param {number | null | undefined} skinItemId
 * @param {{ id: number, slug: string }[]} shopItems
 */
export function lessonCutsceneBgUrl(lesson, userRole, skinItemId, shopItems) {
  const slug = userRole === 'child' ? skinSlug(skinItemId, shopItems) : null
  if (lesson === 'asgard') {
    if (slug === 'skin-academy') return asgardAcademy
    if (slug === 'skin-knight') return asgardKnight
    return asgardMascot
  }
  if (lesson === 'jotunheim') {
    if (slug === 'skin-academy') return jotunAcademy
    if (slug === 'skin-knight') return jotunKnight
    return jotunMascot
  }
  if (lesson === 'vanaheim') {
    if (slug === 'skin-academy') return vanaAcademy
    if (slug === 'skin-knight') return vanaKnight
    return vanaMascot
  }
  return asgardKnight
}
