import { useTranslation } from 'react-i18next'
import { Plus } from './Icon'

const stepBtn = { width:34, height:34, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:17, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }

// Editor degli oggetti collegati (vedi utils/linkedItems.js): per ognuno una
// quantità e la modalità "a ogni oggetto aggiunto" / "una sola volta".
// value = [{ itemId, qty, mode }]. Usato nella pagina "Oggetti collegati" del
// modal oggetto e nei modal kit.
export default function LinkedItemsEditor({ items, selfId, value, onChange, search, onSearchChange }) {
  const { t } = useTranslation()
  const update = (itemId, patch) => onChange(value.map(l => l.itemId === itemId ? { ...l, ...patch } : l))

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
          {value.map(l => {
            const li = items.find(i => i.id === l.itemId)
            if (!li) return null
            return (
              <div key={l.itemId} style={{ background:'var(--card2)', border:'1px solid var(--border)', borderRadius:12, padding:'10px 12px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ flex:1, minWidth:0, fontSize:14, fontWeight:700, overflowWrap:'break-word' }}>{li.name}</span>
                  <button type="button"
                    onClick={() => onChange(value.filter(x => x.itemId !== l.itemId))}
                    aria-label={t('inventory.removeLinkedItemAria', { name: li.name })}
                    style={{ width:28, height:28, borderRadius:'50%', background:'var(--border)', color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}
                  >✕</button>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <button type="button" onClick={() => update(l.itemId, { qty: Math.max(1, l.qty - 1) })} aria-label={t('eventDetail.decreaseQtyAria')} style={stepBtn}>−</button>
                    <input
                      type="number" min="1" value={l.qty}
                      aria-label={t('inventory.linkedQtyAria', { name: li.name })}
                      onChange={e => update(l.itemId, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      onFocus={e => e.target.select()}
                      style={{ width:52, textAlign:'center', fontWeight:800, fontSize:15, padding:'6px 4px' }}
                    />
                    <button type="button" onClick={() => update(l.itemId, { qty: l.qty + 1 })} aria-label={t('eventDetail.increaseQtyAria')} style={stepBtn}>+</button>
                  </div>
                  <div role="group" aria-label={t('inventory.linkedModeAria', { name: li.name })} style={{ display:'flex', flex:1, minWidth:190, background:'var(--card3)', borderRadius:10, padding:3, gap:3 }}>
                    {['perUnit', 'once'].map(mode => (
                      <button key={mode} type="button"
                        onClick={() => update(l.itemId, { mode })}
                        aria-pressed={l.mode === mode}
                        className="btn-no-anim"
                        style={{
                          flex:1, padding:'7px 6px', borderRadius:8, fontSize:12, fontWeight:700,
                          background: l.mode === mode ? 'var(--card)' : 'transparent',
                          color: l.mode === mode ? 'var(--text)' : 'var(--text2)',
                          boxShadow: l.mode === mode ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                        }}
                      >{t(mode === 'perUnit' ? 'inventory.linkModePerUnit' : 'inventory.linkModeOnce')}</button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <input
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder={t('inventory.linkedItemsSearchPlaceholder')}
      />
      {search.trim() && (() => {
        const linkedIds = new Set(value.map(l => l.itemId))
        const results = items.filter(i =>
          i.id !== selfId &&
          !linkedIds.has(i.id) &&
          i.name.toLowerCase().includes(search.trim().toLowerCase())
        ).slice(0, 8)
        return (
          <div style={{ marginTop:6, maxHeight:170, overflowY:'auto', border:'1px solid var(--border)', borderRadius:10 }}>
            {results.length === 0 ? (
              <p style={{ padding:'9px 12px', fontSize:12.5, color:'var(--text3)', fontStyle:'italic' }}>{t('inventory.linkedItemsNoResults')}</p>
            ) : results.map((i, idx) => (
              <button key={i.id} type="button"
                onClick={() => { onChange([...value, { itemId: i.id, qty: 1, mode: 'perUnit' }]); onSearchChange('') }}
                style={{ display:'flex', width:'100%', alignItems:'center', justifyContent:'space-between', gap:8, padding:'9px 12px', background:'transparent', borderBottom: idx < results.length-1 ? '1px solid var(--border)' : 'none', fontSize:13, fontWeight:600, textAlign:'left', color:'var(--text)' }}
              >
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{i.name}</span>
                <span style={{ color:'var(--accent)', flexShrink:0, display:'flex' }}><Plus size={14} /></span>
              </button>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
