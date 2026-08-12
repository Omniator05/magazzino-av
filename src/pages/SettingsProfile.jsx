import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { uploadTeamLogo, deleteTeamLogo, ACCEPT_LOGO_ATTR, ALLOWED_LOGO_TYPES } from '../utils/teamStorage'
import BackHomeButton from '../components/BackHomeButton'

// Sotto-pagina "Profilo squadra" di Impostazioni — logo (sostituisce quello
// di default nell'app e nei PDF) e URL del sito (dove finisce chi scansiona
// un QR di magazzino SENZA l'app, vedi src/utils/generateCode.js + QrRedirect.jsx).
export default function SettingsProfile() {
  const { t } = useTranslation()
  const { team, updateTeamData } = useAuth()
  const confirm = useConfirm()
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [websiteSaving, setWebsiteSaving] = useState(false)
  const [websiteError, setWebsiteError] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamNameSaving, setTeamNameSaving] = useState(false)
  const [teamNameError, setTeamNameError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => { setWebsiteUrl(team?.websiteUrl || '') }, [team?.websiteUrl])
  useEffect(() => { setTeamName(team?.name || '') }, [team?.name])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !team?.id) return
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) { setLogoError(t('adminUsers.errorLogoType')); return }
    if (file.size > 3 * 1024 * 1024) { setLogoError(t('adminUsers.errorLogoSize')); return }
    setLogoError(''); setLogoUploading(true)
    try {
      const oldPath = team.logoPath
      const { url, path } = await uploadTeamLogo(file, team.id)
      await updateTeamData({ logoUrl: url, logoPath: path })
      if (oldPath) await deleteTeamLogo(oldPath)
      showToast(t('adminUsers.logoUpdatedToast'))
    } catch (e) {
      setLogoError(t('adminUsers.errorLogoUpload'))
    } finally { setLogoUploading(false) }
  }

  const removeLogo = async () => {
    if (!(await confirm({ title: t('adminUsers.confirmRemoveLogoTitle'), message: t('adminUsers.confirmRemoveLogoMessage'), confirmLabel: t('adminUsers.confirmRemoveLogoLabel'), danger: true }))) return
    const oldPath = team?.logoPath
    await updateTeamData({ logoUrl: null, logoPath: null })
    if (oldPath) await deleteTeamLogo(oldPath)
    showToast(t('adminUsers.logoRemovedToast'))
  }

  const saveTeamName = async () => {
    const cleaned = teamName.trim()
    if (!cleaned) { setTeamNameError(t('adminUsers.errorTeamNameEmpty')); return }
    setTeamNameError('')
    setTeamNameSaving(true)
    try {
      await updateTeamData({ name: cleaned })
      setTeamName(cleaned)
      showToast(t('adminUsers.teamNameSavedToast'))
    } finally { setTeamNameSaving(false) }
  }

  const saveWebsiteUrl = async () => {
    let raw = websiteUrl.trim()
    // Chi scrive "esempio.it" senza protocollo non deve ricevere un errore:
    // lo normalizziamo noi invece di pretendere l'https:// esplicito.
    if (raw && !/^https?:\/\//i.test(raw)) raw = `https://${raw}`
    if (raw) {
      try { new URL(raw) } catch { setWebsiteError(t('adminUsers.errorWebsiteUrlInvalid')); return }
    }
    setWebsiteError('')
    setWebsiteSaving(true)
    try {
      await updateTeamData({ websiteUrl: raw || null })
      setWebsiteUrl(raw)
      showToast(t('adminUsers.websiteUrlSavedToast'))
    } finally { setWebsiteSaving(false) }
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
        <h1>{t('adminUsers.settingsProfileTitle')}</h1>
      </div>

      <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
        <div style={{
          width:56, height:56, borderRadius:14, flexShrink:0, overflow:'hidden',
          background:'var(--bg3)', border:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          {team?.logoUrl
            ? <img src={team.logoUrl} alt={team?.name || ''} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
            : <img src="/logo-default.svg" alt="" style={{ width:'70%', height:'70%', objectFit:'contain', opacity:0.5 }} />
          }
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, fontSize:14 }}>{t('adminUsers.teamLogoTitle')}</p>
          <p style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>{t('adminUsers.teamLogoDesc')}</p>
          {logoError && <p style={{ color:'var(--red)', fontSize:12, marginTop:4, fontWeight:600 }}>{logoError}</p>}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
          <label className="btn btn-secondary" style={{ padding:'8px 14px', fontSize:12, textAlign:'center', cursor: logoUploading ? 'default' : 'pointer', opacity: logoUploading ? 0.6 : 1 }}>
            {logoUploading ? t('adminUsers.uploadingLogo') : team?.logoUrl ? t('adminUsers.changeLogo') : t('adminUsers.uploadLogo')}
            <input type="file" accept={ACCEPT_LOGO_ATTR} onChange={handleLogoChange} disabled={logoUploading} style={{ display:'none' }} />
          </label>
          {team?.logoUrl && (
            <button onClick={removeLogo} style={{ background:'transparent', color:'var(--red)', fontSize:12, fontWeight:700, padding:'4px' }}>
              {t('adminUsers.removeLogo')}
            </button>
          )}
        </div>
      </div>

      <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
        <p style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{t('adminUsers.teamNameTitle')}</p>
        <p style={{ color:'var(--text2)', fontSize:12, marginBottom:12, lineHeight:1.5 }}>{t('adminUsers.teamNameDesc')}</p>
        {teamNameError && <p style={{ color:'var(--red)', fontSize:12, marginBottom:10, fontWeight:600 }}>{teamNameError}</p>}
        <div style={{ display:'flex', gap:8 }}>
          <input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder={t('adminUsers.teamNamePlaceholder')} style={{ flex:1, fontSize:13 }} />
          <button onClick={saveTeamName} className="btn btn-secondary" disabled={teamNameSaving || teamName.trim() === (team?.name || '')} style={{ flexShrink:0, padding:'0 16px' }}>
            {teamNameSaving ? t('common.saving') : t('adminUsers.save')}
          </button>
        </div>
      </div>

      <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
        <p style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{t('adminUsers.websiteUrlTitle')}</p>
        <p style={{ color:'var(--text2)', fontSize:12, marginBottom:12, lineHeight:1.5 }}>{t('adminUsers.websiteUrlDesc')}</p>
        {websiteError && <p style={{ color:'var(--red)', fontSize:12, marginBottom:10, fontWeight:600 }}>{websiteError}</p>}
        <div style={{ display:'flex', gap:8 }}>
          <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder={t('adminUsers.websiteUrlPlaceholder')} style={{ flex:1, fontSize:13 }} />
          <button onClick={saveWebsiteUrl} className="btn btn-secondary" disabled={websiteSaving || websiteUrl.trim() === (team?.websiteUrl || '')} style={{ flexShrink:0, padding:'0 16px' }}>
            {websiteSaving ? t('common.saving') : t('adminUsers.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
