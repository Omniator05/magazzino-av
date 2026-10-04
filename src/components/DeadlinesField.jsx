import { useTranslation } from 'react-i18next'
import DateField from './DateField'
import { Trash, Plus } from './Icon'
import { newDeadline } from '../utils/deadlines'

// Editor di scadenze libere (etichetta + data), riusato da Vehicles.jsx e
// Inventory.jsx — stessa struttura per entrambi, solo i furgoni ricevono
// `quickLabels` (scorciatoie già pronte per Assicurazione/Revisione/Bollo,
// comuni a ogni furgone) perché per gli oggetti un'etichetta fissa non ha
// senso quasi mai (un microfono non ha il bollo).
export default function DeadlinesField({ value, onChange, quickLabels }) {
  const { t } = useTranslation()
  const list = value || []
  const update = (id, patch) => onChange(list.map(d => d.id === id ? { ...d, ...patch } : d))
  const remove = id => onChange(list.filter(d => d.id !== id))
  const add = (label = '') => onChange([...list, newDeadline(label)])

  return (
    <div>
      {list.map(d => (
        <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input value={d.label} onChange={e => update(d.id, { label: e.target.value })}
            placeholder={t('deadlines.labelPlaceholder')} style={{ flex: 1, minWidth: 0 }} />
          <div style={{ width: 132, flexShrink: 0 }}>
            <DateField value={d.date} clearable onChange={v => update(d.id, { date: v })} />
          </div>
          <button type="button" onClick={() => remove(d.id)} aria-label={t('deadlines.removeAria')}
            style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--red)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trash size={15} />
          </button>
        </div>
      ))}
      {/* "Aggiungi scadenza" nella stessa riga e con lo stesso stile delle
          scorciatoie — tutti bottoni pillola equivalenti, non un bottone
          "principale" a parte sotto. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {quickLabels && quickLabels.filter(l => !list.some(d => d.label === l)).map(l => (
          <button key={l} type="button" onClick={() => add(l)}
            style={{ padding: '5px 10px', borderRadius: 16, background: 'var(--card2)', border: '1px dashed var(--border)', color: 'var(--text2)', fontSize: 12, fontWeight: 700 }}>
            + {l}
          </button>
        ))}
        <button type="button" onClick={() => add()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 16, background: 'var(--card2)', border: '1px dashed var(--border)', color: 'var(--text2)', fontSize: 12, fontWeight: 700 }}>
          <Plus size={12} /> {t('deadlines.addDeadline')}
        </button>
      </div>
    </div>
  )
}
