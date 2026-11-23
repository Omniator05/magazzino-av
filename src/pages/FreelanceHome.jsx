import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import LogoutButton from '../components/LogoutButton'
import AssignedEventCard, { RESPONSE_COLOR } from '../components/AssignedEventCard'
import { fetchFreelanceView, respondToEvent } from '../utils/freelance'
import { formatDate, capitalize, monthNames, weekdayInitials } from '../utils/formatDate'

// Home di un account Freelance (personale esterno con login): un calendario del mese, vuoto tranne i giorni in cui è
// assegnato. Toccando un giorno si vedono gli eventi di quel giorno con orari, note e — a tendina — la lista di carico
// (sola lettura). I dati arrivano dal server (api/_freelance.js): il Freelance non ha accesso diretto al database.
const dateStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const rangeDates = (from, to) => {
  const out = []
  const cur = new Date(`${from}T12:00:00`)
  const end = new Date(`${to || from}T12:00:00`)
  while (cur <= end && out.length < 62) { out.push(dateStr(cur)); cur.setDate(cur.getDate() + 1) }
  return out
}

// Calendario grande: su telefono ogni giorno assegnato mostra barrette colorate per stato (da confermare / accettato /
// rifiutato / attività), su schermi più larghi le barrette diventano etichette con il nome dell'evento.
const CAL_CSS = `
.fl-grid { container-type: inline-size; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.fl-cell { min-height: 70px; border-radius: 12px; padding: 5px 4px 5px; display: flex; flex-direction: column; align-items: stretch; gap: 3px; text-align: left; border: 1.5px solid transparent; }
.fl-pill { display: block; height: 7px; border-radius: 4px; overflow: hidden; font-size: 0; line-height: 0; }
.fl-num { align-self: center; min-width: 24px; height: 24px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 14.5px; }
@container (min-width: 430px) {
  .fl-cell { min-height: 92px; padding: 6px 5px; }
  .fl-pill { height: 18px; border-radius: 5px; padding: 0 5px; font-size: 10.5px; line-height: 18px; font-weight: 700; white-space: nowrap; text-overflow: ellipsis; }
  .fl-num { align-self: flex-start; }
}
`
const lastDayOf = ev => (ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date)
const label = { margin: 0, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--c-ink3)' }
const card = { background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 16, overflow: 'hidden' }

