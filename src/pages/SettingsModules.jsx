import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { isModuleEnabled } from '../utils/modules'
import BackHomeButton from '../components/BackHomeButton'

// Sotto-pagina "Moduli" di Impostazioni — quali funzionalità dell'app vede
// questa squadra. Un solo modulo oggi (liste di carico); la lista è scritta
// per accoglierne altri in futuro senza rework (vedi src/utils/modules.js).
export default function SettingsModules() {
  const { t } = useTranslation()
  const { team, updateTeamData } = useAuth()
  const [saving, setSaving] = useState(null)
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const MODULES = [
    {
      key: 'loadLists',
      title: t('adminUsers.loadListsModuleTitle'),
      desc: t('adminUsers.loadListsModuleDesc'),
    },
  ]

  const toggleModule = async (key) => {
    const enabled = isModuleEnabled(team, key)
    setSaving(key)
    try {
      await updateTeamData({ modules: { ...(team?.modules || {}), [key]: !enabled } })
      showToast(enabled ? t('adminUsers.moduleDisabledToast') : t('adminUsers.moduleEnabledToast'))
    } finally { setSaving(null) }
  }

  return (
    <div className="page">
      {toast && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 20px', zIndex:999, fontSize:14, fontWeight:600, color:'var(--text)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}

      <div className="page-header" style={{ display:'flex', alignItems:'center', gap:12 }}>
        <BackHomeButton to="/admin/settings" />
        <h1>{t('adminUsers.modulesTitle')}</h1>
      </div>
      <p style={{ padding:'0 16px 14px', color:'var(--text2)', fontSize:13, lineHeight:1.5, marginTop:-8 }}>{t('adminUsers.modulesPageDesc')}</p>

      <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
        {MODULES.map((m, i) => {
          const enabled = isModuleEnabled(team, m.key)
          return (
            <div key={m.key} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight:600 }}>{m.title}</p>
                <p style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>{m.desc}</p>
              </div>
              <button
                role="switch"
                aria-checked={enabled}
                aria-label={m.title}
                onClick={() => toggleModule(m.key)}
                disabled={saving === m.key}
                style={{
                  width:46, height:26, borderRadius:13, flexShrink:0, position:'relative',
                  background: enabled ? 'var(--accent)' : 'var(--border)',
                  opacity: saving === m.key ? 0.6 : 1,
                }}
              >
                <span style={{
                  position:'absolute', top:3, left: enabled ? 23 : 3,
                  width:20, height:20, borderRadius:'50%', background:'#fff',
                  boxShadow:'0 1px 3px rgba(0,0,0,0.25)', transition:'left 0.15s ease',
                }} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
