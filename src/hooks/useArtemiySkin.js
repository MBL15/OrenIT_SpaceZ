import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { ARTEMIY_DEFAULT_SRC, resolveArtemiySkin } from '../lib/mascotSkins.js'

async function fetchArtemiySkinState(userRole) {
  await Promise.resolve()
  if (userRole !== 'child') {
    return { shopItems: [], skinItemId: null, ready: true }
  }
  const [itemsRes, mascotRes] = await Promise.all([
    apiFetch('/shop/items'),
    apiFetch('/me/mascot'),
  ])
  let items = []
  if (itemsRes.ok) {
    items = await itemsRes.json().catch(() => [])
  }
  let skinId = null
  if (mascotRes.ok) {
    const m = await mascotRes.json().catch(() => null)
    skinId = m?.skin_item_id ?? null
  }
  return {
    shopItems: Array.isArray(items) ? items : [],
    skinItemId: skinId,
    ready: true,
  }
}

export function useArtemiySkin() {
  const { user } = useAuth()
  const [{ shopItems, skinItemId, ready }, setSkinBundle] = useState({
    shopItems: [],
    skinItemId: null,
    ready: false,
  })

  const refresh = useCallback(async () => {
    const next = await fetchArtemiySkinState(user?.role)
    setSkinBundle({
      shopItems: next.shopItems,
      skinItemId: next.skinItemId,
      ready: next.ready,
    })
  }, [user?.role])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next = await fetchArtemiySkinState(user?.role)
      if (cancelled) return
      setSkinBundle({
        shopItems: next.shopItems,
        skinItemId: next.skinItemId,
        ready: next.ready,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [user?.role, user?.id])

  const { src, className } = useMemo(
    () =>
      user?.role === 'child'
        ? resolveArtemiySkin(skinItemId, shopItems)
        : { src: ARTEMIY_DEFAULT_SRC, className: '' },
    [user?.role, skinItemId, shopItems],
  )

  return { src, className, shopItems, skinItemId, refresh, ready }
}
