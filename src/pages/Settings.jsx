import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { isModuleEnabled } from '../utils/modules'
import { Image, Sliders, CreditCard, User, Calendar, Mail, Share } from '../components/Icon'
import { trialDaysLeft } from '../utils/billing'

const SUPPORT_EMAIL = 'appmagazzinoav@gmail.com'

// Home di "Impostazioni" — lista raggruppata in stile Impostazioni di iOS:
// ogni riga apre una schermata dedicata (vedi le route /admin/settings/* in
// App.jsx). Qui si mostrano solo riepiloghi leggeri (contatori, stato), la
// logica vera vive nella sotto-pagina di ciascuna sezione.
export default function Settings() {
  const { t } = useTranslation()
  const { team, teamId } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [itemCount, setItemCount] = useState(null)
  const [totalEventCount, setTotalEventCount] = useState(null)
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'profiles'), where('teamId', '==', teamId))
    return onSnapshot(q, snap => setUsers(snap.docs.map(d => d.data())))
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'items'), where('teamId', '==', teamId))
    return onSnapshot(q, snap => setItemCount(snap.size))
  }, [teamId])

  // Numero totale di eventi mai creati con questa squadra — non solo quelli
  // in programma: un numero che cresce nel tempo, più rappresentativo di
  // "quanto usi l'app" per la card in cima a Impostazioni.
  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId))
    return onSnapshot(q, snap => setTotalEventCount(snap.size))
  }, [teamId])

  const shareApp = async () => {
    const shareData = { title: 'Roadcase', text: t('adminUsers.shareAppText'), url: window.location.origin }
    if (navigator.share) {
      try { await navigator.share(shareData) } catch (e) {} // annullato dall'utente — nessun errore da mostrare
      return
    }
    try {
      await navigator.clipboard.writeText(shareData.url)
      showToast(t('adminUsers.linkCopiedToast'))
    } catch (e) {}
  }

  const pendingCount = users.filter(u => u.approved === false).length
  const loadListsEnabled = isModuleEnabled(team, 'loadLists')

  const billingSubtitle = team?.billingStatus === 'trialing'
    ? t('adminUsers.billingRowTrialing', { count: Math.max(trialDaysLeft(team) ?? 0, 0) })
    : team?.billingStatus === 'exempt' ? t('adminUsers.billingRowExempt')
    : team?.billingStatus === 'active' ? t('adminUsers.billingRowActive')
    : team?.billingStatus === 'past_due' ? t('adminUsers.billingRowPastDue')
    : t('adminUsers.billingRowCanceled')

  const rows = [
    {
      key: 'profile', to: '/admin/settings/profile', icon: Image,
      color: 'var(--blue)', bg: 'rgba(79,195,247,0.15)',
      title: t('adminUsers.settingsProfileTitle'), subtitle: team?.name || t('adminUsers.settingsProfileDesc'),
    },
    {
      key: 'users', to: '/admin/settings/users', icon: User,
      color: '#9b59e0', bg: 'rgba(155,89,224,0.15)',
      title: t('adminUsers.title'), subtitle: t('adminUsers.totalAccounts', { count: users.length }),
      badge: pendingCount > 0 ? pendingCount : null,
    },
    {
      key: 'modules', to: '/admin/settings/modules', icon: Sliders,
      color: 'var(--accent)', bg: 'rgba(230,57,70,0.12)',
      title: t('adminUsers.modulesTitle'), subtitle: loadListsEnabled ? t('adminUsers.modulesRowAllOn') : t('adminUsers.modulesRowSomeOff'),
    },
    ...(team?.googleCalendarFeatureEnabled ? [{
      key: 'integrations', to: '/admin/settings/integrations', icon: Calendar,
      color: '#16a085', bg: 'rgba(22,160,133,0.15)',
      title: t('adminUsers.integrationsTitle'), subtitle: team?.googleCalendarId ? t('adminUsers.googleCalendarConnected') : t('adminUsers.integrationsRowNotConnected'),
    }] : []),
    {
      key: 'billing', to: '/admin/settings/billing', icon: CreditCard,
      color: 'var(--green)', bg: 'rgba(105,240,174,0.18)',
      title: t('adminUsers.billingTitle'), subtitle: billingSubtitle,
    },
  ]

  return (
    <div className="page">
      {toast && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 20px', zIndex:999, fontSize:14, fontWeight:600, color:'var(--text)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}

      <div className="page-header">
        <h1>{t('adminUsers.settingsHomeTitle')}</h1>
      </div>

      {/* Card squadra — stessa veste (var(--card)/var(--border)) delle righe
          sotto: prima era tinta di accento e sembrava un elemento a sé,
          scollegato dal resto della pagina. Si distingue per dimensione e
          contenuto (logo grande, statistiche), non per un colore diverso.
          Non cliccabile: per modificare logo/nome si passa dalla riga
          "Profilo squadra" nella lista sotto. */}
      <div style={{ margin:'0 16px 20px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
        <div style={{ padding:'20px 20px 18px', display:'flex', alignItems:'center', gap:16 }}>
          <div style={{
            width:72, height:72, borderRadius:18, flexShrink:0, overflow:'hidden',
            background:'var(--bg3)', border:'1px solid var(--border)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            {team?.logoUrl
              ? <img src={team.logoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
              : <img src="/logo-default.svg" alt="" style={{ width:'65%', height:'65%', objectFit:'contain', opacity:0.5 }} />
            }
          </div>
          <p style={{ flex:1, minWidth:0, fontWeight:800, fontSize:22, lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{team?.name || t('adminUsers.settingsProfileTitle')}</p>
        </div>
        <div style={{ display:'flex', borderTop:'1px solid var(--border)' }}>
          {[
            { value: users.length, label: t('adminUsers.statUsers') },
            { value: itemCount, label: t('adminUsers.statItems') },
            { value: totalEventCount, label: t('adminUsers.statTotalEvents') },
          ].map((stat, i) => (
            <div key={stat.label} style={{ flex:1, textAlign:'center', padding:'14px 8px', borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <p style={{ fontSize:22, fontWeight:800, color:'var(--accent)', lineHeight:1, fontVariantNumeric:'tabular-nums' }}>{stat.value ?? '–'}</p>
              <p style={{ fontSize:11.5, color:'var(--text2)', marginTop:5, fontWeight:600 }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
        {rows.map((row, i) => {
          const RowIcon = row.icon
          return (
            <button
              key={row.key}
              onClick={() => navigate(row.to)}
              className="btn-no-anim"
              style={{
                width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none', textAlign:'left', background:'transparent',
              }}
            >
              <div style={{ width:34, height:34, borderRadius:9, flexShrink:0, background:row.bg, color:row.color, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <RowIcon size={17} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14.5, fontWeight:600 }}>{row.title}</p>
                <p style={{ color:'var(--text2)', fontSize:12, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.subtitle}</p>
              </div>
              {row.badge && (
                <span style={{ background:'var(--accent)', color:'#fff', borderRadius:9, minWidth:18, height:18, padding:'0 5px', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {row.badge}
                </span>
              )}
              <span style={{ color:'var(--text2)', fontSize:18, flexShrink:0 }}>›</span>
            </button>
          )
        })}
      </div>

      {/* Assistenza — azioni dirette (contatta/condividi), non navigazione:
          niente chevron, gruppo separato da quello sopra come fa Apple con
          "Contatta il supporto"/"Condividi" in fondo alle sue Impostazioni. */}
      <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 16px', textDecoration:'none', color:'inherit' }}
        >
          <div style={{ width:34, height:34, borderRadius:9, flexShrink:0, background:'rgba(79,195,247,0.15)', color:'var(--blue)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Mail size={17} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontSize:14.5, fontWeight:600 }}>{t('adminUsers.contactUs')}</p>
            <p style={{ color:'var(--text2)', fontSize:12, marginTop:1 }}>{SUPPORT_EMAIL}</p>
          </div>
        </a>
        <button
          onClick={shareApp}
          className="btn-no-anim"
          style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px', borderTop:'1px solid var(--border)', textAlign:'left', background:'transparent' }}
        >
          <div style={{ width:34, height:34, borderRadius:9, flexShrink:0, background:'rgba(230,57,70,0.12)', color:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Share size={17} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontSize:14.5, fontWeight:600 }}>{t('adminUsers.shareApp')}</p>
            <p style={{ color:'var(--text2)', fontSize:12, marginTop:1 }}>{t('adminUsers.shareAppDesc')}</p>
          </div>
        </button>
      </div>
    </div>
  )
}
