import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

const IconHome = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/>
  </svg>
)
const IconGrid = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
  </svg>
)
const IconTeam = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IconGear = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)
const IconCamera = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
  </svg>
)
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)

// Tour rapido mostrato una sola volta al primo login (per profilo, non per
// dispositivo — persistito su profile.tutorialSeen). Sempre saltabile e mai
// bloccante: solo pallini di progresso + Salta/Avanti, mai un percorso
// lineare senza via d'uscita.
const SLIDES = {
  admin: [
    { Icon: IconHome, tint:'rgba(37,99,235,0.10)', color:'#2563eb', titleKey: 'tutorial.admin.s1Title', textKey: 'tutorial.admin.s1Text' },
    { Icon: IconGrid, tint:'rgba(230,57,70,0.10)', color:'#e63946', titleKey: 'tutorial.admin.s2Title', textKey: 'tutorial.admin.s2Text' },
    { Icon: IconTeam, tint:'rgba(147,51,234,0.10)', color:'#9333ea', titleKey: 'tutorial.admin.s3Title', textKey: 'tutorial.admin.s3Text' },
    { Icon: IconGear, tint:'rgba(5,150,105,0.10)', color:'#059669', titleKey: 'tutorial.admin.s4Title', textKey: 'tutorial.admin.s4Text' },
  ],
  worker: [
    { Icon: IconHome,     tint:'rgba(37,99,235,0.10)', color:'#2563eb', titleKey: 'tutorial.worker.s1Title', textKey: 'tutorial.worker.s1Text' },
    { Icon: IconCamera,   tint:'rgba(230,57,70,0.10)', color:'#e63946', titleKey: 'tutorial.worker.s2Title', textKey: 'tutorial.worker.s2Text' },
    { Icon: IconCalendar, tint:'rgba(147,51,234,0.10)', color:'#9333ea', titleKey: 'tutorial.worker.s3Title', textKey: 'tutorial.worker.s3Text' },
    { Icon: IconGear,     tint:'rgba(5,150,105,0.10)', color:'#059669', titleKey: 'tutorial.worker.s4Title', textKey: 'tutorial.worker.s4Text' },
  ],
}

export default function TutorialModal({ role }) {
  const { t } = useTranslation()
  const { profile, updateProfileData } = useAuth()
  const [show, setShow] = useState(false)
  const [index, setIndex] = useState(0)
  const [closing, setClosing] = useState(false)

  const slides = SLIDES[role] || SLIDES.worker

  useEffect(() => {
    if (!profile || profile.tutorialSeen === true) return
    // Un po' di respiro dopo qualunque transizione appena finita (es. la
    // rivelazione della dashboard a fine onboarding) — senza, il popup
    // spuntava incollato subito dopo, tutto troppo "uno dopo l'altro".
    const timer = setTimeout(() => setShow(true), 1100)
    return () => clearTimeout(timer)
  }, [profile])

  const close = () => {
    setClosing(true)
    setTimeout(() => {
      setShow(false)
      setClosing(false)
      updateProfileData({ tutorialSeen: true })
    }, 200)
  }

  if (!show) return null
  const slide = slides[index]
  const isLast = index === slides.length - 1

  return (
    <div
      onClick={close}
      style={{ position:'fixed', inset:0, zIndex:10050, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation: closing ? 'tutFadeOut 0.2s ease forwards' : 'tutFadeIn 0.15s ease' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ background:'#fff', borderRadius:24, padding:'30px 26px 24px', width:'100%', maxWidth:340, textAlign:'center', boxShadow:'0 24px 70px rgba(0,0,0,0.35)', animation: closing ? 'tutPopOut 0.2s ease forwards' : 'tutPopIn 0.28s cubic-bezier(0.32,0.72,0,1)' }}
      >
        <div key={index} style={{ animation:'tutSlideIn 0.25s ease both' }}>
          <div style={{ width:54, height:54, borderRadius:'50%', margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center', background:slide.tint, color:slide.color }}>
            <slide.Icon />
          </div>
          <h3 style={{ fontSize:19, fontWeight:800, color:'#111827', margin:'0 0 8px' }}>{t(slide.titleKey)}</h3>
          <p style={{ fontSize:14, color:'#6b7280', lineHeight:1.5, margin:'0 0 22px' }}>{t(slide.textKey)}</p>
        </div>

        <div style={{ display:'flex', gap:6, justifyContent:'center', marginBottom:22 }}>
          {slides.map((_, i) => (
            <div key={i} style={{ width: i === index ? 20 : 7, height:7, borderRadius:4, background: i === index ? '#e63946' : '#e5e7eb', transition:'all 0.25s ease' }} />
          ))}
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={close} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'#f3f4f6', color:'#374151', border:'none', cursor:'pointer' }}>
            {t('tutorial.skip')}
          </button>
          <button
            onClick={() => isLast ? close() : setIndex(i => i + 1)}
            style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'#e63946', color:'#fff', border:'none', cursor:'pointer' }}
          >
            {isLast ? t('tutorial.done') : t('tutorial.next')}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes tutFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes tutFadeOut { from{opacity:1} to{opacity:0} }
        @keyframes tutPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
        @keyframes tutPopOut  { from{opacity:1; transform:scale(1)} to{opacity:0; transform:scale(0.97)} }
        @keyframes tutSlideIn { from{opacity:0; transform:translateX(8px)} to{opacity:1; transform:translateX(0)} }
      `}</style>
    </div>
  )
}