export default function FreelanceHome() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const lang = i18n.language
  const [state, setState] = useState({ loading: true })
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [selected, setSelected] = useState(dateStr(now))

  const dayRef = useRef(null)
  const [busyId, setBusyId] = useState(null)
  const [respondError, setRespondError] = useState(false)

  const load = useCallback(() => fetchFreelanceView().then(r => setState(r.data ? { data: r.data } : { error: r.error })), [])
  useEffect(() => {
    load()
    // Riaprendo l'app (o tornando sulla scheda) si rileggono gli eventi: un'assegnazione nuova compare subito.
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // Accetta / rifiuta: la scelta si vede subito, il server la salva e avvisa gli admin; se non va a buon fine torna com'era.
  const respond = async (eventId, response) => {
    const prev = state.data?.events.find(e => e.id === eventId)?.response ?? null
    const setResponse = value => setState(st => (st.data ? { data: { ...st.data, events: st.data.events.map(e => (e.id === eventId ? { ...e, response: value } : e)) } } : st))
    setBusyId(eventId); setRespondError(false)
    setResponse(response)
    const ok = await respondToEvent(eventId, response)
    if (!ok) { setResponse(prev); setRespondError(true) }
    setBusyId(null)
  }

  // Giorno → { events: [{ ev, shifts }], tasks: [] }
  const byDay = useMemo(() => {
    const map = {}
    const slot = date => (map[date] ||= { events: [], tasks: [] })
    const evTime = ev => (ev.allDay === false && ev.timeStart ? `${ev.timeStart}–${ev.timeEnd || ''}` : null)
    ;(state.data?.events || []).forEach(ev => {
      const perDay = {}
      if (ev.noShifts) rangeDates(ev.date, ev.dateEnd).forEach(date => { perDay[date] = [{ key: `${ev.id}-${date}`, time: evTime(ev), phase: null }] })
      else ev.blocks.forEach(b => { (perDay[b.date] ||= []).push({ key: b.id, time: b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : evTime(ev), phase: b.phase }) })
      Object.entries(perDay).forEach(([date, shifts]) => slot(date).events.push({ ev, shifts }))
    })
    ;(state.data?.tasks || []).forEach(tk => slot(tk.date).tasks.push(tk))
    return map
  }, [state.data])

  const fmt = (d, o) => capitalize(formatDate(`${d}T12:00:00`, o, lang))
  const shell = children => (
    <div style={{ minHeight: '100dvh', background: 'var(--c-sheet, var(--bg))', color: 'var(--c-ink)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 12px calc(32px + env(safe-area-inset-bottom))' }}>{children}</div>
    </div>
  )

  if (state.loading) return shell(<p style={{ color: 'var(--c-ink2)', textAlign: 'center', marginTop: 80 }}>{t('guest.loading')}</p>)
  if (state.error) {
    return shell(
      <div style={{ textAlign: 'center', marginTop: 80 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>{t(`freelance.error_${state.error}_title`)}</h1>
        <p style={{ color: 'var(--c-ink2)', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>{t(`freelance.error_${state.error}_text`)}</p>
        {state.error === 'error' && <button type="button" className="btn btn-primary" onClick={() => { setState({ loading: true }); load() }}>{t('freelance.retry')}</button>}
        <div style={{ marginTop: 18 }}><LogoutButton name={profile?.name} className="btn btn-secondary" style={{ padding: '9px 16px', fontSize: 13 }} /></div>
      </div>
    )
  }

  const { me, team, today } = state.data
  const names = monthNames(lang)
  const initials = weekdayInitials(lang)
  // Celle del mese, con la settimana che parte da lunedì
  const first = new Date(cursor.year, cursor.month, 1)
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => dateStr(new Date(cursor.year, cursor.month, i + 1)))]
  const go = delta => setCursor(c => { const d = new Date(c.year, c.month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() } })
  const anyEvent = Object.keys(byDay).length > 0
  const day = byDay[selected]
  // Eventi futuri a cui non ha ancora risposto: avviso in alto, un tocco porta al primo giorno
  const pendingEvents = state.data.events.filter(ev => !ev.response && lastDayOf(ev) >= today)
  const goToPending = () => {
    const firstDate = Object.keys(byDay).sort().find(d => d >= today && byDay[d].events.some(({ ev }) => !ev.response))
    if (!firstDate) return
    setSelected(firstDate)
    setCursor({ year: Number(firstDate.slice(0, 4)), month: Number(firstDate.slice(5, 7)) - 1 })
    // Porta subito alla scheda dell'evento, con i pulsanti per rispondere
    setTimeout(() => dayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  return shell(
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <p style={label}>{team.name}</p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 0', letterSpacing: '-0.3px', overflowWrap: 'anywhere' }}>{t('guest.hello', { name: me.name })}</h1>
        </div>
        <LogoutButton name={me.name} className="btn btn-secondary" style={{ padding: '9px 16px', fontSize: 13, flexShrink: 0 }} />
      </div>

      {pendingEvents.length > 0 && (
        <button type="button" className="btn-no-anim" onClick={goToPending}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left', padding: '13px 14px', marginBottom: 14, borderRadius: 14, background: `${RESPONSE_COLOR.pending}18`, border: `1.5px solid ${RESPONSE_COLOR.pending}`, color: 'var(--c-ink)' }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{t('freelance.toConfirm', { count: pendingEvents.length })}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: RESPONSE_COLOR.pending, whiteSpace: 'nowrap' }}>{t('freelance.toConfirmGo')} ›</span>
        </button>
      )}

      <style>{CAL_CSS}</style>
      <div style={{ ...card, padding: '14px 8px 12px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 12px' }}>
          <button type="button" className="btn-no-anim" onClick={() => go(-1)} aria-label={t('freelance.prevMonth')} style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 18, fontWeight: 800 }}>‹</button>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{names[cursor.month]} {cursor.year}</span>
          <button type="button" className="btn-no-anim" onClick={() => go(1)} aria-label={t('freelance.nextMonth')} style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 18, fontWeight: 800 }}>›</button>
        </div>
        <div className="fl-grid">
          {initials.map((w, i) => <span key={i} style={{ ...label, padding: '2px 0 4px', textAlign: 'center' }}>{w}</span>)}
          {cells.map((date, i) => {
            if (!date) return <span key={`e${i}`} />
            const info = byDay[date]
            const isSel = date === selected, isToday = date === today
            const pills = info ? [
              ...info.events.map(({ ev }) => ({ key: ev.id, text: ev.name, state: ev.response || 'pending' })),
              ...info.tasks.map(tk => ({ key: tk.id, text: tk.label || t('guest.task'), state: 'task' })),
            ] : []
            const count = pills.length
            return (
              <button key={date} type="button" className="fl-cell btn-no-anim" onClick={() => setSelected(date)} aria-pressed={isSel}
                aria-label={`${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}${count ? ` · ${pills.map(p => p.text).join(', ')}` : ''}`}
                style={{ background: info ? 'var(--c-alt)' : 'transparent', borderColor: isSel ? 'var(--c-ink)' : info ? 'var(--c-line)' : 'transparent' }}>
                <span className="fl-num" style={{ background: isToday ? '#e63946' : 'transparent', color: isToday ? '#fff' : 'var(--c-ink)', fontWeight: isToday || info ? 800 : 600 }}>{Number(date.slice(8))}</span>
                {pills.slice(0, 2).map(p => {
                  const color = p.state === 'task' ? '#0066cc' : RESPONSE_COLOR[p.state]
                  const declined = p.state === 'declined'
                  return (
                    <span key={p.key} className="fl-pill" style={{ background: declined ? `${color}22` : color, color: declined ? color : '#fff', boxShadow: declined ? `inset 0 0 0 1.5px ${color}` : 'none', textDecoration: declined ? 'line-through' : 'none' }}>{p.text}</span>
                  )
                })}
                {count > 2 && <span aria-hidden="true" style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--c-ink2)', textAlign: 'center', lineHeight: 1 }}>+{count - 2}</span>}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', padding: '12px 6px 0', fontSize: 11.5, fontWeight: 700, color: 'var(--c-ink2)' }}>
          {[['pending', RESPONSE_COLOR.pending, 'freelance.legendPending'], ['accepted', RESPONSE_COLOR.accepted, 'freelance.legendAccepted'], ['declined', RESPONSE_COLOR.declined, 'freelance.legendDeclined'], ['task', '#0066cc', 'freelance.legendTask']].map(([k, c, key]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{t(key)}</span>
          ))}
        </div>
      </div>

      <p ref={dayRef} style={{ ...label, marginBottom: 10, scrollMarginTop: 12 }}>{fmt(selected, { weekday: 'long', day: 'numeric', month: 'long' })}{selected === today ? ` · ${t('guest.today')}` : ''}</p>
      {!day ? (
        <p style={{ ...card, padding: 18, fontSize: 14, color: 'var(--c-ink2)', textAlign: 'center', lineHeight: 1.5 }}>{anyEvent ? t('freelance.dayEmpty') : t('freelance.nothingYet')}</p>
      ) : (
        <>
          {respondError && <p role="alert" style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 700, color: RESPONSE_COLOR.declined }}>{t('freelance.respondError')}</p>}
          {day.events.map(({ ev, shifts }) => (
            <AssignedEventCard key={ev.id} ev={ev} shifts={shifts} response={ev.response} busy={busyId === ev.id}
              canRespond={lastDayOf(ev) >= today} onRespond={respond} calendarButtons />
          ))}
          {day.tasks.map(tk => (
            <div key={tk.id} style={{ ...card, padding: '12px 14px', marginBottom: 14 }}>
              <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{tk.startTime && tk.endTime ? `${tk.startTime}–${tk.endTime}` : t('guest.allDay')}</span>
              <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 600 }}>{tk.label || t('guest.task')}</p>
            </div>
          ))}
        </>
      )}
    </>
  )
}
