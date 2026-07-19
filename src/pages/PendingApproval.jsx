import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import AuthShell from '../components/AuthShell'

// Schermata mostrata al posto delle route normali quando il profilo non è
// (ancora) approvato, è stato disattivato, o non ha un ruolo riconosciuto —
// mai deve lasciar passare l'utente nella vista admin di default.
export default function PendingApproval({ reason = 'unknown' }) {
  const { t } = useTranslation()
  const { logout, team } = useAuth()

  const CONTENT = {
    pending: {
      title: t('pendingApproval.pendingTitle'),
      body: t('pendingApproval.pendingBody', { teamSuffix: team?.name ? t('pendingApproval.pendingTeamSuffix', { team: team.name }) : '' }),
    },
    inactive: {
      title: t('pendingApproval.inactiveTitle'),
      body: t('pendingApproval.inactiveBody'),
    },
    unknown: {
      title: t('pendingApproval.unknownTitle'),
      body: t('pendingApproval.unknownBody'),
    },
  }
  const { title, body } = CONTENT[reason] || CONTENT.unknown

  return (
    <AuthShell>
      <div className="auth-card" style={{ textAlign:'center' }}>
        <div style={{ fontSize:38, marginBottom:14 }}>{reason === 'pending' ? '⏳' : '⚠️'}</div>
        <h2 style={{ fontSize:20, fontWeight:700, color:'white', marginBottom:10 }}>{title}</h2>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', lineHeight:1.6, marginBottom:28 }}>
          {body}
        </p>
        <button className="auth-btn-secondary" onClick={logout}>{t('pendingApproval.exit')}</button>
      </div>
    </AuthShell>
  )
}
