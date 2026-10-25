import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import { exportTeamBackup, downloadBackup, lastBackupAt } from '../utils/teamBackup'
import { formatDate } from '../utils/formatDate'

// Sotto-pagina "Backup dei dati" di Impostazioni: scarica un file con tutti i dati della squadra.
export default function SettingsBackup() {
  const { t, i18n } = useTranslation()
  const { team, teamId } = useAuth()
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState({})
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [last, setLast] = useState(() => lastBackupAt(teamId))

  const start = async () => {
    setRunning(true); setError(''); setResult(null); setSteps({})
    try {
      const backup = await exportTeamBackup(teamId, p => setSteps(s => ({ ...s, [p.name]: p })))
      downloadBackup(backup)
      setResult(backup.meta)
      setLast(new Date(backup.meta.createdAt))
    } catch (e) {
      console.error('[backup]', e)
      setError(t('backup.error'))
    } finally { setRunning(false) }
  }

  const total = result ? Object.values(result.counts).reduce((a, b) => a + b, 0) : 0
  const stale = !last || (Date.now() - last.getTime()) > 30 * 86400000

  return (
    <div className="page">
      <PageHeader title={t('backup.title')} backTo="/admin/settings" />
      <div style={{ padding:'0 16px 40px' }}>
        <p style={{ color:'var(--text2)', fontSize:13.5, lineHeight:1.5, margin:'16px 2px 0' }}>{t('backup.intro', { team: team?.name || '' })}</p>

        <div style={{ marginTop:18, background:'var(--card)', border:'1px solid var(--border)', borderRadius:18, padding:18 }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
            <div style={{ flex:'1 1 240px', minWidth:0 }}>
              <p style={{ fontSize:15, fontWeight:800 }}>{t('backup.lastLabel')}</p>
              <p style={{ fontSize:13, marginTop:3, fontWeight:700, color: stale ? '#d97706' : 'var(--text2)' }}>
                {last ? formatDate(last, { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }, i18n.language) : t('backup.never')}
                {last && stale ? ` · ${t('backup.staleHint')}` : ''}
              </p>
            </div>
            <button onClick={start} disabled={running} className="btn-no-anim"
              style={{ minHeight:46, padding:'0 22px', borderRadius:13, background:'var(--accent)', color:'#fff', fontWeight:800, fontSize:14.5, boxShadow:'0 6px 18px rgba(230,57,70,0.28)', opacity: running ? 0.6 : 1 }}>
              {running ? t('backup.running') : t('backup.download')}
            </button>
          </div>

          {(running || result) && (
            <div style={{ marginTop:16, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(190px, 1fr))', gap:8 }}>
              {Object.values(steps).map(s => (
                <div key={s.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'8px 12px', borderRadius:10, background:'var(--bg3, var(--c-fill))', fontSize:12.5 }}>
                  <span style={{ fontWeight:700 }}>{t(`backup.names.${s.name}`, { defaultValue: s.name })}</span>
                  <span style={{ color: s.skipped ? '#d97706' : s.done ? '#2f9e5b' : 'var(--text2)', fontWeight:800, fontVariantNumeric:'tabular-nums' }}>
                    {s.skipped ? t('backup.skipped') : s.done ? s.count : '…'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {result && (
            <p role="status" style={{ marginTop:14, fontSize:13.5, fontWeight:700, color:'#2f9e5b' }}>
              {t('backup.done', { count: total })}{result.skipped.length > 0 ? ` · ${t('backup.skippedNote', { count: result.skipped.length })}` : ''}
            </p>
          )}
          {error && <p role="alert" style={{ marginTop:14, fontSize:13, fontWeight:700, color:'var(--red)' }}>{error}</p>}
        </div>

        <h2 style={{ margin:'26px 2px 10px', fontSize:15, fontWeight:800 }}>{t('backup.sectionTitle')}</h2>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:18, padding:'6px 18px' }}>
          {['included', 'notIncluded', 'keepSafe'].map((k, i) => (
            <div key={k} style={{ padding:'12px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <p style={{ fontSize:13.5, fontWeight:800 }}>{t(`backup.${k}Title`)}</p>
              <p style={{ fontSize:12.5, color:'var(--text2)', lineHeight:1.5, marginTop:3 }}>{t(`backup.${k}Text`)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
