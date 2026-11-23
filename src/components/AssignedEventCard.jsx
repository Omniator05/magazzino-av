import { useTranslation } from 'react-i18next'
import { formatDate, capitalize } from '../utils/formatDate'

// Card di un evento assegnato a una persona esterna (utente temporaneo con link, o Freelance con account): titolo,
// date e luogo, note e — a tendina — la lista di carico in sola lettura. Condivisa da GuestView e FreelanceHome.
// `shifts` (facoltativo): i turni di quel giorno (orario + fase), mostrati in testa alla card.
const PHASE_COLOR = { montaggio: '#2563eb', smontaggio: '#ea580c' }
const PHASE_KEY = { montaggio: 'calendar.legendAssembly', smontaggio: 'calendar.legendDisassembly' }
const label = { margin: 0, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--c-ink3)' }
const card = { background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 16, overflow: 'hidden' }

export default function AssignedEventCard({ ev, shifts = [] }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const fmt = (d, o) => capitalize(formatDate(`${d}T12:00:00`, o, lang))
  const listName = l => l.name || (l.id === 'main' ? t('eventDetail.mainListName') : t('eventDetail.listUnnamed'))
  const rows = ev.items
  const multiList = ev.lists.length > 1
  const range = ev.dateEnd && ev.dateEnd > ev.date
    ? `${fmt(ev.date, { day: 'numeric', month: 'long' })} → ${fmt(ev.dateEnd, { day: 'numeric', month: 'long' })}`
    : fmt(ev.date, { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div style={{ ...card, marginBottom: 14 }}>
      {shifts.length > 0 && (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--c-line)', background: 'var(--c-alt)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {shifts.map(sh => (
            <div key={sh.key} style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{sh.time || t('guest.allDay')}</span>
              {sh.phase && PHASE_KEY[sh.phase] && (
                <span style={{ fontSize: 11, fontWeight: 800, color: PHASE_COLOR[sh.phase], background: `${PHASE_COLOR[sh.phase]}18`, borderRadius: 6, padding: '2px 8px' }}>{t(PHASE_KEY[sh.phase])}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: '14px 14px 12px' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{ev.name}</h2>
        <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--c-ink2)' }}>
          {range}{ev.location ? ` · ${ev.location}` : ''}
        </p>
        {ev.notes && <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{ev.notes}</p>}
      </div>
      <details style={{ borderTop: '1px solid var(--c-line)' }}>
        <summary style={{ cursor: 'pointer', padding: '12px 14px', fontSize: 13.5, fontWeight: 800, listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{t('guest.loadList')}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-ink2)' }}>{t('guest.itemsCount', { count: rows.length })}</span>
        </summary>
        {rows.length === 0 ? (
          <p style={{ margin: 0, padding: '0 14px 14px', fontSize: 13, color: 'var(--c-ink3)' }}>{t('guest.noItems')}</p>
        ) : ev.lists.map(l => {
          const lr = rows.filter(i => i.listId === l.id)
          if (lr.length === 0) return null
          return (
            <div key={l.id}>
              {multiList && <p style={{ ...label, padding: '10px 14px 4px', background: 'var(--c-alt)' }}>{listName(l)} · {lr.length}</p>}
              {lr.map(i => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 14px', borderTop: '1px solid var(--c-line)' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, minWidth: 28, fontVariantNumeric: 'tabular-nums', color: 'var(--c-ink2)' }}>×{i.qty}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{i.name}</p>
                    {i.location && <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--c-ink2)' }}>{i.location}</p>}
                    {i.eventNote && <p style={{ margin: '2px 0 0', fontSize: 12, fontStyle: 'italic', color: 'var(--c-ink2)' }}>{i.eventNote}</p>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', color: i.returned ? 'var(--c-green)' : i.loaded ? '#d97706' : i.pronto ? '#059669' : 'var(--c-ink3)' }}>
                    {i.returned ? t('guest.statusReturned') : i.loaded ? t('guest.statusLoaded') : i.pronto ? t('guest.statusReady') : ''}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </details>
    </div>
  )
}
