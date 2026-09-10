import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { isModuleEnabled } from '../utils/modules'
import { Image, Sliders, CreditCard, User, Calendar, Mail, Share, Clock, Truck } from '../components/Icon'
import { trialDaysLeft } from '../utils/billing'
import Toast from '../components/Toast'

const SUPPORT_EMAIL = 'appmagazzinoav@gmail.com'

const sectionLabelStyle = { padding:'0 16px 8px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }

// Card di righe cliccabili (icona/titolo/sottotitolo/freccia) — stessa
// markup riusata per il gruppo "Strumenti" e per quello "Impostazioni",
// invece di duplicarla: la differenza tra i due sta solo in quali righe
// contengono e nella label sopra, non nello stile della riga in sé.
function SettingsRowsCard({ rows, navigate }) {
  return (
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
  )
}

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
  const workHoursEnabled = isModuleEnabled(team, 'workHours')
  const allModulesOn = workHoursEnabled

  const billingSubtitle = team?.billingStatus === 'trialing'
    ? t('adminUsers.billingRowTrialing', { count: Math.max(trialDaysLeft(team) ?? 0, 0) })
    : team?.billingStatus === 'exempt' ? t('adminUsers.billingRowExempt')
    : team?.billingStatus === 'active' ? t('adminUsers.billingRowActive')
    : team?.billingStatus === 'past_due' ? t('adminUsers.billingRowPastDue')
    : t('adminUsers.billingRowCanceled')

  // Strumenti pratici — cose che si toccano spesso ma non sono davvero
  // "impostazioni" (non c'è nulla da configurare, solo dati da gestire):
  // i Furgoni sono stati spostati qui dalla Dashboard perché si usano poco;
  // il resoconto Ore ci sta per lo stesso motivo di natura (un report, non
  // un interruttore). Gruppo separato da quello sotto, con la sua label.
  const toolRows = [
    {
      key: 'vehicles', to: '/vehicles', icon: Truck,
      color: 'var(--accent2)', bg: 'rgba(245,166,35,0.15)',
      title: t('vehicles.title'), subtitle: t('adminUsers.vehiclesRowDesc'),
    },
    ...(workHoursEnabled ? [{
      key: 'workHours', to: '/admin/settings/work-hours', icon: Clock,
      color: 'var(--blue)', bg: 'rgba(79,195,247,0.15)',
      title: t('workHours.reportTitle'), subtitle: t('workHours.settingsRowDesc'),
    }] : []),
  ]

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
      title: t('adminUsers.modulesTitle'), subtitle: allModulesOn ? t('adminUsers.modulesRowAllOn') : t('adminUsers.modulesRowSomeOff'),
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
      <Toast message={toast} />

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

      {/* Strumenti pratici — Furgoni + resoconto Ore: dati da gestire, non
          interruttori. Gruppo separato da "Impostazioni" sotto, con la sua
          label, così le due nature restano distinguibili a colpo d'occhio. */}
      <p style={sectionLabelStyle}>{t('adminUsers.toolsSectionLabel')}</p>
      <SettingsRowsCard rows={toolRows} navigate={navigate} />

      <p style={{ ...sectionLabelStyle, marginTop:8 }}>{t('adminUsers.generalSectionLabel')}</p>
      <SettingsRowsCard rows={rows} navigate={navigate} />

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

      {/* Link legali — testo semplice in fondo, non una riga cliccabile con
          chevron come le altre: stessa convenzione delle Impostazioni Apple
          per Privacy/Termini in coda alla pagina. */}
      <p style={{ textAlign:'center', color:'var(--text3)', fontSize:12, margin:'4px 16px 0' }}>
        <Link to="/privacy" style={{ color:'inherit' }}>{t('adminUsers.privacyLink')}</Link>
        {' · '}
        <Link to="/terms" style={{ color:'inherit' }}>{t('adminUsers.termsLink')}</Link>
        {' · '}
        <Link to="/cookie-policy" style={{ color:'inherit' }}>{t('adminUsers.cookieLink')}</Link>
      </p>
    </div>
  )
}
