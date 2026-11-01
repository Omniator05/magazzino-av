import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { localeFor } from '../utils/formatDate'
import { collectRows, powerSummary, buildPatch, formatAddr, SINGLE_PHASE_VOLTS } from '../utils/eventPowerPatch'

// Finestra "Potenza e patch DMX": potenza totale al carico massimo (in watt, per sapere cosa si può
// attaccare a una presa monofase) e patch DMX dei fari. Si apre dalla modalità "Seleziona" della lista
// di carico e calcola sugli oggetti scelti. I dati vengono dalle schede oggetto (potenza massima e canali
// DMX): vedi utils/eventPowerPatch.js.

const SOCKET_KEY = 'rcSocketAmps'
const readSocket = () => {
  try { const v = parseInt(localStorage.getItem(SOCKET_KEY), 10); return v > 0 ? v : 16 } catch { return 16 }
}

const tileLabel = { fontSize:11.5, fontWeight:700, color:'var(--c-ink3)', textTransform:'uppercase', letterSpacing:'0.3px' }
const th = { textAlign:'left', fontSize:11.5, fontWeight:700, color:'var(--c-ink3)', padding:'6px 8px', borderBottom:'1px solid var(--c-line)', whiteSpace:'nowrap' }
const td = { padding:'8px', fontSize:13.5, borderBottom:'1px solid var(--c-line)', color:'var(--c-ink)', fontVariantNumeric:'tabular-nums' }
const numInput = { width:84, padding:'8px 10px', borderRadius:10, border:'1.5px solid var(--c-line)', background:'var(--c-alt)', color:'var(--c-ink)', fontSize:14, fontVariantNumeric:'tabular-nums' }

