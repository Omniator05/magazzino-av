import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from './Icon'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { CHANGELOG } from '../changelog'

const BUILD_SEEN_KEY = 'app_version_seen'      // hash di build (__APP_VERSION__) — rileva "c'è stato un deploy"
const CHANGELOG_SEEN_KEY = 'changelog_last_seen' // versione (data) dell'ultima voce di changelog già vista

// Popup "cosa è cambiato" al primo accesso dopo un aggiornamento — sostituisce
// il precedente piccolo avviso "app aggiornata". Due percorsi:
//  - Se da quando questo dispositivo ha visto l'app per l'ultima volta sono
//    uscite nuove voci di changelog, le mostra una alla volta (un pallino per
//    voce se sono più di una) — un percorso guidato invece di un unico muro
//    di testo con tutto insieme.
//  - Se nel frattempo è comunque uscito un nuovo deploy ma senza niente da
//    raccontare (una correzione interna), torna il vecchio avviso piccolo e
//    silenzioso — solo per confermare che l'aggiornamento è andato a buon
//    fine, senza interrompere con un popup grande per nulla.
// Non compare mai alla primissima visita in assoluto: chi arriva ora non ha
// "novità" da recuperare, è tutto nuovo per lui.
export default function WhatsNewModal() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'it'
  const [pending, setPending] = useState([])
  const [step, setStep] = useState(0)
  const [closing, setClosing] = useState(false)
  const [showSimpleToast, setShowSimpleToast] = useState(false)
  useModalScrollLock(pending.length > 0)

  useEffect(() => {
    const currentBuild = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
    const lastBuild = currentBuild ? localStorage.getItem(BUILD_SEEN_KEY) : null
    const isNewDeploy = !!currentBuild && lastBuild !== null && lastBuild !== currentBuild
    if (currentBuild) localStorage.setItem(BUILD_SEEN_KEY, currentBuild)

    const lastChangelogSeen = localStorage.getItem(CHANGELOG_SEEN_KEY)
    if (lastChangelogSeen === null) {
      // Primissima visita: nulla da recuperare, solo segna il presente come "già visto".
      if (CHANGELOG[0]) localStorage.setItem(CHANGELOG_SEEN_KEY, CHANGELOG[0].version)
      return
    }
    const unseen = CHANGELOG.filter(c => c.version > lastChangelogSeen).sort((a, b) => a.version.localeCompare(b.version))
    if (unseen.length > 0) {
      setPending(unseen)
    } else if (isNewDeploy) {
      setShowSimpleToast(true)
    }
  }, [])

  useEffect(() => {
    if (!showSimpleToast) return
    const timer = setTimeout(() => setShowSimpleToast(false), 7000)
    return () => clearTimeout(timer)
  }, [showSimpleToast])

  const markSeen = () => {
    if (CHANGELOG[0]) localStorage.setItem(CHANGELOG_SEEN_KEY, CHANGELOG[0].version)
  }
  const close = () => {
    setClosing(true)
    setTimeout(() => {
      markSeen()
      setClosing(false)
      setPending([])
      setStep(0)
    }, 150)
  }
  const next = () => {
    if (step < pending.length - 1) setStep(s => s + 1)
    else close()
  }

  useEffect(() => {
    if (pending.length === 0) return
    const onKey = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length])

  if (pending.length > 0) {
    const entry = pending[step][lang] || pending[step].it
    return (
      <div
        onClick={close}
        style={{ position: 'fixed', inset: 0, zIndex: 10060, background: 'rgba(10,12,18,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: closing ? 'wnFadeOut 0.15s ease forwards' : 'wnFadeIn 0.15s ease' }}
      >
        <div
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          style={{
            background: '#fff', borderRadius: 24, padding: '24px 24px 22px', width: '100%', maxWidth: 360,
            maxHeight: 'calc(100dvh - 48px)', display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 70px rgba(0,0,0,0.35)', animation: closing ? 'wnPopOut 0.15s ease forwards' : 'wnPopIn 0.28s cubic-bezier(0.32,0.72,0,1)',
          }}
        >
          <p style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4, flexShrink: 0 }}>{t('common.whatsNewLabel')}</p>
          <h2 style={{ textAlign: 'center', fontSize: 19, fontWeight: 800, color: '#111827', margin: '0 0 16px', letterSpacing: '-0.3px', flexShrink: 0 }}>{entry.title}</h2>

          {/* Tante voci in una volta stanno scomode su un solo schermo —
              scorre solo questa lista, non tutto il popup: titolo, pallini e
              bottone restano sempre a vista invece di sparire scorrendo. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18, overflowY: 'auto', minHeight: 0 }}>
            {entry.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1, background: 'rgba(52,211,153,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={11} />
                </span>
                <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.45 }}>{it}</p>
              </div>
            ))}
          </div>

          {pending.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16, flexShrink: 0 }}>
              {pending.map((_, i) => (
                <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === step ? 'var(--accent)' : '#e5e7eb' }} />
              ))}
            </div>
          )}

          <button onClick={next} style={{ width: '100%', padding: 13, borderRadius: 13, fontWeight: 700, fontSize: 14, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
            {step < pending.length - 1 ? t('common.whatsNewNext') : t('common.whatsNewDone')}
          </button>
        </div>
        <style>{`
          @keyframes wnFadeIn  { from{opacity:0} to{opacity:1} }
          @keyframes wnFadeOut { from{opacity:1} to{opacity:0} }
          @keyframes wnPopIn   { from{opacity:0; transform:translateY(14px) scale(0.95)} to{opacity:1; transform:translateY(0) scale(1)} }
          @keyframes wnPopOut  { from{opacity:1; transform:scale(1)} to{opacity:0; transform:scale(0.96)} }
        `}</style>
      </div>
    )
  }

  // Nessuna novità da raccontare ma un deploy è comunque avvenuto: il vecchio
  // avviso discreto, solo per confermare che è andato a buon fine.
  if (!showSimpleToast) return null
  return (
    <>
      <style>{`
        @keyframes utIn { from{opacity:0; transform:translate(-50%,-8px)} to{opacity:1; transform:translate(-50%,0)} }
      `}</style>
      <div role="status" style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translate(-50%,0)', zIndex: 999,
        background: 'var(--card)', border: '1.5px solid var(--green)', borderRadius: 14,
        padding: '10px 16px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: 8,
        animation: 'utIn 0.3s ease both',
      }}>
        <span style={{ color: 'var(--green)', fontSize: 16, fontWeight: 800 }}>✓</span>
        <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700 }}>{t('common.appUpdated')}</p>
      </div>
    </>
  )
}
