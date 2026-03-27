import { useEffect } from 'react'
import ParentAgeCheckForm from './ParentAgeCheckForm.jsx'
import './MainSite.css'

/**
 * Только проверка «взрослый» поверх главной страницы кабинета.
 */
export default function ParentsGateOverlay({ onClose, onVerified }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="ms-parents-overlay" role="presentation">
      <button
        type="button"
        className="ms-parents-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className="ms-parents-modal ms-parents-modal--gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ms-parents-gate-title"
      >
        <button
          type="button"
          className="ms-parents-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
        <div className="ms-parents-modal-scroll ms-parents-modal-scroll--gate">
          <h2 id="ms-parents-gate-title" className="ms-parents-gate-heading">
            Проверка для взрослого
          </h2>
          <p className="ms-parents-gate-hint">
            Решите пример без калькулятора — так открывается раздел для родителей.
          </p>
          <ParentAgeCheckForm
            onSuccess={() => {
              onVerified()
            }}
          />
        </div>
      </div>
    </div>
  )
}
