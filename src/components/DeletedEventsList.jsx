import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pin } from './Icon'
import { formatDate } from '../utils/formatDate'
import { DELETED_EVENT_DAYS } from '../utils/kitInventory'

// Sezione "Eliminati" dell'Archivio: gli eventi eliminati negli ultimi DELETED_EVENT_DAYS giorni (collezione
// deletedEvents, vedi deleteEventWithInventoryCheck in utils/kitInventory.js), recuperabili con "Ripristina".
// Passati i giorni li toglie il cron giornaliero (api/push.js); "Elimina per sempre" lo fa subito.
// items: documenti di deletedEvents (con `id`), già filtrati dalla ricerca. onRestore / onPurge: async (entry).
const DAY_MS = 86400000

function daysLeftOf(entry) {
  // deletedAt è null solo per un attimo, finché Firestore non conferma la scrittura: vale come "adesso"
  const at = entry.deletedAt?.toMillis ? entry.deletedAt.toMillis() : Date.now()
  return Math.max(0, Math.ceil(DELETED_EVENT_DAYS - (Date.now() - at) / DAY_MS))
}

export default function DeletedEventsList({ items, searching, onRestore, onPurge }) {
  const { t, i18n } = useTranslation()
  const [busyId, setBusyId] = useState(null)
  const thisYear = new Date().getFullYear()
  const run = async (fn, entry) => {
    if (busyId) return
    setBusyId(entry.id)
    try { await fn(entry) } finally { setBusyId(null) }
  }

  return (
    <div style={{ padding: '12px 0 0' }}>
      <p style={{ margin: '0 16px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink3)', lineHeight: 1.4 }}>
        {t('archive.deletedHint')}
      </p>
      {items.length === 0 ? (
        <div className="empty-state">
          <h3>{searching ? t('archive.noResults') : t('archive.deletedEmptyTitle')}</h3>
          <p>{searching ? '' : t('archive.deletedEmptyDesc')}</p>
        </div>
      ) : items.map(entry => {
        const left = daysLeftOf(entry)
        const dd = d => new Date(d + 'T12:00:00')
        const end = entry.dateEnd && entry.dateEnd > entry.date ? entry.dateEnd : null
        const day = end ? `${dd(entry.date).getDate()}–${dd(end).getDate()}` : String(dd(entry.date).getDate())
        const month = formatDate(dd(entry.date), { month: 'short' }, i18n.language).replace('.', '')
        const year = dd(entry.date).getFullYear()
        const deletedOn = entry.deletedAt?.toDate ? formatDate(entry.deletedAt.toDate(), { day: 'numeric', month: 'short' }, i18n.language) : ''
        const busy = busyId === entry.id
        return (
          <div key={entry.id} style={{ margin: '0 16px 10px', padding: '12px 14px 12px 12px', background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 16, opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <span style={{ width: 54, height: 54, borderRadius: 13, background: 'var(--c-fill)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1.1 }}>
                <span style={{ fontSize: end ? 16 : 21, fontWeight: 800, color: 'var(--c-ink2)', fontVariantNumeric: 'tabular-nums' }}>{day}</span>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--c-ink3)', marginTop: 2 }}>{month}{year !== thisYear ? ` ${String(year).slice(2)}` : ''}</span>
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
                <span style={{ display: 'block', fontSize: 15.5, fontWeight: 800, color: 'var(--c-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                {entry.location && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--c-ink2)', marginTop: 3, minWidth: 0 }}>
                    <Pin size={13} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.location}</span>
                  </span>
                )}
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, marginTop: 3, color: left <= 3 ? '#ea580c' : 'var(--c-ink3)' }}>
                  {deletedOn ? `${t('archive.deletedOn', { date: deletedOn })} · ` : ''}{left === 0 ? t('archive.deletedLastDay') : t('archive.deletedLeft', { count: left })}
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <button type="button" className="btn-no-anim" disabled={!!busyId} onClick={() => run(onRestore, entry)}
                style={{ flex: 1, padding: '11px 14px', borderRadius: 12, background: '#e63946', color: '#fff', fontSize: 14, fontWeight: 800 }}>
                {t('archive.restore')}
              </button>
              <button type="button" className="btn-no-anim" disabled={!!busyId} onClick={() => run(onPurge, entry)}
                style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 13.5, fontWeight: 700 }}>
                {t('archive.deleteForever')}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
