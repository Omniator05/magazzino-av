import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { isModuleEnabled } from '../utils/modules'
import { getCodeDisplay } from '../utils/codeDisplay'
import { QrCode, Barcode } from '../components/Icon'
import BackHomeButton from '../components/BackHomeButton'
import SegmentedControl from '../components/SegmentedControl'

// Riga di impostazione: titolo sopra, card bianca sotto con prima una breve
// descrizione di cosa si sta scegliendo e poi il controllo vero e proprio
// (switch, segmented control...) — stessa struttura per ogni impostazione di
// questa pagina, non solo quella che l'ha introdotta per prima (Codici oggetti).
function SettingRow({ title, desc, children }) {
  return (
    <div style={{ marginBottom:16 }}>
      <p style={{ padding:'0 16px 8px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{title}</p>
      <div style={{ margin:'0 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:14 }}>
        <p style={{ color:'var(--text2)', fontSize:12, marginBottom:12, lineHeight:1.5 }}>{desc}</p>
        {children}
      </div>
    </div>
  )
}

function Switch({ enabled, onClick, disabled, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <button
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        style={{
          width:46, height:26, borderRadius:13, flexShrink:0, position:'relative',
          background: enabled ? 'var(--accent)' : 'var(--border)',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{
          position:'absolute', top:3, left: enabled ? 23 : 3,
          width:20, height:20, borderRadius:'50%', background:'#fff',
          boxShadow:'0 1px 3px rgba(0,0,0,0.25)', transition:'left 0.15s ease',
        }} />
      </button>
      <span style={{ fontSize:13, fontWeight:600, color: enabled ? 'var(--text)' : 'var(--text2)' }}>{label}</span>
    </div>
  )
}

// Sotto-pagina "Preferenze" di Impostazioni — comportamenti dell'app
// configurabili per squadra (moduli attivabili, formato dei codici...).
export default function SettingsModules() {
  const { t } = useTranslation()
  const { team, updateTeamData } = useAuth()
  const [saving, setSaving] = useState(null)
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const workHoursEnabled = isModuleEnabled(team, 'workHours')
  const toggleModule = async (key) => {
    const enabled = isModuleEnabled(team, key)
    setSaving(key)
    try {
      await updateTeamData({ modules: { ...(team?.modules || {}), [key]: !enabled } })
      showToast(enabled ? t('adminUsers.moduleDisabledToast') : t('adminUsers.moduleEnabledToast'))
    } finally { setSaving(null) }
  }

  const codeDisplay = getCodeDisplay(team)
  const [savingCode, setSavingCode] = useState(false)
  const setCodeDisplay = async (value) => {
    if (value === codeDisplay) return
    setSavingCode(true)
    try { await updateTeamData({ codeDisplay: value }) } finally { setSavingCode(false) }
  }
  const CODE_OPTIONS = [
    { value:'qr',      label:t('adminUsers.codeDisplayQr'),      icon:<QrCode size={18} /> },
    { value:'barcode', label:t('adminUsers.codeDisplayBarcode'), icon:<Barcode size={18} /> },
    { value:'both',    label:t('adminUsers.codeDisplayBoth'),    icon:null },
  ]

  return (
    <div className="page">
      {toast && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 20px', zIndex:999, fontSize:14, fontWeight:600, color:'var(--text)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}

      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <BackHomeButton to="/admin/settings" />
        <h1 style={{ textAlign:'right' }}>{t('adminUsers.modulesTitle')}</h1>
      </div>
      <p style={{ padding:'0 16px 14px', color:'var(--text2)', fontSize:13, lineHeight:1.5, marginTop:-8 }}>{t('adminUsers.modulesPageDesc')}</p>

      <SettingRow title={t('workHours.moduleTitle')} desc={t('workHours.moduleDesc')}>
        <Switch
          enabled={workHoursEnabled}
          disabled={saving === 'workHours'}
          onClick={() => toggleModule('workHours')}
          label={workHoursEnabled ? t('adminUsers.statusEnabled') : t('adminUsers.statusDisabled')}
        />
      </SettingRow>

      <SettingRow title={t('adminUsers.codeDisplayTitle')} desc={t('adminUsers.codeDisplayDesc')}>
        <SegmentedControl options={CODE_OPTIONS} value={codeDisplay} onChange={setCodeDisplay} disabled={savingCode} />
      </SettingRow>
    </div>
  )
}
