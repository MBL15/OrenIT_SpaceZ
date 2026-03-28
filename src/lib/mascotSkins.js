import mascotBase from '../assets/mascot.png'
import artemiyAstronaut from '../assets/artemiy.png'
import artemiyKnight from '../assets/artemiy-knight.png'

/** Без выбранного скина и для ролей не-ученик: базовый маскот. */
export const ARTEMIY_DEFAULT_SRC = mascotBase

const SLUG_CUSTOM_IMG = {
  'skin-academy': artemiyAstronaut,
  'skin-knight': artemiyKnight,
}

/**
 * @param {number | null | undefined} skinItemId
 * @param {{ id: number, slug: string }[]} shopItems
 */
export function resolveArtemiySkin(skinItemId, shopItems) {
  if (skinItemId == null) {
    return { src: mascotBase, className: '' }
  }
  const item = shopItems.find((x) => x.id === skinItemId)
  if (!item) {
    return { src: mascotBase, className: '' }
  }
  const { slug } = item
  if (SLUG_CUSTOM_IMG[slug]) {
    return { src: SLUG_CUSTOM_IMG[slug], className: '' }
  }
  return { src: mascotBase, className: '' }
}
