import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { connectGoogleCalendar, disconnectGoogleCalendar } from '../utils/googleCalendar'
import { Check } from '../components/Icon'
import BackHomeButton from '../components/BackHomeButton'

// Sotto-pagina "Integrazioni" di Impostazioni — oggi solo Google Calendar.
// Sync client-only: il token vive solo in questa sessione browser, non su
// Firestore — va riottenuto (di solito senza popup se sei già collegato con
// Google) ogni volta che si riapre l'app. Visibile solo per le squadre con
// team.googleCalendarFeatureEnabled (l'app Google OAuth resta in modalità
// "Testing", quindi mostrarla a tutti darebbe un bottone rotto con un 403 a
// chi non è stato aggiunto come tester a mano dal developer).
export default function SettingsIntegrations() {
  const { t } = useTranslation()
  const { team, updateTeamData } = useAuth()
  const [gLoading, setGLoading] = useState(false)
  const [gError, setGError] = useState('')
  const [gCalId, setGCalId] = useState('')
  const [gCalSaving, setGCalSaving] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  useEffect(() => { setGCalId(team?.googleCalendarId || '') }, [team?.googleCalendarId])

  const connectGoogle = async () => {
    setGLoading(true); setGError('')
    try {
      await connectGoogleCalendar()
      // Non sovrascrive un calendario già scelto in precedenza (es. al "Riconnetti")
      if (!team?.googleCalendarId) await updateTeamData({ googleCalendarId: 'primary' })
      showToast(t('adminUsers.googleCalendarConnectedToast'))
    } catch {
      setGError(t('adminUsers.errorGoogleCalendarConnect'))
    } finally { setGLoading(false) }
  }

  const disconnectGoogle = async () => {
    disconnectGoogleCalendar()
    await updateTeamData({ googleCalendarId: null })
    showToast(t('adminUsers.googleCalendarDisconnectedToast'))
  }

  const saveCalendarId = async () => {
    const id = gCalId.trim() || 'primary'
    setGCalSaving(true)
    try {
      await updateTeamData({ googleCalendarId: id })
      showToast(t('adminUsers.googleCalendarIdSavedToast'))
    } finally { setGCalSaving(false) }
  }

  return (
    <div className="page">
      {toast && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 20px', zIndex:999, fontSize:14, fontWeight:600, color:'var(--text)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}

      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <BackHomeButton to="/admin/settings" />
        <h1 style={{ textAlign:'right' }}>{t('adminUsers.integrationsTitle')}</h1>
      </div>

      <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
        <p style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{t('adminUsers.googleCalendarTitle')}</p>
        <p style={{ color:'var(--text2)', fontSize:12, marginBottom:12, lineHeight:1.5 }}>{t('adminUsers.googleCalendarDesc')}</p>
        {gError && <p style={{ color:'var(--red)', fontSize:12, marginBottom:10, fontWeight:600 }}>{gError}</p>}
        {team?.googleCalendarId ? (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12, color:'#15803d', fontSize:13, fontWeight:700 }}>
              <Check size={16} /> {t('adminUsers.googleCalendarConnected')}
            </div>
            <div className="form-group" style={{ marginBottom:10 }}>
              <label>{t('adminUsers.googleCalendarIdLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('adminUsers.googleCalendarIdHint')}</span></label>
              <div style={{ display:'flex', gap:8 }}>
                <input value={gCalId} onChange={e => setGCalId(e.target.value)} placeholder="primary" style={{ flex:1, fontFamily:'monospace', fontSize:13 }} />
                <button onClick={saveCalendarId} className="btn btn-secondary" disabled={gCalSaving || gCalId.trim() === (team.googleCalendarId || '')} style={{ flexShrink:0, padding:'0 16px' }}>
                  {gCalSaving ? t('common.saving') : t('adminUsers.save')}
                </button>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={connectGoogle} className="btn btn-secondary" style={{ flex:1 }} disabled={gLoading}>
                {gLoading ? t('common.saving') : t('adminUsers.googleCalendarReconnect')}
              </button>
              <button onClick={disconnectGoogle} style={{ flex:1, background:'transparent', border:'1px solid var(--border)', borderRadius:'var(--radius-sm, 10px)', color:'var(--red)', fontWeight:700, fontSize:13 }}>
                {t('adminUsers.googleCalendarDisconnect')}
              </button>
            </div>
          </>
        ) : (
          <button onClick={connectGoogle} className="btn btn-primary btn-full" disabled={gLoading}>
            {gLoading ? t('common.saving') : t('adminUsers.googleCalendarConnectButton')}
          </button>
        )}
      </div>
    </div>
  )
}
