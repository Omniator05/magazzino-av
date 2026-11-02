import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import AuthBackground from '../components/AuthBackground'

// Benvenuto a chi ha appena confermato l'email e creato la squadra (non a chi si unisce a una esistente: quella
// finisce su PendingApproval). Una schermata di accoglienza animata; "Iniziamo" apre la Dashboard (con
// OnboardingReveal, sempre montato in App.jsx) e avvia il tour guidato sull'app vera (GuidedTour.jsx):
// utente, logo, primo oggetto, primo evento — i passi non stanno più qui, si fanno sulle pagine vere.
// Stesso sfondo animato di login/signup (AuthBackground): siamo ancora "fuori" dall'app.
export default function Welcome() {
  const { t } = useTranslation()
  const { profile, team, updateTeamData, setOnboardingReveal } = useAuth()
  const [starting, setStarting] = useState(false)
  const firstName = (profile?.name || '').split(' ')[0]

  const start = () => {
    if (starting) return
    setStarting(true)
    // Il tour parte da solo quando la Dashboard è visibile (stato salvato sulla squadra: vale su ogni dispositivo).
    updateTeamData({ onboarded: true, tour: { status: 'active', step: 0 } })
    setOnboardingReveal(true)
  }

  return (
    <AuthBackground>
      <style>{`
        .wl-mark { animation: wlMarkIn 0.9s cubic-bezier(0.34,1.56,0.64,1) 0.15s both; }
        .wl-ring { position:absolute; inset:0; border-radius:28px; border:2px solid #e63946; animation: wlRing 2.4s ease-out infinite; opacity:0; }
        .wl-ring.b { animation-delay: 1.2s; }
        .wl-rise { animation: wlRise 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes wlMarkIn { from { opacity:0; transform: scale(0.4) rotate(-8deg); } to { opacity:1; transform:none; } }
        @keyframes wlRing { 0% { transform:scale(1); opacity:0.55; } 100% { transform:scale(1.9); opacity:0; } }
        @keyframes wlRise { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform:none; } }
        @media (prefers-reduced-motion: reduce) {
          .wl-mark, .wl-rise { animation: none; }
          .wl-ring { display:none; }
        }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 440, textAlign: 'center', padding: '0 8px', boxSizing: 'border-box' }}>
        <div style={{ position: 'relative', width: 104, height: 104, margin: '0 auto 34px' }}>
          <span className="wl-ring" aria-hidden="true" />
          <span className="wl-ring b" aria-hidden="true" />
          <img className="wl-mark" src="/pwa-192x192.png" alt="" width="104" height="104" style={{ position: 'relative', borderRadius: 28, boxShadow: '0 18px 48px rgba(230,57,70,0.35)' }} />
        </div>

        <h1 className="wl-rise" style={{ animationDelay: '0.7s', fontSize: 30, fontWeight: 800, letterSpacing: '-0.6px', margin: '0 0 10px', color: 'rgb(var(--au-fg))' }}>
          {t('welcome.introTitle', { name: firstName })}
        </h1>
        <p className="wl-rise" style={{ animationDelay: '0.95s', fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#e63946' }}>
          {t('welcome.introTeam', { team: team?.name || '' })}
        </p>
        <p className="wl-rise" style={{ animationDelay: '1.15s', fontSize: 14.5, lineHeight: 1.6, margin: '0 auto 34px', maxWidth: 340, color: 'rgba(var(--au-fg), calc(var(--au-k) * 0.5))' }}>
          {t('welcome.introText')}
        </p>

        <button className="auth-btn wl-rise" style={{ animationDelay: '1.5s', maxWidth: 300, margin: '0 auto', opacity: starting ? 0.7 : undefined }} onClick={start} disabled={starting} autoFocus>
          {starting ? t('welcome.launching') : t('welcome.introStart')}
        </button>
      </div>
    </AuthBackground>
  )
}
