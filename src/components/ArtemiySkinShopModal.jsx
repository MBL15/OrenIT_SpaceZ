import { useCallback, useEffect, useState } from 'react'
import { apiFetch, parseErrorDetail } from '../api.js'
import { resolveArtemiySkin } from '../lib/mascotSkins.js'
import './ArtemiySkinShopModal.css'

const SLOT_LABEL = {
  skin: 'Скины',
  hat: 'Головной убор',
  accessory: 'Аксессуар',
}

const SLOT_ORDER = ['skin', 'hat', 'accessory']

export default function ArtemiySkinShopModal({
  open,
  onClose,
  userRole,
  onEconomyUpdated,
  /** 'skin' | 'hat' | 'accessory' — прокрутить к секции при открытии */
  focusSlot = null,
}) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [mascot, setMascot] = useState(null)
  const [balance, setBalance] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    await Promise.resolve()
    if (userRole !== 'child') {
      setLoading(false)
      return
    }
    setError('')
    setLoading(true)
    const [ir, mr, wr] = await Promise.all([
      apiFetch('/shop/items'),
      apiFetch('/me/mascot'),
      apiFetch('/me/wallet'),
    ])
    if (ir.ok) {
      const data = await ir.json().catch(() => [])
      setItems(Array.isArray(data) ? data : [])
    } else {
      setItems([])
    }
    if (mr.ok) {
      setMascot(await mr.json().catch(() => null))
    } else {
      setMascot(null)
    }
    if (wr.ok) {
      const w = await wr.json().catch(() => null)
      if (w && typeof w.coins === 'number') setBalance(w.coins)
      else setBalance(null)
    } else {
      setBalance(null)
    }
    setLoading(false)
  }, [userRole])

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка каталога при открытии модалки
    void load()
  }, [open, load])

  useEffect(() => {
    if (!open || !focusSlot || loading) return
    const t = window.setTimeout(() => {
      const el = document.getElementById(`skin-shop-slot-${focusSlot}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
    return () => window.clearTimeout(t)
  }, [open, focusSlot, loading])

  const ownedSet = new Set(mascot?.owned_item_ids ?? [])
  const equippedSkin = mascot?.skin_item_id ?? null
  const equippedHat = mascot?.hat_item_id ?? null

  const buy = async (item) => {
    if (userRole !== 'child' || busy) return
    setBusy(`buy-${item.id}`)
    setError('')
    const res = await apiFetch('/shop/buy', {
      method: 'POST',
      body: JSON.stringify({ item_id: item.id }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(parseErrorDetail(data))
      setBusy(null)
      return
    }
    await load()
    onEconomyUpdated?.()
    setBusy(null)
  }

  const equipSkin = async (skinId) => {
    if (userRole !== 'child' || busy) return
    setBusy(`eq-skin-${skinId ?? 'default'}`)
    setError('')
    const res = await apiFetch('/me/mascot/equip', {
      method: 'PUT',
      body: JSON.stringify({ skin_item_id: skinId }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(parseErrorDetail(data))
      setBusy(null)
      return
    }
    setMascot(data)
    onEconomyUpdated?.()
    setBusy(null)
  }

  const equipHat = async (hatId) => {
    if (userRole !== 'child' || busy) return
    setBusy(`eq-hat-${hatId ?? 'none'}`)
    setError('')
    const res = await apiFetch('/me/mascot/equip', {
      method: 'PUT',
      body: JSON.stringify({ hat_item_id: hatId }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(parseErrorDetail(data))
      setBusy(null)
      return
    }
    setMascot(data)
    onEconomyUpdated?.()
    setBusy(null)
  }

  if (!open) return null

  const bySlot = (slot) => items.filter((i) => i.slot === slot).sort((a, b) => a.id - b.id)

  return (
    <div
      className="skin-shop-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skin-shop-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="skin-shop-panel">
        <header className="skin-shop-head">
          <h2 id="skin-shop-title">Магазин Артемия</h2>
          <button
            type="button"
            className="skin-shop-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        {userRole !== 'child' ? (
          <p className="skin-shop-note">
            Скины и монеты доступны в профиле ученика. Войдите как ученик, чтобы
            покупать и менять облик маскота.
          </p>
        ) : loading ? (
          <p className="skin-shop-note">Загрузка…</p>
        ) : (
          <>
            {balance !== null && (
              <p className="skin-shop-balance">
                Монеты: <strong>{balance}</strong>
              </p>
            )}
            {error ? <p className="skin-shop-error">{error}</p> : null}

            <section className="skin-shop-section" id="skin-shop-slot-skin">
              <h3 className="skin-shop-slot-title">{SLOT_LABEL.skin}</h3>
              <ul className="skin-shop-grid">
                <li className="skin-shop-card skin-shop-card--default">
                  <div className="skin-shop-card-visual">
                    <img src={resolveArtemiySkin(null, items).src} alt="" />
                  </div>
                  <div className="skin-shop-card-body">
                    <span className="skin-shop-card-name">Базовый маскот</span>
                    <span className="skin-shop-card-meta">Без скина</span>
                    {equippedSkin === null ? (
                      <span className="skin-shop-badge">Надето</span>
                    ) : (
                      <button
                        type="button"
                        className="skin-shop-btn skin-shop-btn--secondary"
                        disabled={Boolean(busy)}
                        onClick={() => equipSkin(null)}
                      >
                        {busy === 'eq-skin-default' ? '…' : 'Надеть'}
                      </button>
                    )}
                  </div>
                </li>
                {bySlot('skin').map((item) => {
                  const { src, className } = resolveArtemiySkin(item.id, items)
                  const owned = ownedSet.has(item.id)
                  const worn = equippedSkin === item.id
                  return (
                    <li key={item.id} className="skin-shop-card">
                      <div className="skin-shop-card-visual">
                        <img src={src} alt="" className={className || undefined} />
                      </div>
                      <div className="skin-shop-card-body">
                        <span className="skin-shop-card-name">{item.name}</span>
                        <span className="skin-shop-card-meta">
                          {owned ? 'Куплено' : `${item.price} монет`}
                        </span>
                        {owned ? (
                          worn ? (
                            <span className="skin-shop-badge">Надето</span>
                          ) : (
                            <button
                              type="button"
                              className="skin-shop-btn skin-shop-btn--secondary"
                              disabled={Boolean(busy)}
                              onClick={() => equipSkin(item.id)}
                            >
                              {busy === `eq-skin-${item.id}` ? '…' : 'Надеть'}
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            className="skin-shop-btn"
                            disabled={
                              Boolean(busy) ||
                              (balance !== null && balance < item.price)
                            }
                            onClick={() => buy(item)}
                          >
                            {busy === `buy-${item.id}` ? '…' : 'Купить'}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>

            {SLOT_ORDER.filter((s) => s !== 'skin').map((slot) => {
              const list = bySlot(slot)
              if (!list.length) return null
              return (
                <section
                  key={slot}
                  className="skin-shop-section"
                  id={`skin-shop-slot-${slot}`}
                >
                  <h3 className="skin-shop-slot-title">{SLOT_LABEL[slot]}</h3>
                  <ul className="skin-shop-grid skin-shop-grid--compact">
                    {list.map((item) => {
                      const owned = ownedSet.has(item.id)
                      const worn =
                        slot === 'hat'
                          ? equippedHat === item.id
                          : mascot?.accessory_item_id === item.id
                      return (
                        <li key={item.id} className="skin-shop-card skin-shop-card--compact">
                          <div className="skin-shop-card-body">
                            <span className="skin-shop-card-name">{item.name}</span>
                            <span className="skin-shop-card-meta">
                              {owned ? 'Куплено' : `${item.price} монет`}
                            </span>
                            {slot === 'hat' &&
                              (owned ? (
                                worn ? (
                                  <span className="skin-shop-badge">Надето</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="skin-shop-btn skin-shop-btn--secondary"
                                    disabled={Boolean(busy)}
                                    onClick={() => equipHat(item.id)}
                                  >
                                    {busy === `eq-hat-${item.id}` ? '…' : 'Надеть'}
                                  </button>
                                )
                              ) : (
                                <button
                                  type="button"
                                  className="skin-shop-btn"
                                  disabled={
                                    Boolean(busy) ||
                                    (balance !== null && balance < item.price)
                                  }
                                  onClick={() => buy(item)}
                                >
                                  {busy === `buy-${item.id}` ? '…' : 'Купить'}
                                </button>
                              ))}
                            {slot === 'accessory' && (
                              <span className="skin-shop-card-meta">Скоро</span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {slot === 'hat' && equippedHat != null ? (
                    <div className="skin-shop-hat-actions">
                      <button
                        type="button"
                        className="skin-shop-linkish"
                        disabled={Boolean(busy)}
                        onClick={() => equipHat(null)}
                      >
                        {busy === 'eq-hat-none' ? 'Снимаем…' : 'Снять головной убор'}
                      </button>
                    </div>
                  ) : null}
                </section>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
