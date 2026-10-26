import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { db } from '../firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import BackHomeButton from '../components/BackHomeButton'
import ItemHistoryPanel from '../components/ItemHistoryPanel'

// Pagina dedicata a un singolo oggetto (telefono): scheda base + controllo disponibilità + storico. Il contenuto
// vero sta in ItemHistoryPanel, che su computer compare direttamente nella colonna della scheda oggetto.
export default function InventoryItemHistory() {
  const { itemId } = useParams()
  const { t } = useTranslation()
  const [item, setItem] = useState(null)
  const [itemLoaded, setItemLoaded] = useState(false)

  useEffect(() => {
    if (!itemId) return
    return onSnapshot(doc(db, 'items', itemId), snap => {
      setItem(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setItemLoaded(true)
    })
  }, [itemId])

  if (itemLoaded && !item) {
    return (
      <div className="page">
        <div className="page-header rc-page-header">
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <BackHomeButton to="/inventory" />
            <h1>{t('inventory.historyItemNotFoundTitle')}</h1>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header rc-page-header">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <BackHomeButton to="/inventory" />
          {/* Titolo fisso, non il nome dell'oggetto — così sta sempre su una
              riga sola su mobile, senza bisogno di troncare/andare a capo
              qualunque sia la lunghezza del nome. Il nome vero e proprio si
              legge subito sotto, nella prima card. */}
          <h1 style={{ textAlign:'right' }}>{t('inventory.historyPageTitle')}</h1>
        </div>
      </div>


      {/* Scheda base — stessa lettura "un rigo per campo" del modal di
          dettaglio in Inventory.jsx, qui di sola consultazione. Il nome è
          il primo rigo: l'header sopra ora è un titolo fisso ("Dettagli"),
          quindi questa è la prima cosa che dice di quale oggetto si sta
          parlando — attaccato al resto, non in una card a parte. */}
      {item && (
        <div style={{ margin:'20px 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', display:'flex', justifyContent:'space-between', gap:14 }}>
            <span style={{ color:'var(--text2)', fontSize:13, flexShrink:0 }}>{t('inventory.nameFieldLabel')}</span>
            <span style={{ fontWeight:700, fontSize:14, textAlign:'right', minWidth:0, overflowWrap:'break-word' }}>{item.name}</span>
          </div>
          {(item.brand || item.model) && (
            <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', gap:14 }}>
              <span style={{ color:'var(--text2)', fontSize:13, flexShrink:0 }}>{t('inventory.brandModelLabel')}</span>
              <span style={{ fontWeight:600, fontSize:13, textAlign:'right', minWidth:0, overflowWrap:'break-word' }}>{[item.brand, item.model].filter(Boolean).join(' ')}</span>
            </div>
          )}
          {item.location && (
            <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', gap:14 }}>
              <span style={{ color:'var(--text2)', fontSize:13, flexShrink:0 }}>{t('inventory.warehousePosition')}</span>
              <span style={{ fontWeight:600, fontSize:13, textAlign:'right', minWidth:0, overflowWrap:'break-word' }}>{item.location}</span>
            </div>
          )}
          <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <span style={{ color:'var(--text2)', fontSize:13 }}>{t('inventory.detailAvailable')}</span>
              <span style={{ fontWeight:800, fontSize:15 }}>{item.availableQty}/{item.totalQty}</span>
            </div>
            <div style={{ background:'var(--card2)', borderRadius:4, height:7, overflow:'hidden', display:'flex' }}>
              <div style={{ background:'var(--green)', width:`${((item.availableQty||0)/(item.totalQty||1))*100}%` }} />
              {(item.brokenQty||0) > 0 && <div style={{ background:'var(--red)', width:`${((item.brokenQty||0)/(item.totalQty||1))*100}%` }} />}
            </div>
          </div>
        </div>
      )}

      <ItemHistoryPanel itemId={itemId} />
    </div>
  )
}
