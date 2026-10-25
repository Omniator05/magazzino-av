import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { getStationLink, createStationLink, revokeStationLink, stationUrl } from '../utils/stationLink'
import { generateQRDataURL } from '../utils/generateCode'

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Collegamento del PC di magazzino con un link/QR (vedi api/_station.js): l'admin lo crea qui, stampa il
// foglio e lo tiene vicino al computer. Il link si può rivedere e ristampare; crearne uno nuovo (o
// disattivarlo) scollega il PC attuale. Aperto dalla riga "Postazione magazzino" in Utenti.
export default function StationLinkModal({ onClose }) {
  const { t } = useTranslation()
  const { team } = useAuth()
  const confirm = useConfirm()
  const [token, setToken] = useState(null)
  const [qr, setQr] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const url = token ? stationUrl(token) : ''

  const fail = e => setError(e?.status === 404 ? t('guest.serverMissing') : e?.code === 'paid-only' ? t('station.paidOnly') : t('station.linkError'))

  useEffect(() => {
    let live = true
    getStationLink().then(tk => { if (live) setToken(tk) }).catch(e => { if (live) fail(e) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let live = true
    if (!url) { setQr(''); return }
    generateQRDataURL(url, 520).then(d => { if (live) setQr(d) }).catch(() => {})
    return () => { live = false }
  }, [url])

  const create = async () => {
    if (token) {
      const ok = await confirm({ title: t('station.linkNewTitle'), message: t('station.linkNewMessage'), confirmLabel: t('station.linkNewConfirm'), danger: true })
      if (!ok) return
    }
    setBusy(true); setError(''); setCopied(false)
    try { setToken(await createStationLink()) } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const revoke = async () => {
    const ok = await confirm({ title: t('station.linkRevokeTitle'), message: t('station.linkRevokeMessage'), confirmLabel: t('station.linkRevokeConfirm'), danger: true })
    if (!ok) return
    setBusy(true); setError('')
    try { await revokeStationLink(); setToken(null) } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true) } catch { setCopied(false) }
  }

  // Foglio da stampare, in una finestra a parte (il QR grande, i passaggi e il nome della squadra).
  const print = () => {
    const w = window.open('', '_blank')
    if (!w) { setError(t('station.printBlocked')); return }
    const steps = [t('station.sheetStep1'), t('station.sheetStep2'), t('station.sheetStep3')]
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('station.title'))}</title><style>
      @page { margin: 18mm }
      body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1a1a18; text-align: center; margin: 0 }
      .team { font-size: 15px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6b6a64; margin-top: 8mm }
      h1 { font-size: 40px; margin: 6px 0 4mm; letter-spacing: -.5px }
      img { width: 100mm; height: 100mm; margin: 4mm 0; border: 1px solid #ddd; border-radius: 4mm }
      ol { display: inline-block; text-align: left; font-size: 17px; line-height: 1.6; margin: 4mm 0; padding-left: 1.2em }
      .url { font-family: monospace; font-size: 11px; color: #6b6a64; word-break: break-all; margin: 4mm 12mm 0 }
      .warn { font-size: 12.5px; color: #6b6a64; margin: 8mm 14mm 0 }
    </style></head><body>
      <div class="team">${esc(team?.name || '')}</div>
      <h1>${esc(t('station.title'))}</h1>
      <img src="${qr}" alt="QR">
      <div><ol>${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>
      <div class="url">${esc(url)}</div>
      <div class="warn">${esc(t('station.sheetWarn'))}</div>
    </body></html>`)
    w.document.close()
    w.focus()
    const go = () => setTimeout(() => { w.print() }, 250)
    if (w.document.readyState === 'complete') go(); else w.onload = go
  }

  const btn = { minHeight: 44, borderRadius: 12, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px' }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={t('station.title')}
        style={{ position: 'relative', width: '100%', maxWidth: 400, maxHeight: '90dvh', overflowY: 'auto', background: 'var(--c-surface)', borderRadius: 18, padding: '22px 20px 20px', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="btn-no-anim"
          style={{ position: 'absolute', top: 6, right: 6, width: 44, height: 44, background: 'transparent', color: 'var(--c-ink3)', fontSize: 16 }}>✕</button>
        <h2 style={{ margin: '0 40px 6px 0', fontSize: 18, color: 'var(--c-ink)' }}>{t('station.title')}</h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: 'var(--c-ink2)' }}>{t('station.linkIntro')}</p>

        {loading ? (
          <p style={{ margin: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--c-ink3)' }}>{t('station.connectLoading')}</p>
        ) : token ? (
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            {qr && <img src={qr} alt={t('station.linkQrAlt')} width={200} height={200} style={{ width: 200, height: 200, borderRadius: 12, border: '1px solid var(--c-line)', background: '#fff' }} />}
            <input readOnly value={url} onFocus={e => e.target.select()} aria-label={t('station.linkLabel')} style={{ marginTop: 12, fontSize: 12, fontFamily: 'monospace' }} />
            <p style={{ margin: '8px 0 12px', fontSize: 12, color: 'var(--c-ink3)', lineHeight: 1.45 }}>{t('station.linkKeep')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={print} disabled={!qr} style={btn}>{t('station.print')}</button>
              <button type="button" className="btn-no-anim" onClick={copy} style={{ ...btn, background: 'var(--c-fill)', color: 'var(--c-ink)' }}>{copied ? t('guest.copied') : t('guest.copy')}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-primary btn-full" disabled={busy || !!error} onClick={create} style={{ ...btn, width: '100%', marginBottom: 6 }}>
            {busy ? t('common.saving') : t('station.linkCreate')}
          </button>
        )}

        {error && <p role="alert" style={{ margin: '8px 0', fontSize: 13, color: '#e63946', fontWeight: 700 }}>{error}</p>}

        {token && (
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button type="button" className="btn-no-anim" disabled={busy} onClick={revoke}
              style={{ ...btn, flex: 1, background: 'rgba(230,57,70,0.1)', color: '#e63946' }}>{t('station.linkRevoke')}</button>
            <button type="button" className="btn-no-anim" disabled={busy} onClick={create}
              style={{ ...btn, flex: 1, background: 'var(--c-fill)', color: 'var(--c-ink)' }}>{t('station.linkNew')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
