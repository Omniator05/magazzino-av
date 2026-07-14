import { useAuth } from '../context/AuthContext'
import AuthShell from '../components/AuthShell'

const CONTENT = {
  pending: {
    title: 'Richiesta inviata',
    body: teamName => `Il tuo account è in attesa di approvazione da parte di un amministratore${teamName ? ` di ${teamName}` : ''}. Riceverai accesso non appena verrà confermato.`,
  },
  inactive: {
    title: 'Accesso disattivato',
    body: () => 'Il tuo account è stato disattivato da un amministratore. Contattalo per riattivarlo.',
  },
  unknown: {
    title: 'Problema con l\'account',
    body: () => 'Il tuo account non è configurato correttamente. Contatta un amministratore per risolvere.',
  },
}

// Schermata mostrata al posto delle route normali quando il profilo non è
// (ancora) approvato, è stato disattivato, o non ha un ruolo riconosciuto —
// mai deve lasciar passare l'utente nella vista admin di default.
export default function PendingApproval({ reason = 'unknown' }) {
  const { logout, team } = useAuth()
  const { title, body } = CONTENT[reason] || CONTENT.unknown

  return (
    <AuthShell>
      <div className="auth-card" style={{ textAlign:'center' }}>
        <div style={{ fontSize:38, marginBottom:14 }}>{reason === 'pending' ? '⏳' : '⚠️'}</div>
        <h2 style={{ fontSize:20, fontWeight:700, color:'white', marginBottom:10 }}>{title}</h2>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', lineHeight:1.6, marginBottom:28 }}>
          {body(team?.name)}
        </p>
        <button className="auth-btn-secondary" onClick={logout}>Esci</button>
      </div>
    </AuthShell>
  )
}
