import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { generateItemCode, generateUnitCode } from '../utils/generateCode'
import { renderLabelPNG, downloadDataUrl, labelFilename } from '../utils/labelImage'
import { getCodeDisplay } from '../utils/codeDisplay'
import { QrCode, Barcode } from './Icon'
import { probeService, pickPrinter, printLabelImages, printErrorText, loadPrintSettings, savePrintSettings } from '../utils/makeidPrint'

// Scarica l'etichetta di un oggetto (PNG pronta per la stampante termica), una sola o una per ogni pezzo in uno
// zip. Disponibile a tutti — anche ai magazzinieri e alla postazione, che non possono modificare il magazzino:
// stampare un'etichetta non cambia nulla. Se la squadra usa "QR e codice a barre" chiede quale; altrimenti usa
// quello scelto nelle impostazioni. Stessa logica del popup di Inventory.jsx.
export default function LabelDialog({ item, onClose }) {
  const { t } = useTranslation()
  const { team, teamId } = useAuth()
  const display = getCodeDisplay(team)
  const [format, setFormat] = useState(display === 'both' ? null : display)
  const [busy, setBusy] = useState(false)
  const baseCode = item.code || generateItemCode(item.id)
  const total = item.totalQty || 1

  // Stampa diretta: se sul PC c'è il servizio di stampa MakeID (vedi utils/makeidPrint.js) compare il pulsante Stampa.
  const [svc, setSvc] = useState({ state: 'checking', printers: [] })
  const [settings, setSettings] = useState(loadPrintSettings)
  const [msg, setMsg] = useState({ text: '', error: false })
  const [preview, setPreview] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [choosing, setChoosing] = useState(false)   // passo "quali etichette?" (oggetti da 2 a 20 pezzi)
  const [unitNo, setUnitNo] = useState('1')
  useEffect(() => { let live = true; probeService().then(r => { if (live) setSvc(r) }); return () => { live = false } }, [])
  const printer = pickPrinter(svc.printers, settings.printer)
  // Ogni cartuccia (60×38 con QR, 41×13 con codice a barre) può richiedere una rotazione diversa
  const rotationKey = format === 'barcode' ? 'rotationBarcode' : 'rotation'
  const rotationNow = settings[rotationKey] || 0
  const direct = svc.state === 'up' && !!printer     // c'è una stampante collegata: un solo pulsante "Stampa"
  const updateSettings = patch => { const next = { ...settings, ...patch }; setSettings(next); savePrintSettings(next) }

  // Regola di stampa: 1 pezzo → l'etichetta; da 2 a 20 pezzi → si sceglie (tutte, solo il numero n, o quella generale);
  // oltre 20 → direttamente la generale (nessuno incolla 20+ etichette numerate su un oggetto).
  const MAX_NUMBERED = 20
  const startPrint = () => {
    if (total > 1 && total <= MAX_NUMBERED) setChoosing(true)
    else directPrint()
  }

  // `units`: true = tutte le etichette numerate; un numero = solo quel pezzo; altrimenti l'etichetta generale.
  const directPrint = async ({ units = false, asPreview = false } = {}) => {
    setBusy(true); setMsg({ text: '', error: false }); setPreview('')
    try {
      const codes = units === true ? Array.from({ length: total }, (_, i) => generateUnitCode(baseCode, i + 1))
        : Number.isInteger(units) ? [generateUnitCode(baseCode, units)] : [baseCode]
      const images = []
      for (const code of asPreview ? [codes[0]] : codes) images.push(await renderLabelPNG({ name: item.name, location: item.location, code, teamId, format }))
      const res = await printLabelImages(images, { printer, rotation: rotationNow, preview: asPreview, readable: svc.readable !== false, format })
      if (asPreview) {
        const img = res[0]?.content
        if (img) setPreview(img); else setMsg({ text: t('labelPrint.previewBlind'), error: false })
      } else {
        setMsg({ text: t('labelPrint.sent', { count: images.length }), error: false })
        setChoosing(false)
      }
    } catch (e) {
      setMsg({ text: e.message === 'offline' || e.message === 'timeout' ? t('labelPrint.offline') : printErrorText(e.code), error: true })
    } finally { setBusy(false) }
  }

  const downloadOne = async () => {
    setBusy(true)
    try {
      const png = await renderLabelPNG({ name: item.name, location: item.location, code: baseCode, teamId, format })
      downloadDataUrl(png, labelFilename(item.name, baseCode))
      onClose()
    } finally { setBusy(false) }
  }
  const downloadUnits = async () => {
    setBusy(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      for (let i = 1; i <= total; i++) {
        const code = generateUnitCode(baseCode, i)
        const png = await renderLabelPNG({ name: item.name, location: item.location, code, teamId, format })
        zip.file(labelFilename(item.name, code), png.split(',')[1], { base64: true })
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      downloadDataUrl(URL.createObjectURL(blob), `etichette-${labelFilename(item.name, baseCode).replace('.png', '')}.zip`)
      onClose()
    } finally { setBusy(false) }
  }

  const choice = { background: 'var(--card2)', border: '2px solid var(--border)', borderRadius: 14, padding: '18px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text)' }
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ position: 'relative', width: '100%', maxWidth: 320, background: 'var(--card)', borderRadius: 16, padding: 20, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <button onClick={onClose} aria-label={t('common.close')} className="btn-no-anim"
          style={{ position: 'absolute', top: 10, right: 10, background: 'transparent', color: 'var(--text2)', fontSize: 16, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        {format === null ? (
          <>
            <h2 style={{ margin: '0 36px 16px 0', fontSize: 17 }}>{t('inventory.chooseCodeFormat')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setFormat('qr')} style={choice}><QrCode size={26} /><span style={{ fontWeight: 700, fontSize: 13 }}>{t('adminUsers.codeDisplayQr')}</span></button>
              <button onClick={() => setFormat('barcode')} style={choice}><Barcode size={26} /><span style={{ fontWeight: 700, fontSize: 13 }}>{t('adminUsers.codeDisplayBarcode')}</span></button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ margin: '0 36px 4px 0', fontSize: 17 }}>{t('inventory.downloadLabel')}</h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text2)', overflowWrap: 'anywhere' }}>{item.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {direct ? (
                choosing ? (
                  <>
                    <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700 }}>{t('labelPrint.whichTitle')}</p>
                    <button onClick={() => directPrint({ units: true })} disabled={busy} className="btn btn-primary">{t('labelPrint.allNumbered', { count: total })}</button>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <label style={{ flexShrink: 0, fontSize: 14 }}>{t('labelPrint.onlyNumber')}</label>
                      <input type="number" inputMode="numeric" min={1} max={total} value={unitNo} onChange={e => setUnitNo(e.target.value)} aria-label={t('labelPrint.onlyNumber')} style={{ width: 70, textAlign: 'center' }} />
                      <button onClick={() => directPrint({ units: Math.min(total, Math.max(1, parseInt(unitNo, 10) || 1)) })} disabled={busy} className="btn btn-secondary" style={{ flex: 1 }}>{t('labelPrint.printThis')}</button>
                    </div>
                    <button onClick={() => directPrint()} disabled={busy} className="btn btn-secondary">{t('labelPrint.generalOne')}</button>
                    <button type="button" className="btn-no-anim" onClick={() => setChoosing(false)} style={{ background: 'transparent', color: 'var(--text2)', fontSize: 13, padding: 6 }}>{t('common.back')}</button>
                  </>
                ) : (
                  <button onClick={startPrint} disabled={busy} className="btn btn-primary">{t('labelPrint.printLabel')}</button>
                )
              ) : svc.state === 'checking' ? (
                <button disabled className="btn btn-secondary">{t('labelPrint.checking')}</button>
              ) : (
                <>
                  <button onClick={downloadOne} disabled={busy} className="btn btn-secondary">{t('inventory.printOneLabel')}</button>
                  {total > 1 && <button onClick={downloadUnits} disabled={busy} className="btn btn-secondary">{t('inventory.printAllUnits', { count: total })}</button>}
                </>
              )}
            </div>

            {/* Stato della stampante diretta */}
            <div style={{ marginTop: 14, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text2)' }}>
              {svc.state === 'down' && (
                <span>{t('labelPrint.notInstalled')} <a href="https://github.com/MakeID-Developer/label-print/tree/main/JS" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>{t('labelPrint.howTo')}</a></span>
              )}
              {svc.state === 'up' && !printer && <span>{t('labelPrint.noPrinter')}</span>}
              {svc.state === 'up' && printer && (
                <>
                  <span>{t('labelPrint.printerFound', { name: printer.printer })}</span>{' '}
                  <button type="button" className="btn-no-anim" onClick={() => setShowSettings(s => !s)} style={{ background: 'transparent', color: 'var(--blue)', fontSize: 12.5, padding: 0, textDecoration: 'underline' }}>{t('labelPrint.settings')}</button>
                  {showSettings && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {svc.printers.length > 1 && (
                        <select value={printer.printer} onChange={e => updateSettings({ printer: e.target.value })} aria-label={t('labelPrint.printer')}>
                          {svc.printers.map(p => <option key={p.printer} value={p.printer}>{p.printer}</option>)}
                        </select>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flexShrink: 0 }}>{t('labelPrint.rotation')}</span>
                        <select value={rotationNow} onChange={e => updateSettings({ [rotationKey]: Number(e.target.value) })}>
                          {[0, 90, 180, 270].map(r => <option key={r} value={r}>{r}°</option>)}
                        </select>
                      </label>
                      <button type="button" onClick={() => directPrint({ asPreview: true })} disabled={busy} className="btn btn-secondary">{t('labelPrint.preview')}</button>
                      <button type="button" onClick={downloadOne} disabled={busy} className="btn btn-secondary">{t('labelPrint.downloadImage')}</button>
                      {total > 1 && <button type="button" onClick={downloadUnits} disabled={busy} className="btn btn-secondary">{t('inventory.printAllUnits', { count: total })}</button>}
                      {preview && <img src={preview} alt={t('labelPrint.preview')} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />}
                    </div>
                  )}
                </>
              )}
              {msg.text && <p role={msg.error ? 'alert' : 'status'} style={{ margin: '10px 0 0', fontWeight: 700, color: msg.error ? '#e63946' : 'var(--green)' }}>{msg.text}</p>}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
