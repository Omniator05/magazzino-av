import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { startGoogleCalendarConnect, disconnectGoogleCalendar, syncGoogleCalendarNow } from '../utils/googleCalendar'
import { Check } from '../components/Icon'
import BackHomeButton from '../components/BackHomeButton'

// Sotto-pagina "Integrazioni" di Impostazioni — oggi solo Google Calendar.
// Sync vera lato server (vedi api/google-oauth.js, .../callback.js,
// push-event-to-google.js, sync-google-pull.js — un cron): l'admin dà il
// consenso una volta, un refresh token per la squadra resta salvato (cifrato)
// lato server, nessun bisogno di ricollegarsi ogni volta che scade una
// sessione browser. Visibile solo per le squadre con
// team.googleCalendarFeatureEnabled (l'app Google OAuth resta in modalità
// "Testing", quindi mostrarla a tutti darebbe un bottone rotto con un 403 a
// chi non è stato aggiunto come tester a mano dal developer).
export default function SettingsIntegrations() {
  const { t } = useTranslation()
  const { team, updateTeamData } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [gLoading, setGLoading] = useState(false)
  const [gError, setGError] = useState('')
  const [gCalId, setGCalId] = useState('')
  const [gCalSaving, setGCalSaving] = useState(false)
  const [gSyncing, setGSyncing] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  useEffect(() => { setGCalId(team?.googleCalendarId || '') }, [team?.googleCalendarId])

  // Al ritorno dal redirect di Google (vedi api/google-oauth-callback.js):
  // ?google=connected|error|no_refresh_token nella query string. Ripulita
  // subito dall'URL, non deve restare lì a un refresh della pagina.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const result = params.get('google')
    if (!result) return
    if (result === 'connected') showToast(t('adminUsers.googleCalendarConnectedToast'))
    else if (result === 'no_refresh_token') setGError(t('adminUsers.errorGoogleCalendarNoRefreshToken'))
    else setGError(t('adminUsers.errorGoogleCalendarConnect'))
    navigate(location.pathname, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connectGoogle = async () => {
    setGLoading(true); setGError('')
    try {
      await startGoogleCalendarConnect() // reindirizza l'intera pagina: se va a buon fine non si torna qui
    } catch {
      setGError(t('adminUsers.errorGoogleCalendarConnect'))
      setGLoading(false)
    }
  }

  const disconnectGoogle = async () => {
    setGLoading(true); setGError('')
    try {
      await disconnectGoogleCalendar()
      showToast(t('adminUsers.googleCalendarDisconnectedToast'))
    } catch {
      setGError(t('adminUsers.errorGoogleCalendarConnect'))
    } finally { setGLoading(false) }
  }

  // Il cron automatico (sync-google-pull.js) su Vercel Hobby gira al massimo
  // una volta al giorno — questo bottone colma l'attesa quando serve vedere
  // subito su Roadcase una modifica appena fatta su Google.
  const syncNow = async () => {
    setGSyncing(true); setGError('')
    try {
      const result = await syncGoogleCalendarNow()
      if (result.skipped) showToast(t('adminUsers.googleCalendarSyncNowNothing'))
      else showToast(t('adminUsers.googleCalendarSyncNowDone', { created: result.created || 0, updated: result.updated || 0, deleted: result.deleted || 0 }))
    } catch {
      setGError(t('adminUsers.googleCalendarSyncNowFailed'))
    } finally { setGSyncing(false) }
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
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4, color:'#15803d', fontSize:13, fontWeight:700 }}>
              <Check size={16} /> {t('adminUsers.googleCalendarConnected')}
            </div>
            {team.googleCalendarConnectedEmail && (
              <p style={{ color:'var(--text2)', fontSize:12, marginBottom:12 }}>{team.googleCalendarConnectedEmail}</p>
            )}
            <div className="form-group" style={{ marginBottom:10 }}>
              <label>{t('adminUsers.googleCalendarIdLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('adminUsers.googleCalendarIdHint')}</span></label>
              <div style={{ display:'flex', gap:8 }}>
                <input value={gCalId} onChange={e => setGCalId(e.target.value)} placeholder="primary" style={{ flex:1, fontFamily:'monospace', fontSize:13 }} />
                <button onClick={saveCalendarId} className="btn btn-secondary" disabled={gCalSaving || gCalId.trim() === (team.googleCalendarId || '')} style={{ flexShrink:0, padding:'0 16px' }}>
                  {gCalSaving ? t('common.saving') : t('adminUsers.save')}
                </button>
              </div>
            </div>
            <button onClick={syncNow} disabled={gSyncing} className="btn btn-secondary btn-full" style={{ marginBottom:8 }}>
              {gSyncing ? t('common.saving') : t('adminUsers.googleCalendarSyncNow')}
            </button>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={connectGoogle} className="btn btn-secondary" style={{ flex:1 }} disabled={gLoading}>
                {gLoading ? t('common.saving') : t('adminUsers.googleCalendarReconnect')}
              </button>
              <button onClick={disconnectGoogle} disabled={gLoading} style={{ flex:1, background:'transparent', border:'1px solid var(--border)', borderRadius:'var(--radius-sm, 10px)', color:'var(--red)', fontWeight:700, fontSize:13, opacity: gLoading ? 0.6 : 1 }}>
                {gLoading ? t('common.saving') : t('adminUsers.googleCalendarDisconnect')}
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
