import { useCallback, useEffect, useState } from 'react'

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Оставляет диалог в DOM на время анимации закрытия.
 * @param {boolean} open
 * @param {() => void} onClose — вызывается после выхода (или сразу при reduced motion)
 */
export function useDialogPresence(open, onClose) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (open) setExiting(false)
  }, [open])

  const requestClose = useCallback(() => {
    if (prefersReducedMotion()) {
      onClose()
      return
    }
    setExiting(true)
  }, [onClose])

  const handleExitEnd = useCallback(
    (e) => {
      if (e.target !== e.currentTarget) return
      if (!exiting) return
      setExiting(false)
      onClose()
    },
    [exiting, onClose],
  )

  const shouldRender = open || exiting

  return { shouldRender, exiting, requestClose, handleExitEnd }
}
