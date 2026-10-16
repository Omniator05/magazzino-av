import { useTranslation } from 'react-i18next'
import { Plus } from './Icon'

// Editor degli oggetti collegati (vedi utils/linkedItems.js): per ognuno una
// quantità e la modalità "a ogni oggetto aggiunto" / "una sola volta".
// value = [{ itemId, qty, mode }]. Usato nella sezione "Oggetti collegati" del
// foglio oggetto e nei fogli kit.
//
// Ogni oggetto è una scheda su TRE righe fisse (nome + rimuovi / quantità /
// modalità a tutta larghezza) invece di una riga che andava a capo in modo
// diverso a seconda della larghezza dello schermo (la causa dell'aspetto
// "rotto" su telefono: quantità e selettore si sovrapponevano o si
// stringevano). Stesso linguaggio del Calendario: bianco, righe var(--c-line),
// pillole var(--c-fill), accento #e63946.
const stepBtn = {
  width:34, height:34, borderRadius:9, background:'var(--c-surface)', color:'var(--c-ink)', fontSize:18, fontWeight:700,
  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 1px 2px rgba(0,0,0,0.08)',
}

export default function LinkedItemsEditor({ items, selfId, value, onChange, search, onSearchChange }) {
  const { t } = useTranslation()
  const update = (itemId, patch) => onChange(value.map(l => l.itemId === itemId ? { ...l, ...patch } : l))

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
          {value.map(l => {
            const li = items.find(i => i.id === l.itemId)
            if (!li) return null
            return (
              <div key={l.itemId} style={{ background:'var(--c-sheet)', border:'1px solid var(--c-line)', borderRadius:12, padding:'12px 12px 12px 14px' }}>
                {/* Riga 1: nome + scollega */}
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ flex:1, minWidth:0, fontSize:14, fontWeight:800, color:'var(--c-ink)', overflowWrap:'anywhere' }}>{li.name}</span>
                  <button type="button" className="btn-no-anim"
                    onClick={() => onChange(value.filter(x => x.itemId !== l.itemId))}
                    aria-label={t('inventory.removeLinkedItemAria', { name: li.name })}
                    style={{ width:28, height:28, borderRadius:8, background:'var(--c-fill2)', color:'var(--c-ink2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0 }}
                  >✕</button>
                </div>

                {/* Riga 2: quantità */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:10 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:'var(--c-ink2)', textTransform:'uppercase', letterSpacing:'0.4px', flexShrink:0 }}>{t('inventory.linkedQtyLabel')}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:3, background:'var(--c-fill2)', borderRadius:11, padding:3, marginLeft:'auto' }}>
                    <button type="button" className="btn-no-anim" onClick={() => update(l.itemId, { qty: Math.max(1, l.qty - 1) })} aria-label={t('eventDetail.decreaseQtyAria')} style={stepBtn}>−</button>
                    <input
                      type="number" min="1" value={l.qty}
                      aria-label={t('inventory.linkedQtyAria', { name: li.name })}
                      onChange={e => update(l.itemId, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      onFocus={e => e.target.select()}
                      style={{ width:46, textAlign:'center', fontWeight:800, fontSize:15, padding:'4px 2px', border:'none', background:'transparent', boxShadow:'none', color:'var(--c-ink)' }}
                    />
                    <button type="button" className="btn-no-anim" onClick={() => update(l.itemId, { qty: l.qty + 1 })} aria-label={t('eventDetail.increaseQtyAria')} style={stepBtn}>+</button>
                  </div>
                </div>

                {/* Riga 3: modalità, a tutta larghezza, con una riga che la spiega */}
                <div role="group" aria-label={t('inventory.linkedModeAria', { name: li.name })} style={{ display:'flex', background:'var(--c-fill2)', borderRadius:11, padding:3, gap:3, marginTop:10 }}>
                  {['perUnit', 'once'].map(mode => (
                    <button key={mode} type="button"
                      onClick={() => update(l.itemId, { mode })}
                      aria-pressed={l.mode === mode}
                      className="btn-no-anim"
                      style={{
                        flex:1, padding:'8px 6px', borderRadius:9, fontSize:12.5, fontWeight:800,
                        background: l.mode === mode ? 'var(--c-surface)' : 'transparent',
                        color: l.mode === mode ? 'var(--c-ink)' : 'var(--c-ink2)',
                        boxShadow: l.mode === mode ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                      }}
                    >{t(mode === 'perUnit' ? 'inventory.linkModePerUnit' : 'inventory.linkModeOnce')}</button>
                  ))}
                </div>
                <p style={{ margin:'7px 2px 0', fontSize:11.5, color:'var(--c-ink3)', lineHeight:1.4 }}>
                  {t(l.mode === 'once' ? 'inventory.linkModeOnceHint' : 'inventory.linkModePerUnitHint')}
                </p>
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
          <div style={{ marginTop:8, maxHeight:190, overflowY:'auto', border:'1px solid var(--c-line)', borderRadius:12, background:'var(--c-alt)' }}>
            {results.length === 0 ? (
              <p style={{ padding:'11px 14px', margin:0, fontSize:12.5, color:'var(--c-ink3)', fontStyle:'italic' }}>{t('inventory.linkedItemsNoResults')}</p>
            ) : results.map((i, idx) => (
              <button key={i.id} type="button" className="btn-no-anim"
                onClick={() => { onChange([...value, { itemId: i.id, qty: 1, mode: 'perUnit' }]); onSearchChange('') }}
                style={{ display:'flex', width:'100%', alignItems:'center', justifyContent:'space-between', gap:8, padding:'11px 14px', background:'transparent', borderBottom: idx < results.length - 1 ? '1px solid var(--c-fill)' : 'none', fontSize:13.5, fontWeight:700, textAlign:'left', color:'var(--c-ink)' }}
              >
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{i.name}</span>
                <span style={{ color:'#e63946', flexShrink:0, display:'flex' }}><Plus size={15} /></span>
              </button>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
