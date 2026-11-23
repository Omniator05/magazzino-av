import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LogoutButton from './LogoutButton'
import AssignedEventCard, { RESPONSE_COLOR } from './AssignedEventCard'
import { formatDate, capitalize, monthNames, weekdayInitials } from '../utils/formatDate'

// Home del Freelance su schermi larghi: tre colonne come un'agenda da scrivania. A sinistra il mese (per saltare di
// settimana) e il riepilogo, al centro la settimana con gli eventi sulle ore, a destra il dettaglio di ciò che si
// seleziona (risposta, orari, note, lista di carico aperta). I dati e le azioni arrivano da FreelanceHome.
const PX = 52 // altezza di un'ora nella griglia
const STEP = 18 // eventi sovrapposti: ognuno parte il 18% più a destra del precedente (a cascata), non stretto in colonna
const dateStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return dateStr(d) }
const mondayOf = s => { const d = new Date(`${s}T12:00:00`); return addDays(s, -((d.getDay() + 6) % 7)) }
const toMin = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0) }
const TASK_COLOR = '#0066cc'
const PHASE_KEY = { montaggio: 'calendar.legendAssembly', smontaggio: 'calendar.legendDisassembly' }
const label = { margin: 0, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--c-ink3)' }
const iconBtn = { width: 34, height: 34, borderRadius: 10, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 17, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }

const CSS = `
.fl-d-btn:focus-visible { outline: 2px solid #e63946; outline-offset: 2px; }
.fl-d-col { scrollbar-width: thin; }
.fl-d-block { transition: box-shadow .12s ease, background .12s ease; }
.fl-d-block:hover { box-shadow: 0 2px 10px rgba(0,0,0,.12); }
@media (prefers-reduced-motion: reduce) { .fl-d-block { transition: none; } }
`

// Affianca i blocchi che si sovrappongono nello stesso giorno: a ogni blocco una corsia (lane) e il numero di corsie del gruppo.
function layoutDay(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const out = []
  let group = [], lanes = [], groupEnd = -1
  const flush = () => { group.forEach(g => { g.cols = Math.max(1, lanes.length) }); out.push(...group); group = []; lanes = []; groupEnd = -1 }
  sorted.forEach(it => {
    if (group.length && it.start >= groupEnd) flush()
    let lane = lanes.findIndex(end => end <= it.start)
    if (lane === -1) { lane = lanes.length; lanes.push(it.end) } else lanes[lane] = it.end
    group.push({ ...it, lane })
    groupEnd = Math.max(groupEnd, it.end)
  })
  flush()
  return out
}

