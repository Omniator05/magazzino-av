import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import SaveButton from './SaveButton'
import { Check } from './Icon'

// Stesso "vestito" del popup di conferma generico (ConfirmProvider — card
// piccola e centrata, senza card a schermo pieno né tasto ✕): qui però il
// bottone di conferma non risolve subito, mostra spinner→spunta→dissolvenza
// (stessa animazione di SaveButton usata per Salva/Crea) prima di chiudersi,
// perché sotto c'è una vera scrittura di rete (ripristino giacenza +
// archiviazione), non un semplice sì/no istantaneo — da qui il "molto
// grezzo" lamentato quando usava ancora ConfirmProvider senza feedback.
export default function CloseInstallationModal({ open, onClose, onConfirm, message }) {
  const { t } = useTranslation()
  const [closing, setClosing] = useState(false)

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 150)
  }

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      onClick={close}
      style={{ position:'fixed', inset:0, zIndex:10050, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation: closing ? 'ciFadeOut 0.15s ease forwards' : 'ciFadeIn 0.15s ease' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ background:'#fff', borderRadius:24, padding:'26px 22px 20px', width:'100%', maxWidth:330, textAlign:'center', boxShadow:'0 24px 70px rgba(0,0,0,0.35)', animation: closing ? 'ciPopOut 0.15s ease forwards' : 'ciPopIn 0.24s cubic-bezier(0.32,0.72,0,1)' }}
      >
        <div style={{ width:54, height:54, borderRadius:'50%', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(90,82,201,0.12)', color:'#7c6fcd' }}>
          <Check size={26} />
        </div>
        <h3 style={{ fontSize:18, fontWeight:800, color:'#111827', margin:'0 0 6px', letterSpacing:'-0.3px' }}>{t('eventDetail.confirmCloseInstallationTitle')}</h3>
        <p style={{ fontSize:14, color:'#6b7280', margin:0, lineHeight:1.45 }}>{message}</p>
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button onClick={close} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'#f3f4f6', color:'#374151', border:'none', cursor:'pointer' }}>
            {t('common.cancel')}
          </button>
          <SaveButton
            onSave={onConfirm} onDone={close} className=""
            style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'#7c6fcd', color:'#fff', border:'none', cursor:'pointer' }}
          >
            {t('eventDetail.confirmCloseInstallationLabel')}
          </SaveButton>
        </div>
      </div>
      <style>{`
        @keyframes ciFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes ciFadeOut { from{opacity:1} to{opacity:0} }
        @keyframes ciPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
        @keyframes ciPopOut  { from{opacity:1; transform:scale(1)} to{opacity:0; transform:scale(0.97)} }
      `}</style>
    </div>,
    document.body
  )
}
