import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Box } from '../components/Icon'

// Pagina 404 — prima le rotte sconosciute venivano rimandate in silenzio
// alla home (Navigate to="/"), senza nessun riscontro: un link rotto o un
// errore di battitura sembravano funzionare, portando altrove senza
// spiegazione. Meglio dirlo chiaramente e offrire una via d'uscita.
export default function NotFound() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="page" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'70vh', textAlign:'center', padding:'0 24px' }}>
      <div style={{ color:'var(--text3)', marginBottom:16 }}><Box size={48} /></div>
      <h1 style={{ fontSize:22, fontWeight:800, marginBottom:8 }}>{t('notFound.title')}</h1>
      <p style={{ color:'var(--text2)', fontSize:14, marginBottom:24, maxWidth:320 }}>{t('notFound.desc')}</p>
      <button onClick={() => navigate('/')} className="btn btn-primary">{t('notFound.backHome')}</button>
    </div>
  )
}