export default function FreelanceDesktop({ data, byDay, respond, busyId, respondError }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { me, team, today } = data
  const events = data.events
  const fmt = (d, o) => capitalize(formatDate(`${d}T12:00:00`, o, lang))
  const names = monthNames(lang)
  const initials = weekdayInitials(lang)

  const [weekStart, setWeekStart] = useState(() => mondayOf(today))
  const [mini, setMini] = useState(() => { const d = new Date(`${today}T12:00:00`); return { year: d.getFullYear(), month: d.getMonth() } })
  const [sel, setSel] = useState(null) // { kind: 'event' | 'task', id, date }
  const bodyRef = useRef(null)

  // L'ora corrente per la linea rossa di oggi, aggiornata ogni minuto
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })
  useEffect(() => {
    const id = setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()) }, 60000)
    return () => clearInterval(id)
  }, [])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  // Per ogni giorno della settimana: blocchi con orario (da disporre sulle ore) e voci "tutto il giorno"
  const week = useMemo(() => {
    const timedAll = []
    const perDay = days.map(date => {
      const info = byDay[date] || { events: [], tasks: [] }
      const timed = [], allDay = []
      info.events.forEach(({ ev, shifts }) => shifts.forEach(sh => {
        const base = { key: `e-${sh.key}`, kind: 'event', id: ev.id, date, name: ev.name, state: ev.response || 'pending', phase: sh.phase }
        const m = sh.time && /^(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})?/.exec(sh.time)
        if (m) {
          const start = toMin(m[1])
          const end = m[2] ? toMin(m[2]) : start + 60
          timed.push({ ...base, time: sh.time, start, end: end > start ? end : 24 * 60 })
        } else allDay.push(base)
      }))
      info.tasks.forEach(tk => {
        const base = { key: `t-${tk.id}`, kind: 'task', id: tk.id, date, name: tk.label || t('guest.task'), state: 'task', phase: null }
        if (tk.startTime && tk.endTime) {
          const start = toMin(tk.startTime), end = toMin(tk.endTime)
          timed.push({ ...base, time: `${tk.startTime}–${tk.endTime}`, start, end: end > start ? end : 24 * 60 })
        } else allDay.push(base)
      })
      timed.forEach(x => timedAll.push(x))
      return { date, timed: layoutDay(timed), allDay }
    })
    const startH = Math.max(0, Math.min(8, timedAll.length ? Math.floor(Math.min(...timedAll.map(x => x.start)) / 60) : 8))
    const endH = Math.min(24, Math.max(19, timedAll.length ? Math.ceil(Math.max(...timedAll.map(x => x.end)) / 60) : 19))
    const firstStart = timedAll.length ? Math.min(...timedAll.map(x => x.start)) : 9 * 60
    return { perDay, startH, endH, firstStart }
  }, [days, byDay, t])

  // Cambiando settimana la griglia scorre al primo impegno (o alle 9 se la settimana è vuota)
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = Math.max(0, ((week.firstStart - week.startH * 60) * PX) / 60 - 24)
  }, [weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const goWeek = start => {
    setWeekStart(start)
    const d = new Date(`${addDays(start, 3)}T12:00:00`)
    setMini({ year: d.getFullYear(), month: d.getMonth() })
  }
  const goDate = date => { goWeek(mondayOf(date)) }

  // Primo evento da oggi in poi a cui non ha ancora risposto
  const pending = events.filter(ev => !ev.response && (ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date) >= today)
  const firstPendingDate = Object.keys(byDay).sort().find(d => d >= today && byDay[d].events.some(({ ev }) => !ev.response))
  const goPending = () => {
    if (!firstPendingDate) return
    goDate(firstPendingDate)
    const hit = byDay[firstPendingDate].events.find(({ ev }) => !ev.response)
    if (hit) setSel({ kind: 'event', id: hit.ev.id, date: firstPendingDate })
  }

  // Mese piccolo a sinistra: settimana che parte da lunedì, con la settimana mostrata evidenziata
  const first = new Date(mini.year, mini.month, 1)
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(mini.year, mini.month + 1, 0).getDate()
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => dateStr(new Date(mini.year, mini.month, i + 1)))]
  const goMini = delta => setMini(c => { const d = new Date(c.year, c.month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() } })

  const colorOf = state => (state === 'task' ? TASK_COLOR : RESPONSE_COLOR[state])
  const isSel = b => !!sel && sel.kind === b.kind && sel.id === b.id && sel.date === b.date
  const rangeLabel = (() => {
    const a = new Date(`${weekStart}T12:00:00`), b = new Date(`${addDays(weekStart, 6)}T12:00:00`)
    return a.getMonth() === b.getMonth() ? `${names[a.getMonth()]} ${a.getFullYear()}` : `${names[a.getMonth()].slice(0, 3)} – ${names[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`
  })()

  // Dettaglio a destra
  const selEvent = sel?.kind === 'event' ? events.find(e => e.id === sel.id) : null
  const selShifts = selEvent ? (byDay[sel.date]?.events.find(x => x.ev.id === selEvent.id)?.shifts || []) : []
  const selTask = sel?.kind === 'task' ? byDay[sel.date]?.tasks.find(tk => tk.id === sel.id) : null
  const selLast = selEvent ? (selEvent.dateEnd && selEvent.dateEnd >= selEvent.date ? selEvent.dateEnd : selEvent.date) : null

  const hours = Array.from({ length: week.endH - week.startH }, (_, i) => week.startH + i)
  const gridH = (week.endH - week.startH) * PX
  const gutter = 52

  return (
    <div style={{ height: '100dvh', display: 'grid', gridTemplateColumns: 'clamp(208px, 18vw, 264px) minmax(0, 1fr) clamp(320px, 28vw, 400px)', background: 'var(--c-sheet, var(--bg))', color: 'var(--c-ink)', overflow: 'hidden' }}>
      <style>{CSS}</style>

      {/* ── Sinistra: chi sono, mese, riepilogo ── */}
      <aside className="fl-d-col" style={{ overflowY: 'auto', padding: '22px 16px 20px', borderInlineEnd: '1px solid var(--c-line)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <p style={label}>{team.name}</p>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: '4px 0 0', letterSpacing: '-0.2px', overflowWrap: 'anywhere' }}>{t('guest.hello', { name: me.name })}</h1>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{names[mini.month]} {mini.year}</span>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="btn-no-anim fl-d-btn" onClick={() => goMini(-1)} aria-label={t('freelance.prevMonth')} style={{ ...iconBtn, width: 28, height: 28, fontSize: 15 }}>‹</button>
              <button type="button" className="btn-no-anim fl-d-btn" onClick={() => goMini(1)} aria-label={t('freelance.nextMonth')} style={{ ...iconBtn, width: 28, height: 28, fontSize: 15 }}>›</button>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 2 }}>
            {initials.map((w, i) => <span key={i} style={{ ...label, textAlign: 'center', padding: '2px 0 4px', fontSize: 10 }}>{w}</span>)}
            {cells.map((date, i) => {
              if (!date) return <span key={`e${i}`} />
              const info = byDay[date]
              const inWeek = days.includes(date)
              const dow = (new Date(`${date}T12:00:00`).getDay() + 6) % 7
              const isToday = date === today
              const dots = info ? [...new Set([...info.events.map(({ ev }) => ev.response || 'pending'), ...(info.tasks.length ? ['task'] : [])])].slice(0, 3) : []
              return (
                <button key={date} type="button" className="btn-no-anim fl-d-btn" onClick={() => goDate(date)}
                  aria-label={fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })} aria-current={isToday ? 'date' : undefined}
                  style={{ height: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: inWeek ? 'var(--c-fill)' : 'transparent',
                    borderRadius: inWeek ? `${dow === 0 ? 10 : 0}px ${dow === 6 ? 10 : 0}px ${dow === 6 ? 10 : 0}px ${dow === 0 ? 10 : 0}px` : 0 }}>
                  <span style={{ minWidth: 22, height: 22, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: isToday || info ? 800 : 600, background: isToday ? '#e63946' : 'transparent', color: isToday ? '#fff' : 'var(--c-ink)' }}>{Number(date.slice(8))}</span>
                  <span style={{ display: 'flex', gap: 2, height: 4 }}>{dots.map(s => <span key={s} style={{ width: 4, height: 4, borderRadius: 2, background: colorOf(s) }} />)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {pending.length > 0 && (
          <button type="button" className="btn-no-anim fl-d-btn" onClick={goPending}
            style={{ textAlign: 'left', padding: '12px 12px', borderRadius: 12, background: `${RESPONSE_COLOR.pending}18`, border: `1.5px solid ${RESPONSE_COLOR.pending}`, color: 'var(--c-ink)' }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800 }}>{t('freelance.toConfirm', { count: pending.length })}</span>
            <span style={{ display: 'block', marginTop: 3, fontSize: 12.5, fontWeight: 800, color: RESPONSE_COLOR.pending }}>{t('freelance.toConfirmGo')} ›</span>
          </button>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink2)' }}>
          {[['pending', 'freelance.legendPending'], ['accepted', 'freelance.legendAccepted'], ['declined', 'freelance.legendDeclined'], ['task', 'freelance.legendTask']].map(([k, key]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(k) }} />{t(key)}</span>
          ))}
        </div>

        <div style={{ marginTop: 'auto' }}>
          <LogoutButton name={me.name} className="btn btn-secondary" style={{ padding: '9px 16px', fontSize: 13, width: '100%' }} />
        </div>
      </aside>

      {/* ── Centro: la settimana ── */}
      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--c-surface)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 22px 12px' }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.4px' }}>{rangeLabel}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" className="btn-no-anim fl-d-btn" onClick={() => goWeek(mondayOf(today))}
              style={{ height: 34, padding: '0 14px', borderRadius: 10, background: 'var(--c-fill)', color: 'var(--c-ink)', fontSize: 13.5, fontWeight: 800 }}>{t('guest.today')}</button>
            <button type="button" className="btn-no-anim fl-d-btn" onClick={() => goWeek(addDays(weekStart, -7))} aria-label={t('freelance.prevWeek')} style={iconBtn}>‹</button>
            <button type="button" className="btn-no-anim fl-d-btn" onClick={() => goWeek(addDays(weekStart, 7))} aria-label={t('freelance.nextWeek')} style={iconBtn}>›</button>
          </div>
        </header>

        {/* Intestazione dei giorni + voci "tutto il giorno" */}
        <div style={{ display: 'grid', gridTemplateColumns: `${gutter}px repeat(7, minmax(0, 1fr))`, borderBottom: '1px solid var(--c-line)', paddingInlineEnd: 8 }}>
          <span />
          {week.perDay.map(({ date, allDay }) => {
            const isToday = date === today
            return (
              <div key={date} style={{ padding: '4px 4px 8px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px 6px' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: isToday ? '#e63946' : 'var(--c-ink2)' }}>{fmt(date, { weekday: 'short' })}</span>
                  <span style={{ minWidth: 26, height: 26, borderRadius: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14.5, fontWeight: 800, background: isToday ? '#e63946' : 'transparent', color: isToday ? '#fff' : 'var(--c-ink)' }}>{Number(date.slice(8))}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {allDay.map(b => {
                    const c = colorOf(b.state), declined = b.state === 'declined'
                    return (
                      <button key={b.key} type="button" className="btn-no-anim fl-d-btn fl-d-block" onClick={() => setSel({ kind: b.kind, id: b.id, date: b.date })}
                        aria-pressed={isSel(b)} title={b.name}
                        style={{ textAlign: 'left', padding: '3px 7px', borderRadius: 6, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          background: declined ? 'transparent' : c, color: declined ? c : '#fff', boxShadow: isSel(b) ? '0 0 0 2px var(--c-ink)' : declined ? `inset 0 0 0 1.5px ${c}` : 'none', textDecoration: declined ? 'line-through' : 'none' }}>
                        {b.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Griglia delle ore */}
        <div ref={bodyRef} className="fl-d-col" style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `${gutter}px repeat(7, minmax(0, 1fr))`, height: gridH, position: 'relative', paddingInlineEnd: 8 }}>
            <div style={{ position: 'relative' }}>
              {hours.map((h, i) => (
                <span key={h} style={{ position: 'absolute', top: i * PX - 7, insetInlineEnd: 8, fontSize: 11, fontWeight: 700, color: 'var(--c-ink3)', fontVariantNumeric: 'tabular-nums', visibility: i === 0 ? 'hidden' : 'visible' }}>{String(h).padStart(2, '0')}:00</span>
              ))}
            </div>
            {week.perDay.map(({ date, timed }) => (
              <div key={date} style={{ position: 'relative', borderInlineStart: '1px solid var(--c-line)', background: date === today ? 'rgba(230,57,70,0.035)' : 'transparent' }}>
                {hours.map((h, i) => <span key={h} aria-hidden="true" style={{ position: 'absolute', insetInline: 0, top: i * PX, borderTop: i === 0 ? 'none' : '1px solid var(--c-line)' }} />)}
                {date === today && nowMin >= week.startH * 60 && nowMin <= week.endH * 60 && (
                  <span aria-hidden="true" style={{ position: 'absolute', insetInline: 0, top: ((nowMin - week.startH * 60) * PX) / 60, height: 2, background: '#e63946', zIndex: 3 }}>
                    <span style={{ position: 'absolute', insetInlineStart: -4, top: -3, width: 8, height: 8, borderRadius: 4, background: '#e63946' }} />
                  </span>
                )}
                {timed.map(b => {
                  const c = colorOf(b.state), declined = b.state === 'declined'
                  const top = ((Math.max(b.start, week.startH * 60) - week.startH * 60) * PX) / 60
                  const height = Math.max(22, ((Math.min(b.end, week.endH * 60) - Math.max(b.start, week.startH * 60)) * PX) / 60 - 2)
                  const selected = isSel(b)
                  return (
                    <button key={b.key} type="button" className="btn-no-anim fl-d-btn fl-d-block" onClick={() => setSel({ kind: b.kind, id: b.id, date: b.date })}
                      aria-pressed={selected} aria-label={`${b.name}, ${b.time}`}
                      style={{ position: 'absolute', top, height, insetInlineStart: `calc(${b.lane * STEP}% + 2px)`, width: `calc(${b.cols === 1 ? 100 : Math.max(55, 100 - (b.cols - 1) * STEP)}% - 4px)`, zIndex: selected ? 10 : b.lane + 1,
                        textAlign: 'left', padding: '4px 6px 4px 8px', borderRadius: 8, overflow: 'hidden',
                        background: declined ? 'var(--c-surface)' : `${c}${selected ? '33' : '1f'}`, color: 'var(--c-ink)',
                        borderInlineStart: `3px solid ${c}`, boxShadow: selected ? `0 0 0 2px ${c}` : declined ? `inset 0 0 0 1px ${c}66` : 'none' }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 800, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: height < 40 ? 'nowrap' : 'normal', textDecoration: declined ? 'line-through' : 'none' }}>{b.name}</span>
                      {height >= 38 && <span style={{ display: 'block', marginTop: 1, fontSize: 11, fontWeight: 700, color: 'var(--c-ink2)', fontVariantNumeric: 'tabular-nums' }}>{b.time}</span>}
                      {height >= 58 && b.phase && PHASE_KEY[b.phase] && <span style={{ display: 'block', marginTop: 1, fontSize: 10.5, fontWeight: 800, color: c }}>{t(PHASE_KEY[b.phase])}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Destra: dettaglio ── */}
      <aside className="fl-d-col" style={{ overflowY: 'auto', padding: '22px 18px 28px', borderInlineStart: '1px solid var(--c-line)' }}>
        {respondError && <p role="alert" style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 700, color: RESPONSE_COLOR.declined }}>{t('freelance.respondError')}</p>}
        {selEvent ? (
          <>
            <p style={{ ...label, marginBottom: 10 }}>{fmt(sel.date, { weekday: 'long', day: 'numeric', month: 'long' })}{sel.date === today ? ` · ${t('guest.today')}` : ''}</p>
            <AssignedEventCard key={`${selEvent.id}-${sel.date}`} ev={selEvent} shifts={selShifts} response={selEvent.response} busy={busyId === selEvent.id}
              canRespond={selLast >= today} onRespond={respond} calendarButtons listOpen />
          </>
        ) : selTask ? (
          <>
            <p style={{ ...label, marginBottom: 10 }}>{fmt(sel.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 16, padding: '14px 14px' }}>
              <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{selTask.startTime && selTask.endTime ? `${selTask.startTime}–${selTask.endTime}` : t('guest.allDay')}</span>
              <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 700 }}>{selTask.label || t('guest.task')}</p>
            </div>
          </>
        ) : (
          <div style={{ marginTop: 60, textAlign: 'center', color: 'var(--c-ink2)', fontSize: 14, lineHeight: 1.55, padding: '0 12px' }}>
            {events.length === 0 && (data.tasks || []).length === 0 ? t('freelance.nothingYet') : t('freelance.pickEvent')}
          </div>
        )}
      </aside>
    </div>
  )
}
