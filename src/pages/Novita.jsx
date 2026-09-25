import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import BackHomeButton from '../components/BackHomeButton'
import { CHANGELOG } from '../data/changelog'
import { markWhatsNewSeen } from '../utils/whatsNew'
import { formatDate } from '../utils/formatDate'

// "Novità": gli aggiornamenti più importanti dell'app, dalla più recente.
// Il contenuto vive in src/data/changelog.js (una release nuova = una voce
// in cima). Raggiungibile da tutti i ruoli dal profilo.
export default function Novita() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'it'

  useEffect(() => { markWhatsNewSeen() }, [])

  return (
    <div className="page">
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <BackHomeButton to="/" />
        <h1 style={{ textAlign:'right' }}>{t('whatsNew.title')}</h1>
      </div>

      <p style={{ margin:'0 16px 20px', color:'var(--text2)', fontSize:14, lineHeight:1.5 }}>{t('whatsNew.subtitle')}</p>

      {CHANGELOG.map((release, ri) => (
        <section key={release.id} style={{ margin:'0 16px 28px' }}>
          <p style={{ fontSize:12, fontWeight:800, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:4 }}>
            {formatDate(release.date + 'T12:00:00', { day:'numeric', month:'long', year:'numeric' }, i18n.language)}
            {ri === 0 && <span style={{ marginLeft:8, background:'var(--accent)', color:'#fff', borderRadius:6, padding:'2px 7px', fontSize:10.5, letterSpacing:'0.4px' }}>{t('whatsNew.latest')}</span>}
          </p>
          <h2 style={{ fontSize:19, fontWeight:800, letterSpacing:'-0.3px', marginBottom:12 }}>{release.title[lang]}</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {release.items.map(item => (
              <div key={item.title.it} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{
                    flexShrink:0, borderRadius:6, padding:'2px 8px', fontSize:10.5, fontWeight:800, letterSpacing:'0.4px', textTransform:'uppercase',
                    background: item.kind === 'fix' ? 'rgba(212,130,10,0.12)' : 'rgba(230,57,70,0.10)',
                    color: item.kind === 'fix' ? 'var(--accent2)' : 'var(--accent)',
                  }}>{t(item.kind === 'fix' ? 'whatsNew.kindFix' : 'whatsNew.kindNew')}</span>
                  <h3 style={{ fontSize:15, fontWeight:800, minWidth:0 }}>{item.title[lang]}</h3>
                </div>
                <p style={{ fontSize:13.5, lineHeight:1.55, color:'var(--text2)' }}>{item.text[lang]}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
