import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { Warn, Check } from './Icon'

// Barra sottile in cima, sempre montata (login, liste di carico comprese —
// è lì che sapere di essere offline conta di più, a differenza di
// ActiveShiftBadge che invece le evita). Due stati: "sei offline" (resta
// finché non torna la rete) e un breve "connessione ripristinata" di
// conferma quando torna, poi sparisce da sola.
//
// Mentre è visibile aggiunge la classe rc-offline-bar al <body>: altri
// elementi fissi in alto (vedi .active-shift-badge-wrap in ActiveShiftBadge)
// la usano per scendere di qualche pixel invece di sovrapporsi.
export default function OfflineIndicator() {
  const { t } = useTranslation()
  const isOnline = useOnlineStatus()
  const [showReconnected, setShowReconnected] = useState(false)
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!isOnline) { wasOffline.current = true; return }
    if (!wasOffline.current) return
    wasOffline.current = false
    setShowReconnected(true)
    const id = setTimeout(() => setShowReconnected(false), 2500)
    return () => clearTimeout(id)
  }, [isOnline])

  const visible = !isOnline || showReconnected

  useEffect(() => {
    document.body.classList.toggle('rc-offline-bar', visible)
    return () => document.body.classList.remove('rc-offline-bar')
  }, [visible])

  if (!visible) return null

  return (
    <>
      <div role="status" className={`offline-bar ${isOnline ? 'offline-bar-ok' : 'offline-bar-off'}`}>
        {isOnline ? <Check size={13} /> : <Warn size={13} />}
        {isOnline ? t('common.backOnlineBar') : t('common.offlineBar')}
      </div>
      <style>{`
        .offline-bar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 200;
          padding: calc(env(safe-area-inset-top) + 7px) 16px 7px;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          font-size: 12.5px; font-weight: 700;
          animation: offlineBarIn 0.25s cubic-bezier(0.16,1,0.3,1) both;
        }
        .offline-bar-off { background: var(--accent2); color: #3d2c05; }
        .offline-bar-ok  { background: var(--green); color: #0b3223; }
        @keyframes offlineBarIn {
          from { transform: translateY(-100%); opacity: 0.6; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .offline-bar { animation: none; }
        }
      `}</style>
    </>
  )
}
