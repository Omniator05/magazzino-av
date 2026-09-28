import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { trialDaysLeft } from '../utils/billing'
import { Star } from './Icon'
import { useModalScrollLock } from '../hooks/useModalScrollLock'

// Promemoria "passa a Pro" per l'admin, mostrato solo nella Home admin.
// Due livelli, entrambi mai bloccanti e mai visti dai magazzinieri:
//  - BANNER inline: fisso, non si chiude — finché la squadra non è abbonata
//    l'admin deve continuare a vederlo. Presente per qualunque squadra non
//    ancora abbonata.
//  - PROMEMORIA al login: modale una-tantum per sessione, SOLO quando la
//    situazione è concreta (prova che scade tra ≤3 giorni o già scaduta).
// Chi è già abbonato / esente / bloccato per pagamento fallito non vede nulla.
const SESSION_KEY = 'proUpsellLoginSeen'

export default function ProUpsell() {
  const { t } = useTranslation()
  const { team, profile } = useAuth()
  const navigate = useNavigate()

  const status = team?.billingStatus
  const isAdmin = profile?.role === 'admin'
  const isPaid = status === 'active' || status === 'exempt'
  const days = trialDaysLeft(team) // null | numero (può essere negativo)

  const trialEndingSoon = status === 'trialing' && days !== null && days > 0 && days <= 3
  const trialExpired = status === 'canceled' || (status === 'trialing' && days !== null && days <= 0)
  const urgent = trialEndingSoon || trialExpired

  // Solo admin, squadra non già a pagamento e non bloccata (past_due → BillingGate).
  const eligible = isAdmin && !!status && !isPaid && status !== 'past_due'

  const [modalOpen, setModalOpen] = useState(false)

  // Il team arriva in modo asincrono: decidiamo l'apertura della modale in un
  // effetto, così scatta quando `eligible`/`urgent` diventano veri, non solo
  // al primo render (quando `team` è ancora null).
  useEffect(() => {
    if (!eligible || !urgent) return
    let seen = false
    try { seen = sessionStorage.getItem(SESSION_KEY) === '1' } catch {}
    if (!seen) setModalOpen(true)
  }, [eligible, urgent])

  useModalScrollLock(modalOpen)

  if (!eligible) return null

  const closeModal = () => {
    setModalOpen(false)
    try { sessionStorage.setItem(SESSION_KEY, '1') } catch {}
  }
  const goToBilling = () => { closeModal(); navigate('/admin/settings/billing') }

  const bannerTitle = trialExpired ? t('proUpsell.bannerExpiredTitle')
    : trialEndingSoon ? t('proUpsell.bannerEndingTitle', { count: days })
    : t('proUpsell.bannerTitle')
  const bannerDesc = trialExpired ? t('proUpsell.bannerExpiredDesc') : t('proUpsell.bannerDesc')

  return (
    <>
      <style>{`
        .pro-upsell-banner { transition: border-color 0.2s ease, background 0.2s ease; }
        .pro-upsell-banner .pu-chevron { transition: transform 0.2s ease, opacity 0.2s ease; opacity: 0.55; }
        @media (hover: hover) and (pointer: fine) {
          .pro-upsell-banner:hover { border-color: var(--accent); background: rgba(230,57,70,0.06); }
          .pro-upsell-banner:hover .pu-chevron { transform: translateX(3px); opacity: 1; }
        }
      `}</style>
      <button
        type="button"
        className="btn-no-anim pro-upsell-banner"
        onClick={() => navigate('/admin/settings/billing')}
        style={{
          width: '100%', background: urgent ? '#fff5f5' : 'var(--dash-card)',
          border: `1px solid ${urgent ? '#fecdd3' : 'var(--dash-card-border)'}`,
          borderRadius: 16, padding: '12px 15px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--accent)', flexShrink: 0 }}><Star size={19} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--dash-title)' }}>{bannerTitle}</p>
          <p style={{ fontSize: 12, color: 'var(--dash-muted)', marginTop: 1, lineHeight: 1.4 }}>{bannerDesc}</p>
        </span>
        <span className="pu-chevron" style={{ color: 'var(--accent)', fontSize: 18, flexShrink: 0 }}>›</span>
      </button>

      {modalOpen && (
        <div
          onClick={closeModal}
          style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(10,12,18,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'proUpsellFade 0.15s ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ background: '#fff', borderRadius: 24, padding: '26px 22px 20px', width: '100%', maxWidth: 340, textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,0.35)', animation: 'proUpsellPop 0.24s cubic-bezier(0.32,0.72,0,1)' }}
          >
            <div style={{ width: 54, height: 54, borderRadius: '50%', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(230,57,70,0.12)', color: 'var(--accent)' }}>
              <Star size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: '0 0 6px', letterSpacing: '-0.3px' }}>
              {trialExpired ? t('proUpsell.modalExpiredTitle') : t('proUpsell.modalEndingTitle', { count: days })}
            </h3>
            <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.45 }}>
              {trialExpired ? t('proUpsell.modalExpiredBody') : t('proUpsell.modalEndingBody')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
              <button onClick={goToBilling} style={{ padding: 12, borderRadius: 13, fontSize: 14, fontWeight: 800, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                {t('proUpsell.modalCta')}
              </button>
              <button onClick={closeModal} style={{ padding: 10, borderRadius: 13, fontSize: 13.5, fontWeight: 700, background: 'transparent', color: '#6b7280', border: 'none', cursor: 'pointer' }}>
                {t('proUpsell.modalLater')}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes proUpsellFade { from{opacity:0} to{opacity:1} }
            @keyframes proUpsellPop  { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
          `}</style>
        </div>
      )}
    </>
  )
}
