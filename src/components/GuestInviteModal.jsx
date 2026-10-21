import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createGuestLink, revokeGuestLink, guestUrl } from '../utils/guestLinks'

// Invito di una persona esterna (personale a chiamata) con un LINK: nessun
// account, sola lettura. Il link si vede una volta sola, appena creato (sul
// server resta solo la sua impronta — vedi api/_guest.js): se serve rimandarlo
// se ne crea uno nuovo, che annulla il precedente. Aperto dal chip della
// persona esterna in "Assegna personale" (StaffTimeline).
export default function GuestInviteModal({ person, onClose }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [revoked, setRevoked] = useState(false)
  const active = !revoked && (!!url || !!person.guestActive)

  const create = async () => {
    setBusy(true); setError(''); setCopied(false)
    try {
      setUrl(guestUrl(await createGuestLink(person.id)))
      setRevoked(false)
    } catch (e) {
      // 404 = le funzioni /api non esistono (es. `npm run dev` in locale: ci sono solo su Vercel)
      setError(e?.message === 'http-404' ? t('guest.serverMissing') : t('guest.createError'))
    } finally { setBusy(false) }
  }

  const revoke = async () => {
    setBusy(true); setError('')
    try {
      await revokeGuestLink(person.id)
      setUrl(''); setRevoked(true)
    } catch (e) {
      setError(e?.message === 'http-404' ? t('guest.serverMissing') : t('guest.revokeError'))
    } finally { setBusy(false) }
  }

  const message = t('guest.shareMessage', { name: person.name, link: url })
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true) } catch { setCopied(false) }
  }
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  const btn = { minHeight:44, borderRadius:12, fontSize:14, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, padding:'10px 14px' }

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={t('guest.inviteTitle', { name: person.name })}
        style={{ position:'relative', width:'100%', maxWidth:380, maxHeight:'90dvh', overflowY:'auto', background:'var(--c-surface)', borderRadius:18, padding:'22px 20px 20px', boxShadow:'0 12px 40px rgba(0,0,0,0.3)' }}>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="btn-no-anim"
          style={{ position:'absolute', top:6, right:6, width:44, height:44, background:'transparent', color:'var(--c-ink3)', fontSize:16 }}>✕</button>
        <h2 style={{ margin:'0 40px 6px 0', fontSize:18, color:'var(--c-ink)' }}>{t('guest.inviteTitle', { name: person.name })}</h2>
        <p style={{ margin:'0 0 14px', fontSize:13, lineHeight:1.5, color:'var(--c-ink2)' }}>{t('guest.inviteIntro')}</p>

        {active && (
          <p style={{ margin:'0 0 12px', padding:'8px 12px', borderRadius:10, background:'rgba(34,197,94,0.12)', color:'var(--c-green)', fontSize:13, fontWeight:700 }}>
            {t('guest.linkActive')}
          </p>
        )}

        {url && (
          <div style={{ marginBottom:14 }}>
            <input readOnly value={url} onFocus={e => e.target.select()} aria-label={t('guest.linkLabel')} style={{ fontSize:12.5, fontFamily:'monospace' }} />
            <p style={{ margin:'6px 0 10px', fontSize:12, color:'var(--c-ink3)', lineHeight:1.45 }}>{t('guest.seenOnce')}</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <button type="button" className="btn btn-primary" onClick={copy} style={btn}>{copied ? t('guest.copied') : t('guest.copy')}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"
                style={{ ...btn, background:'var(--c-fill)', color:'var(--c-ink)', textDecoration:'none' }}>{t('guest.sendWhatsApp')}</a>
              {canShare && (
                <button type="button" className="btn-no-anim" onClick={() => navigator.share({ text: message }).catch(() => {})}
                  style={{ ...btn, background:'var(--c-fill)', color:'var(--c-ink)' }}>{t('guest.share')}</button>
              )}
            </div>
          </div>
        )}

        {!url && active && <p style={{ margin:'0 0 12px', fontSize:12.5, color:'var(--c-ink2)', lineHeight:1.5 }}>{t('guest.resendHint')}</p>}
        <p style={{ margin:'0 0 14px', fontSize:12, color:'var(--c-ink3)', lineHeight:1.45 }}>{t('guest.expiryNote')}</p>

        {error && <p role="alert" style={{ margin:'0 0 10px', fontSize:13, color:'#e63946', fontWeight:700 }}>{error}</p>}

        <div style={{ display:'flex', gap:8 }}>
          {active && (
            <button type="button" className="btn-no-anim" disabled={busy} onClick={revoke}
              style={{ ...btn, flex:1, background:'rgba(230,57,70,0.1)', color:'#e63946' }}>{t('guest.revoke')}</button>
          )}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={create} style={{ ...btn, flex:2 }}>
            {busy ? t('common.saving') : (active ? t('guest.createNew') : t('guest.create'))}
          </button>
        </div>
      </div>
    </div>
  )
}
