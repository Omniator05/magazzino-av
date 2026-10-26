import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { generateItemCode, generateUnitCode } from '../utils/generateCode'
import { renderLabelPNG, downloadDataUrl, labelFilename } from '../utils/labelImage'
import { getCodeDisplay } from '../utils/codeDisplay'
import { QrCode, Barcode } from './Icon'

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
              <button onClick={downloadOne} disabled={busy} className="btn btn-secondary">{t('inventory.printOneLabel')}</button>
              {total > 1 && <button onClick={downloadUnits} disabled={busy} className="btn btn-secondary">{t('inventory.printAllUnits', { count: total })}</button>}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