export default function EventPowerPatch({ open, onClose, scopeLabel, eventItems, catalog, eventName }) {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState('power') // 'power' | 'patch'
  const [socketAmps, setSocketAmps] = useState(readSocket)
  const [startUniverse, setStartUniverse] = useState(1)
  const [startAddress, setStartAddress] = useState(1)
  const [copied, setCopied] = useState(false)
  useModalScrollLock(!!open)

  const nf = useMemo(() => new Intl.NumberFormat(localeFor(i18n.language), { maximumFractionDigits: 1 }), [i18n.language])
  const rows = useMemo(() => collectRows(eventItems, catalog), [eventItems, catalog])
  const power = useMemo(() => powerSummary(rows), [rows])
  const patch = useMemo(() => buildPatch(rows, { startUniverse, startAddress }), [rows, startUniverse, startAddress])

  if (!open) return null

  const amps = power.totalW / SINGLE_PHASE_VOLTS
  const socketW = socketAmps * SINGLE_PHASE_VOLTS
  const socketsNeeded = power.totalW > 0 && socketW > 0 ? Math.ceil(power.totalW / socketW) : 0
  const setSocket = v => {
    const n = Math.max(0, parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0)
    setSocketAmps(n)
    try { if (n > 0) localStorage.setItem(SOCKET_KEY, String(n)) } catch { /* vale per questa sessione */ }
  }

  const patchText = () => patch.patch.map(p => [p.label, p.channels, p.universe, `${p.universe}.${formatAddr(p.address)}`].join('\t')).join('\n')
  const copyPatch = async () => {
    try { await navigator.clipboard.writeText(patchText()); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* nessun accesso agli appunti */ }
  }
  const downloadCsv = () => {
    const q = s => `"${String(s).replace(/"/g, '""')}"`
    const header = [t('powerPatch.colFixture'), t('powerPatch.colChannels'), t('powerPatch.colUniverse'), t('powerPatch.colAddress')].map(q).join(',')
    const lines = patch.patch.map(p => [q(p.label), p.channels, p.universe, p.address].join(','))
    const blob = new Blob(['﻿' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t('powerPatch.csvName')}-${(eventName || 'event').replace(/[^\w-]+/g, '-').toLowerCase()}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const tabBtn = (key, label) => (
    <button key={key} onClick={() => setTab(key)} style={{ flex:1, padding:'9px 10px', borderRadius:10, fontSize:13.5, fontWeight:700, border:'none', background: tab === key ? 'var(--c-surface)' : 'transparent', color: tab === key ? 'var(--c-ink)' : 'var(--c-ink2)', boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.12)' : 'none' }}>{label}</button>
  )

  return (
    <>
      {createPortal(
        <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:10002, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('powerPatch.title')} style={{ background:'var(--c-surface)', borderRadius:24, width:'100%', maxWidth:580, maxHeight:'88dvh', display:'flex', flexDirection:'column', boxShadow:'0 24px 70px rgba(0,0,0,0.35)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'18px 20px 12px' }}>
              <div style={{ minWidth:0 }}>
                <h3 style={{ fontSize:18, fontWeight:800, color:'var(--c-ink)', margin:0, letterSpacing:'-0.3px' }}>{t('powerPatch.title')}</h3>
                {scopeLabel && <p style={{ fontSize:12.5, fontWeight:600, color:'var(--c-ink3)', margin:'3px 0 0' }}>{scopeLabel}</p>}
              </div>
              <button onClick={onClose} aria-label={t('common.close')} style={{ width:30, height:30, borderRadius:'50%', background:'var(--c-fill)', color:'var(--c-ink2)', border:'none', fontSize:14, flexShrink:0 }}>✕</button>
            </div>
            <div style={{ display:'flex', gap:4, margin:'0 20px 12px', padding:3, background:'var(--c-fill)', borderRadius:13 }}>
              {tabBtn('power', t('powerPatch.powerTab'))}
              {tabBtn('patch', t('powerPatch.patchTab'))}
            </div>

            <div style={{ overflowY:'auto', padding:'0 20px 20px' }}>
              {tab === 'power' && (
                <>
                  <div style={{ background:'var(--c-fill)', borderRadius:16, padding:'14px 16px', marginBottom:14 }}>
                    <div style={tileLabel}>{t('powerPatch.totalLabel')}</div>
                    <div style={{ fontSize:32, fontWeight:800, letterSpacing:'-0.8px', color:'var(--c-ink)', fontVariantNumeric:'tabular-nums' }}>{nf.format(power.totalW)} W</div>
                    <div style={{ fontSize:13, color:'var(--c-ink2)' }}>{t('powerPatch.amps', { amps: nf.format(amps) })}</div>
                  </div>

                  <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:6 }}>
                    <label htmlFor="rc-socket" style={{ fontSize:13.5, fontWeight:700, color:'var(--c-ink)' }}>{t('powerPatch.socketLabel')}</label>
                    <input id="rc-socket" inputMode="numeric" value={socketAmps || ''} onChange={e => setSocket(e.target.value)} style={{ ...numInput, width:64 }} />
                    <span style={{ fontSize:13.5, color:'var(--c-ink2)' }}>A</span>
                  </div>
                  {socketAmps > 0 && (
                    <p style={{ fontSize:13.5, color:'var(--c-ink2)', margin:'0 0 14px', lineHeight:1.5 }}>
                      {t('powerPatch.socketCap', { watts: nf.format(socketW) })}
                      {power.totalW > 0 && <> · <strong style={{ color: socketsNeeded > 1 ? 'var(--c-amber)' : 'var(--c-green)' }}>{t('powerPatch.socketsNeeded', { count: socketsNeeded })}</strong></>}
                    </p>
                  )}

                  {power.counted.length > 0 && (
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse' }}>
                        <thead><tr>
                          <th style={th}>{t('powerPatch.colItem')}</th>
                          <th style={{ ...th, textAlign:'right' }}>{t('powerPatch.colQty')}</th>
                          <th style={{ ...th, textAlign:'right' }}>{t('powerPatch.colEach')}</th>
                          <th style={{ ...th, textAlign:'right' }}>{t('powerPatch.colTotal')}</th>
                        </tr></thead>
                        <tbody>
                          {power.counted.map(r => (
                            <tr key={r.id}>
                              <td style={td}>{r.name}</td>
                              <td style={{ ...td, textAlign:'right' }}>{r.qty}</td>
                              <td style={{ ...td, textAlign:'right' }}>{nf.format(r.watts)}</td>
                              <td style={{ ...td, textAlign:'right', fontWeight:700 }}>{nf.format(r.watts * r.qty)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p style={{ fontSize:12.5, color:'var(--c-ink3)', margin:'12px 0 0', lineHeight:1.5 }}>{t('powerPatch.powerNote')}</p>
                  {power.missing.length > 0 && (
                    <details style={{ marginTop:12 }}>
                      <summary style={{ fontSize:13, fontWeight:700, color:'var(--c-ink2)', cursor:'pointer' }}>{t('powerPatch.missingTitle', { count: power.missing.length })}</summary>
                      <p style={{ fontSize:13, color:'var(--c-ink2)', margin:'8px 0 0', lineHeight:1.6 }}>{power.missing.map(r => `${r.name} ×${r.qty}`).join(' · ')}</p>
                    </details>
                  )}
                </>
              )}

              {tab === 'patch' && (
                <>
                  <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:14 }}>
                    <label style={{ display:'flex', flexDirection:'column', gap:5, fontSize:12.5, fontWeight:700, color:'var(--c-ink2)' }}>
                      {t('powerPatch.startUniverse')}
                      <input inputMode="numeric" value={startUniverse || ''} onChange={e => setStartUniverse(Math.max(0, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0))} style={numInput} />
                    </label>
                    <label style={{ display:'flex', flexDirection:'column', gap:5, fontSize:12.5, fontWeight:700, color:'var(--c-ink2)' }}>
                      {t('powerPatch.startAddress')}
                      <input inputMode="numeric" value={startAddress || ''} onChange={e => setStartAddress(Math.min(512, Math.max(0, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)))} style={numInput} />
                    </label>
                  </div>

                  {patch.patch.length === 0
                    ? <p style={{ fontSize:14, color:'var(--c-ink2)', lineHeight:1.5, margin:'6px 0 0' }}>{t('powerPatch.patchEmpty')}</p>
                    : (
                      <>
                        <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse' }}>
                            <thead><tr>
                              <th style={th}>#</th>
                              <th style={th}>{t('powerPatch.colFixture')}</th>
                              <th style={{ ...th, textAlign:'right' }}>{t('powerPatch.colChannels')}</th>
                              <th style={{ ...th, textAlign:'right' }}>{t('powerPatch.colUniverse')}</th>
                              <th style={{ ...th, textAlign:'right' }}>{t('powerPatch.colAddress')}</th>
                            </tr></thead>
                            <tbody>
                              {patch.patch.map((p, i) => (
                                <tr key={i}>
                                  <td style={{ ...td, color:'var(--c-ink3)' }}>{i + 1}</td>
                                  <td style={td}>{p.label}</td>
                                  <td style={{ ...td, textAlign:'right' }}>{p.channels}</td>
                                  <td style={{ ...td, textAlign:'right' }}>{p.universe}</td>
                                  <td style={{ ...td, textAlign:'right', fontWeight:700 }}>{p.universe}.{formatAddr(p.address)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ display:'flex', gap:10, marginTop:14 }}>
                          <button onClick={copyPatch} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'var(--c-fill)', color:'var(--c-ink)', border:'none' }}>{copied ? t('powerPatch.copied') : t('powerPatch.copy')}</button>
                          <button onClick={downloadCsv} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'var(--accent)', color:'#fff', border:'none' }}>{t('powerPatch.csv')}</button>
                        </div>
                      </>
                    )}
                  {patch.tooBig.length > 0 && (
                    <p style={{ fontSize:13, color:'var(--c-danger)', margin:'12px 0 0', lineHeight:1.5 }}>{t('powerPatch.tooBig', { names: patch.tooBig.map(r => r.name).join(', ') })}</p>
                  )}
                  <p style={{ fontSize:12.5, color:'var(--c-ink3)', margin:'12px 0 0', lineHeight:1.5 }}>{t('powerPatch.patchNote')}</p>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
