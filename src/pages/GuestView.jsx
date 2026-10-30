import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detectDeviceLanguage } from '../i18n'
import { fetchGuestView } from '../utils/guestLinks'
import { applyTheme, watchSystemTheme } from '../utils/theme'
import { formatDate, capitalize } from '../utils/formatDate'

// Pagina "ospite" per il personale esterno, aperta da un link /ospite/<chiave>
// (vedi api/_guest.js): SOLA LETTURA, senza account né navigazione dell'app.
// Mostra i suoi turni giorno per giorno (con gli orari assegnati a LUI/LEI, non
// quelli dell'evento) e, per ogni evento, i dettagli e la lista di carico.
// È montata da main.jsx fuori da App: niente login, niente provider.
const PHASE_COLOR = { montaggio: '#2563eb', smontaggio: '#ea580c' }
const PHASE_KEY = { montaggio: 'calendar.legendAssembly', smontaggio: 'calendar.legendDisassembly' }

const label = { margin: 0, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--c-ink3)' }
const card = { background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 16, overflow: 'hidden' }

export default function GuestView({ token }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    applyTheme('auto')
    const stop = watchSystemTheme()
    // Un ospite non ha una preferenza salvata: segue la lingua del dispositivo.
    const dl = detectDeviceLanguage()
    if (dl !== 'it') i18n.changeLanguage(dl)
    return stop
  }, [i18n])

  useEffect(() => {
    let live = true
    fetchGuestView(token).then(r => { if (live) setState(r.data ? { data: r.data } : { error: r.error }) })
    return () => { live = false }
  }, [token])

  const fmt = (d, o) => capitalize(formatDate(`${d}T12:00:00`, o, lang))

  // Turni per giorno, dagli eventi e dalle attività libere.
  const days = useMemo(() => {
    const d = state.data
    if (!d) return []
    const map = {}
    const add = (date, entry) => { (map[date] = map[date] || []).push(entry) }
    d.events.forEach(ev => ev.blocks.forEach(b => add(b.date, {
      key: b.id, title: ev.name, place: ev.location, phase: b.phase,
      time: b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : (ev.allDay === false && ev.timeStart ? `${ev.timeStart}–${ev.timeEnd || ''}` : null),
      sort: b.startTime || '99',
    })))
    d.tasks.forEach(tk => add(tk.date, {
      key: tk.id, title: tk.label || t('guest.task'), place: '', phase: null,
      time: tk.startTime && tk.endTime ? `${tk.startTime}–${tk.endTime}` : null, sort: tk.startTime || '99',
    }))
    return Object.keys(map).sort().map(date => ({ date, entries: map[date].sort((a, b) => a.sort.localeCompare(b.sort)) }))
  }, [state.data, t])

  const shell = children => (
    <div style={{ minHeight: '100dvh', background: 'var(--c-sheet, var(--bg))', color: 'var(--c-ink)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px calc(32px + env(safe-area-inset-bottom))' }}>{children}</div>
    </div>
  )

  if (state.loading) return shell(<p style={{ color: 'var(--c-ink2)', textAlign: 'center', marginTop: 80 }}>{t('guest.loading')}</p>)
  if (state.error) {
    return shell(
      <div style={{ textAlign: 'center', marginTop: 80 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>{t(`guest.error_${state.error}_title`)}</h1>
        <p style={{ color: 'var(--c-ink2)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>{t(`guest.error_${state.error}_text`)}</p>
      </div>
    )
  }

  const { guest, team, events, today } = state.data
  const listName = l => l.name || (l.id === 'main' ? t('eventDetail.mainListName') : t('eventDetail.listUnnamed'))

  return shell(
    <>
      <p style={label}>{team.name}</p>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px', letterSpacing: '-0.3px' }}>{t('guest.hello', { name: guest.name })}</h1>
      <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.5, color: 'var(--c-ink2)' }}>{t('guest.intro')}</p>

      {days.length === 0 ? (
        <p style={{ ...card, padding: 18, fontSize: 14, color: 'var(--c-ink2)', textAlign: 'center' }}>{t('guest.empty')}</p>
      ) : (
        <>
          <p style={{ ...label, marginBottom: 10 }}>{t('guest.yourShifts')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            {days.map(day => (
              <div key={day.date} style={card}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--c-line)', background: day.date === today ? 'rgba(230,57,70,0.07)' : 'var(--c-alt)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{fmt(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                  {day.date === today && <span style={{ fontSize: 10, fontWeight: 800, color: '#e63946', background: 'rgba(230,57,70,0.12)', borderRadius: 9, padding: '1px 7px' }}>{t('guest.today')}</span>}
                </div>
                {day.entries.map((e, i) => (
                  <div key={e.key} style={{ padding: '12px 14px', borderTop: i > 0 ? '1px solid var(--c-line)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{e.time || t('guest.allDay')}</span>
                      {e.phase && PHASE_KEY[e.phase] && (
                        <span style={{ fontSize: 11, fontWeight: 800, color: PHASE_COLOR[e.phase], background: `${PHASE_COLOR[e.phase]}18`, borderRadius: 6, padding: '2px 8px' }}>{t(PHASE_KEY[e.phase])}</span>
                      )}
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 600 }}>{e.title}</p>
                    {e.place && <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--c-ink2)' }}>{e.place}</p>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {events.map(ev => {
        const rows = ev.items
        const multiList = ev.lists.length > 1
        const range = ev.dateEnd && ev.dateEnd > ev.date
          ? `${fmt(ev.date, { day: 'numeric', month: 'long' })} → ${fmt(ev.dateEnd, { day: 'numeric', month: 'long' })}`
          : fmt(ev.date, { weekday: 'long', day: 'numeric', month: 'long' })
        return (
          <div key={ev.id} style={{ ...card, marginBottom: 14 }}>
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
      })}

      <p style={{ margin: '22px 0 0', fontSize: 12, color: 'var(--c-ink3)', textAlign: 'center' }}>{t('guest.readOnly')}</p>
    </>
  )
}
