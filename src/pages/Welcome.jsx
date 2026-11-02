import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import AuthBackground from '../components/AuthBackground'

// Benvenuto a chi ha appena confermato l'email e creato la squadra (non a chi si unisce a una esistente: quella
// finisce su PendingApproval). Una schermata di accoglienza animata e allegra; "Iniziamo" apre la Dashboard (con
// OnboardingReveal, sempre montato in App.jsx), dove GuidedTour chiede se si vuole fare il tour sull'app vera.
// Stesso sfondo animato di login/signup (AuthBackground): siamo ancora "fuori" dall'app.
// Coriandoli: posizioni fisse (niente casualità a ogni render), colori del marchio e qualche tinta allegra.
const CONFETTI = Array.from({ length: 28 }, (_, i) => {
  const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.17
  const dist = 95 + (i * 37) % 85
  return {
    x: Math.round(Math.cos(a) * dist), y: Math.round(Math.sin(a) * dist * 0.8 - 30),
    rot: (i * 83) % 360 - 180, d: (i % 7) * 0.04,
    color: ['#e63946', '#f5a623', '#ffffff', '#4fc3f7', '#69f0ae', '#ee4a58'][i % 6],
    w: 6 + (i % 3) * 2, h: 8 + (i % 4) * 2, round: i % 4 === 0,
  }
})

export default function Welcome() {
  const { t } = useTranslation()
  const { profile, team, updateTeamData, setOnboardingReveal } = useAuth()
  const [starting, setStarting] = useState(false)
  const firstName = (profile?.name || '').split(' ')[0]

  const start = () => {
    if (starting) return
    setStarting(true)
    // Sulla Dashboard GuidedTour chiede "Facciamo un tour?" (stato salvato sulla squadra: vale su ogni dispositivo).
    updateTeamData({ onboarded: true, tour: { status: 'ask' } })
    setOnboardingReveal(true)
  }

  return (
    <AuthBackground>
      <style>{`
        .wl-mark { animation: wlMarkIn 0.9s cubic-bezier(0.34,1.56,0.64,1) 0.15s both; }
        .wl-ring { position:absolute; inset:0; border-radius:28px; border:2px solid #e63946; animation: wlRing 2.4s ease-out infinite; opacity:0; }
        .wl-ring.b { animation-delay: 1.2s; }
        .wl-rise { animation: wlRise 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        .wl-float { animation: wlFloat 3.2s ease-in-out 1.2s infinite; }
        .wl-conf { position:absolute; left:50%; top:50%; width:var(--w); height:var(--h); margin:-4px 0 0 -4px; border-radius:var(--r); background:var(--c); opacity:0; animation: wlConf 1.9s cubic-bezier(0.15,0.7,0.3,1) var(--d) both; }
        @keyframes wlConf { 0% { opacity:0; transform: translate(0,0) rotate(0) scale(0.3); } 12% { opacity:1; } 100% { opacity:0; transform: translate(var(--x), calc(var(--y) + 70px)) rotate(var(--rot)) scale(1); } }
        @keyframes wlFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes wlMarkIn { from { opacity:0; transform: scale(0.4) rotate(-8deg); } to { opacity:1; transform:none; } }
        @keyframes wlRing { 0% { transform:scale(1); opacity:0.55; } 100% { transform:scale(1.9); opacity:0; } }
        @keyframes wlRise { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform:none; } }
        @media (prefers-reduced-motion: reduce) {
          .wl-mark, .wl-rise, .wl-float { animation: none; }
          .wl-ring, .wl-conf { display:none; }
        }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 440, textAlign: 'center', padding: '0 8px', boxSizing: 'border-box' }}>
        <div style={{ position: 'relative', width: 104, height: 104, margin: '0 auto 34px' }}>
          <span className="wl-ring" aria-hidden="true" />
          <span className="wl-ring b" aria-hidden="true" />
          {/* Una pioggia di coriandoli quando compare il logo (solo decorazione) */}
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {CONFETTI.map((c, i) => (
              <i key={i} className="wl-conf" style={{ '--x': `${c.x}px`, '--y': `${c.y}px`, '--rot': `${c.rot}deg`, '--d': `${0.55 + c.d}s`, '--c': c.color, '--w': `${c.w}px`, '--h': `${c.h}px`, '--r': c.round ? '50%' : '2px' }} />
            ))}
          </span>
          <div className="wl-float" style={{ position: 'relative' }}>
            <img className="wl-mark" src="/pwa-192x192.png" alt="" width="104" height="104" style={{ position: 'relative', display: 'block', borderRadius: 28, boxShadow: '0 18px 48px rgba(230,57,70,0.35)' }} />
          </div>
        </div>

        <h1 className="wl-rise" style={{ animationDelay: '0.75s', fontSize: 31, fontWeight: 800, letterSpacing: '-0.7px', lineHeight: 1.15, margin: '0 0 12px', color: 'rgb(var(--au-fg))' }}>
          {t('welcome.introTitle', { name: firstName })}
        </h1>
        <p className="wl-rise" style={{ animationDelay: '1.05s', fontSize: 17, fontWeight: 700, margin: '0 0 34px', color: '#e63946' }}>
          {t('welcome.introTeam')}
        </p>

        <button className="auth-btn wl-rise" style={{ animationDelay: '1.4s', maxWidth: 300, margin: '0 auto', opacity: starting ? 0.7 : undefined }} onClick={start} disabled={starting} autoFocus>
          {starting ? t('welcome.launching') : t('welcome.introStart')}
        </button>
      </div>
    </AuthBackground>
  )
}
