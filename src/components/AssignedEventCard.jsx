import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate, capitalize } from '../utils/formatDate'
import { downloadIcs, googleCalendarUrl } from '../utils/calendarExport'
import { fetchCalendarFeedUrl } from '../utils/freelance'

// Card di un evento assegnato a una persona esterna (Freelance con account): titolo,
// date e luogo, note e — a tendina — la lista di carico in sola lettura. Usata da FreelanceHome e FreelanceDesktop.
// `shifts` (facoltativo): i turni di quel giorno (orario + fase), mostrati in testa alla card.
// `calendarButtons` (solo Freelance): "Aggiungi al calendario" (abbonamento che apre l'app Calendario e si aggiorna da solo),
// Google Calendar e, a parte, il file .ics del solo evento.
// `listOpen`: la lista di carico parte aperta (colonna di destra della versione desktop).
// `onRespond` (solo Freelance): mostra "Accetto / Non posso" (o lo stato già scelto, con la possibilità di cambiarlo);
// `response` = 'accepted' | 'declined' | null; `canRespond` false per gli eventi già passati.
const PHASE_COLOR = { montaggio: '#2563eb', smontaggio: '#ea580c' }
const PHASE_KEY = { montaggio: 'calendar.legendAssembly', smontaggio: 'calendar.legendDisassembly' }
export const RESPONSE_COLOR = { pending: '#d97706', accepted: '#16a34a', declined: '#dc2626' }
const label = { margin: 0, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--c-ink3)' }
const card = { background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 16, overflow: 'hidden' }

export default function AssignedEventCard({ ev, shifts = [], response = null, onRespond = null, canRespond = true, busy = false, calendarButtons = false, listOpen = false }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const fmt = (d, o) => capitalize(formatDate(`${d}T12:00:00`, o, lang))
  const listName = l => l.name || (l.id === 'main' ? t('eventDetail.mainListName') : t('eventDetail.listUnnamed'))
  const rows = ev.items
  const multiList = ev.lists.length > 1
  const range = ev.dateEnd && ev.dateEnd > ev.date
    ? `${fmt(ev.date, { day: 'numeric', month: 'long' })} → ${fmt(ev.dateEnd, { day: 'numeric', month: 'long' })}`
    : fmt(ev.date, { weekday: 'long', day: 'numeric', month: 'long' })
  const [calBusy, setCalBusy] = useState(false)
  const [calError, setCalError] = useState(false)
  // Abbonamento: webcal:// apre direttamente l'app Calendario (iPhone, Mac, Outlook); da lì in poi gli eventi si aggiornano da soli
  const subscribeCalendar = async () => {
    setCalBusy(true); setCalError(false)
    const url = await fetchCalendarFeedUrl()
    setCalBusy(false)
    if (!url) { setCalError(true); return }
    window.location.href = url.replace(/^https?:/, 'webcal:')
  }
  const phaseName = ph => (PHASE_KEY[ph] ? t(PHASE_KEY[ph]) : '')
  const state = response || 'pending'
  const color = RESPONSE_COLOR[state]
  return (
    <div style={{ ...card, marginBottom: 14, position: 'relative' }}>
      {onRespond && <span aria-hidden="true" style={{ display: 'block', height: 5, background: color }} />}
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
      {onRespond && (
        <div style={{ padding: '12px 14px 14px', borderTop: '1px solid var(--c-line)', background: `${color}12` }}>
          {state === 'pending' && canRespond && (
            <>
              <p style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 800, color }}>{t('freelance.respondQuestion')}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" disabled={busy} onClick={() => onRespond(ev.id, 'accepted')} className="btn-no-anim"
                  style={{ flex: 1, minHeight: 50, borderRadius: 14, background: RESPONSE_COLOR.accepted, color: '#fff', fontSize: 15, fontWeight: 800, opacity: busy ? 0.6 : 1 }}>
                  {t('freelance.accept')}
                </button>
                <button type="button" disabled={busy} onClick={() => onRespond(ev.id, 'declined')} className="btn-no-anim"
                  style={{ flex: 1, minHeight: 50, borderRadius: 14, background: 'transparent', color: RESPONSE_COLOR.declined, border: `2px solid ${RESPONSE_COLOR.declined}`, fontSize: 15, fontWeight: 800, opacity: busy ? 0.6 : 1 }}>
                  {t('freelance.decline')}
                </button>
              </div>
            </>
          )}
          {state === 'pending' && !canRespond && <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: 'var(--c-ink3)' }}>{t('freelance.noAnswer')}</p>}
          {state !== 'pending' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14.5, fontWeight: 800, color }}>{state === 'accepted' ? '✓ ' : '✕ '}{t(state === 'accepted' ? 'freelance.youAccepted' : 'freelance.youDeclined')}</span>
              {canRespond && (
                <button type="button" disabled={busy} onClick={() => onRespond(ev.id, state === 'accepted' ? 'declined' : 'accepted')} className="btn-no-anim"
                  style={{ background: 'transparent', color: 'var(--c-ink2)', fontSize: 13, fontWeight: 700, textDecoration: 'underline', padding: '8px 0' }}>
                  {t(state === 'accepted' ? 'freelance.changeToDecline' : 'freelance.changeToAccept')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {calendarButtons && state !== 'declined' && canRespond && (
        <div style={{ padding: '10px 14px 8px', borderTop: '1px solid var(--c-line)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={calBusy} className="btn-no-anim" onClick={subscribeCalendar}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'var(--c-fill)', color: 'var(--c-ink)', fontSize: 13.5, fontWeight: 800, opacity: calBusy ? 0.6 : 1 }}>
              {t('freelance.addToCalendar')}
            </button>
            <a href={googleCalendarUrl(ev, phaseName)} target="_blank" rel="noopener noreferrer"
              style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'var(--c-fill)', color: 'var(--c-ink)', fontSize: 13.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
              {t('freelance.addToGoogle')}
            </a>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45, color: calError ? RESPONSE_COLOR.declined : 'var(--c-ink3)' }}>
            {calError ? t('freelance.calendarError') : t('freelance.calendarHint')}
            {' '}
            <button type="button" className="btn-no-anim" onClick={() => downloadIcs(ev, phaseName)}
              style={{ background: 'transparent', color: 'var(--c-ink2)', fontSize: 12, fontWeight: 700, textDecoration: 'underline', padding: 0 }}>
              {t('freelance.calendarOnlyThis')}
            </button>
          </p>
        </div>
      )}
      <details open={listOpen || undefined} style={{ borderTop: '1px solid var(--c-line)' }}>
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
