import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Recurring } from './Icon'

// Barra sottile e persistente: "c'è una versione nuova, ricarica quando
// vuoi" — diversa apposta da WhatsNewModal (quello racconta le novità DOPO
// che l'app si è già aggiornata da sola al prossimo avvio). Questa invece
// avvisa PRIMA, mentre la pagina è ancora aperta con la versione vecchia,
// e lascia decidere quando ricaricare — utile soprattutto in magazzino, a
// metà di una lista di carico: un ricaricamento forzato senza preavviso
// avrebbe potuto interrompere un carico a metà.
//
// Per questo in vite.config.js registerType è 'prompt', non più
// 'autoUpdate': il nuovo service worker resta in attesa finché non è
// questo componente (tramite updateSW(true)) a dirgli di attivarsi.
export default function UpdateAvailableBanner() {
  const { t } = useTranslation()
  const [needRefresh, setNeedRefresh] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const updateSWRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    // Import dinamico: virtual:pwa-register esiste solo nella build PWA
    // (in dev con devOptions.enabled va comunque bene) — evitare un import
    // statico qui protegge da un crash se il plugin non è attivo per
    // qualche motivo, non solo per pigrizia stilistica.
    import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return
      updateSWRef.current = registerSW({
        immediate: true,
        onNeedRefresh() { setNeedRefresh(true) },
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!needRefresh || dismissed) return null

  return (
    <>
      <div role="status" className="rc-update-banner">
        <span style={{ display:'flex', flexShrink:0 }}><Recurring size={14} /></span>
        <span style={{ flex:1, minWidth:0 }}>{t('common.updateAvailableBanner')}</span>
        <button onClick={() => updateSWRef.current?.(true)} className="rc-update-banner-btn">
          {t('common.updateAvailableReload')}
        </button>
        <button onClick={() => setDismissed(true)} aria-label={t('common.close')} className="rc-update-banner-close">✕</button>
      </div>
      <style>{`
        .rc-update-banner {
          position: fixed; top: 0; left: 0; right: 0; z-index: 190;
          padding: calc(env(safe-area-inset-top) + 7px) 12px 7px 16px;
          display: flex; align-items: center; gap: 8px;
          font-size: 12.5px; font-weight: 600;
          background: #222c42; color: #fff;
          animation: rcUpdateBarIn 0.25s cubic-bezier(0.16,1,0.3,1) both;
        }
        /* Stessa barra "offline" occupa la stessa zona — se visibile questa
           scende sotto, invece di sovrapporsi (vedi rc-offline-bar in
           OfflineIndicator.jsx e lo stesso pattern già usato da Toast.jsx). */
        body.rc-offline-bar .rc-update-banner { top: calc(env(safe-area-inset-top) + 38px); }
        .rc-update-banner-btn {
          flex-shrink: 0; background: #fff; color: #222c42; border: none;
          border-radius: 8px; padding: 6px 12px; font-size: 12.5px; font-weight: 800;
        }
        .rc-update-banner-close {
          flex-shrink: 0; background: transparent; color: rgba(255,255,255,0.7);
          border: none; font-size: 14px; width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
        }
        @keyframes rcUpdateBarIn {
          from { transform: translateY(-100%); opacity: 0.6; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .rc-update-banner { animation: none; }
        }
      `}</style>
    </>
  )
}
