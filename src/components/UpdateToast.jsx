import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

// Popup "aggiornamento riuscito" al primo avvio dopo un nuovo deploy: confronta
// l'hash del commit incorporato in build (__APP_VERSION__, vedi vite.config.js)
// con l'ultimo visto su questo dispositivo. Non compare alla primissima visita
// in assoluto (nessuna versione precedente salvata), solo quando cambia
// rispetto a una già vista — così un git push seguito da deploy dà un
// riscontro visivo al primo login successivo, senza bisogno di controllare
// manualmente se tutto è andato a buon fine.
export default function UpdateToast() {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const current = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
    if (!current) return
    const key = 'app_version_seen'
    const last = localStorage.getItem(key)
    if (last && last !== current) setShow(true)
    localStorage.setItem(key, current)
  }, [])

  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => setShow(false), 4000)
    return () => clearTimeout(timer)
  }, [show])

  if (!show) return null
  return (
    <div role="status" style={{
      position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:999,
      background:'var(--card)', border:'1.5px solid var(--green)', borderRadius:14,
      padding:'10px 16px', boxShadow:'var(--shadow)', display:'flex', alignItems:'center', gap:8,
    }}>
      <span style={{ color:'var(--green)', fontSize:16, fontWeight:800 }}>✓</span>
      <p style={{ color:'var(--text)', fontSize:13, fontWeight:700 }}>{t('common.appUpdated')}</p>
    </div>
  )
}
