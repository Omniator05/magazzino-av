import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { uploadTeamLogo, deleteTeamLogo, ACCEPT_LOGO_ATTR, ALLOWED_LOGO_TYPES } from '../utils/teamStorage'
import PageHeader from '../components/PageHeader'
import BackupSection from '../components/BackupSection'

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

      <PageHeader title={t('adminUsers.settingsProfileTitle')} backTo="/admin/settings" />

      <div className="sp-shell">
        {/* Identità della squadra: logo grande (si tocca per cambiarlo) e nome modificabile sul posto,
            su uno sfondo caldo rosso-viola per dare un po' di carattere alla pagina. */}
        <div className="sp-hero">
          <label className={`sp-logo${logoUploading ? ' busy' : ''}`} title={team?.logoUrl ? t('adminUsers.changeLogo') : t('adminUsers.uploadLogo')}>
            {team?.logoUrl
              ? <img src={team.logoUrl} alt={team?.name || ''} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
              : <img src="/logo-default.svg" alt="" style={{ width:'60%', height:'60%', objectFit:'contain', opacity:0.45 }} />}
            <input type="file" accept={ACCEPT_LOGO_ATTR} onChange={handleLogoChange} disabled={logoUploading} style={{ display:'none' }} />
          </label>

          <div style={{ flex:1, minWidth:0 }}>
            <p className="sp-eyebrow">{t('adminUsers.teamNameTitle')}</p>
            <input className="sp-name" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder={t('adminUsers.teamNamePlaceholder')}
              onKeyDown={e => { if (e.key === 'Enter' && teamName.trim() !== (team?.name || '')) saveTeamName() }} aria-label={t('adminUsers.teamNameTitle')} />
            {teamNameError && <p style={{ color:'var(--red)', fontSize:12, marginTop:6, fontWeight:600 }}>{teamNameError}</p>}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:12, flexWrap:'wrap' }}>
              <label className="sp-btn sp-btn-primary" style={{ opacity: logoUploading ? 0.6 : 1, cursor: logoUploading ? 'default' : 'pointer' }}>
                {logoUploading ? t('adminUsers.uploadingLogo') : team?.logoUrl ? t('adminUsers.changeLogo') : t('adminUsers.uploadLogo')}
                <input type="file" accept={ACCEPT_LOGO_ATTR} onChange={handleLogoChange} disabled={logoUploading} style={{ display:'none' }} />
              </label>
              {teamName.trim() !== (team?.name || '') && (
                <button onClick={saveTeamName} className="sp-btn sp-btn-ghost" disabled={teamNameSaving}>
                  {teamNameSaving ? t('common.saving') : t('adminUsers.save')}
                </button>
              )}
              {team?.logoUrl && (
                <button onClick={removeLogo} className="btn-no-anim" style={{ background:'transparent', color:'var(--red)', fontSize:12.5, fontWeight:700, padding:'6px 4px' }}>
                  {t('adminUsers.removeLogo')}
                </button>
              )}
            </div>
            <p style={{ color:'var(--text2)', fontSize:12, marginTop:10, lineHeight:1.5 }}>{logoError ? <span style={{ color:'var(--red)', fontWeight:600 }}>{logoError}</span> : t('adminUsers.teamLogoDesc')}</p>
          </div>
        </div>

        {/* Anteprima: come compaiono logo e nome nell'intestazione di PDF ed etichette. */}
        <p className="sp-section">{t('adminUsers.profilePreviewTitle')}</p>
        <div className="sp-card sp-preview">
          <div className="sp-preview-logo">
            {team?.logoUrl
              ? <img src={team.logoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
              : <img src="/logo-default.svg" alt="" style={{ width:'70%', height:'70%', objectFit:'contain', opacity:0.5 }} />}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontSize:15, fontWeight:800, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{team?.name || t('adminUsers.settingsProfileTitle')}</p>
            <p style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>{t('adminUsers.profilePreviewDesc')}</p>
          </div>
          <div aria-hidden="true" className="sp-preview-qr">
            {Array.from({ length: 25 }, (_, i) => <span key={i} style={{ opacity: [0,1,2,4,5,6,10,12,14,18,20,22,24,3,8,16,19].includes(i) ? 1 : 0.15 }} />)}
          </div>
        </div>

        <p className="sp-section">{t('adminUsers.websiteUrlTitle')}</p>
        <div className="sp-card">
          <p style={{ color:'var(--text2)', fontSize:12.5, marginBottom:12, lineHeight:1.5 }}>{t('adminUsers.websiteUrlDesc')}</p>
          {websiteError && <p style={{ color:'var(--red)', fontSize:12, marginBottom:10, fontWeight:600 }}>{websiteError}</p>}
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ position:'relative', flex:1 }}>
              <span aria-hidden="true" style={{ position:'absolute', left:12, top:'50%', marginTop:-8, color:'var(--text2)', display:'flex' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>
              </span>
              <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder={t('adminUsers.websiteUrlPlaceholder')} style={{ width:'100%', fontSize:13.5, paddingLeft:36 }} />
            </div>
            <button onClick={saveWebsiteUrl} className="sp-btn sp-btn-ghost" disabled={websiteSaving || websiteUrl.trim() === (team?.websiteUrl || '')}>
              {websiteSaving ? t('common.saving') : t('adminUsers.save')}
            </button>
          </div>
        </div>

        <BackupSection />
      </div>

      <style>{`
        .sp-shell { padding: 0 16px 40px; }
        .sp-hero {
          margin-top: 18px; display: flex; gap: 22px; align-items: center; flex-wrap: wrap;
          padding: 24px 24px 22px; border-radius: 22px; border: 1px solid rgba(230,57,70,0.22);
          background: linear-gradient(135deg, rgba(230,57,70,0.12) 0%, rgba(124,111,234,0.10) 100%), var(--card);
        }
        .sp-logo {
          position: relative; width: 112px; height: 112px; flex-shrink: 0; border-radius: 28px; overflow: hidden;
          background: #fff; border: 1px solid var(--border); box-shadow: 0 10px 26px rgba(40,30,20,0.12);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          transition: transform .18s ease, box-shadow .18s ease;
        }
        .sp-logo img { border-radius: 27px; }
        .sp-logo.busy { opacity: .6; cursor: default; }
        @media (hover: hover) { .sp-logo:hover { transform: translateY(-2px) rotate(-1deg); box-shadow: 0 16px 34px rgba(40,30,20,0.18); } }
        .sp-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: var(--text2); margin-bottom: 4px; }
        .sp-hero .sp-name {
          width: 100%; background: transparent !important; border: none; border-bottom: 2px solid transparent; border-radius: 0;
          padding: 2px 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: var(--text);
          transition: border-color .15s;
        }
        .sp-hero .sp-name:hover { border-bottom-color: rgba(230,57,70,0.25); }
        .sp-hero .sp-name:focus { outline: none; border-bottom-color: var(--accent); box-shadow: none; }
        .sp-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 18px; border-radius: 12px; font-size: 13px; font-weight: 800; cursor: pointer; border: none; }
        .sp-btn-primary { background: var(--accent); color: #fff; box-shadow: 0 6px 16px rgba(230,57,70,0.28); }
        .sp-btn-ghost { background: var(--card); color: var(--text); border: 1.5px solid var(--border); }
        .sp-btn:disabled { opacity: .5; cursor: default; }
        .sp-section { margin: 26px 2px 10px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--text2); }
        .sp-card { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 18px; }
        .sp-preview { display: flex; align-items: center; gap: 14px; }
        .sp-preview-logo { width: 52px; height: 52px; border-radius: 14px; background: #fff; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
        .sp-preview-qr { display: grid; grid-template-columns: repeat(5, 5px); gap: 1.5px; flex-shrink: 0; }
        .sp-preview-qr span { width: 5px; height: 5px; background: var(--text); border-radius: 1px; }
      `}</style>
    </div>
  )
}
