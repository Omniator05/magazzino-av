import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import LogoutButton from '../components/LogoutButton'
import AssignedEventCard from '../components/AssignedEventCard'
import { fetchFreelanceView } from '../utils/freelance'
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

  const load = useCallback(() => fetchFreelanceView().then(r => setState(r.data ? { data: r.data } : { error: r.error })), [])
  useEffect(() => {
    load()
    // Riaprendo l'app (o tornando sulla scheda) si rileggono gli eventi: un'assegnazione nuova compare subito.
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

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
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px calc(32px + env(safe-area-inset-bottom))' }}>{children}</div>
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

  return shell(
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <p style={label}>{team.name}</p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 0', letterSpacing: '-0.3px', overflowWrap: 'anywhere' }}>{t('guest.hello', { name: me.name })}</h1>
        </div>
        <LogoutButton name={me.name} className="btn btn-secondary" style={{ padding: '9px 16px', fontSize: 13, flexShrink: 0 }} />
      </div>

      <div style={{ ...card, padding: '14px 12px 12px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 10px' }}>
          <button type="button" className="btn-no-anim" onClick={() => go(-1)} aria-label={t('freelance.prevMonth')} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 16, fontWeight: 800 }}>‹</button>
          <span style={{ fontSize: 15.5, fontWeight: 800 }}>{names[cursor.month]} {cursor.year}</span>
          <button type="button" className="btn-no-anim" onClick={() => go(1)} aria-label={t('freelance.nextMonth')} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 16, fontWeight: 800 }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
          {initials.map((w, i) => <span key={i} style={{ ...label, padding: '4px 0 6px' }}>{w}</span>)}
          {cells.map((date, i) => {
            if (!date) return <span key={`e${i}`} />
            const info = byDay[date]
            const isSel = date === selected, isToday = date === today
            return (
              <button key={date} type="button" className="btn-no-anim" onClick={() => setSelected(date)} aria-pressed={isSel}
                aria-label={`${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}${info ? ` · ${(info.events.length + info.tasks.length)}` : ''}`}
                style={{ height: 46, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, border: isToday && !isSel ? '1.5px solid #e63946' : '1.5px solid transparent',
                  background: isSel ? '#e63946' : 'transparent', color: isSel ? '#fff' : isToday ? '#e63946' : 'var(--c-ink)', fontSize: 14.5, fontWeight: isSel || isToday || info ? 800 : 600 }}>
                <span>{Number(date.slice(8))}</span>
                <span aria-hidden="true" style={{ display: 'flex', gap: 3, height: 5 }}>
                  {info?.events.length > 0 && <span style={{ width: 5, height: 5, borderRadius: '50%', background: isSel ? '#fff' : '#e63946' }} />}
                  {info?.tasks.length > 0 && <span style={{ width: 5, height: 5, borderRadius: '50%', background: isSel ? '#fff' : '#0066cc' }} />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <p style={{ ...label, marginBottom: 10 }}>{fmt(selected, { weekday: 'long', day: 'numeric', month: 'long' })}{selected === today ? ` · ${t('guest.today')}` : ''}</p>
      {!day ? (
        <p style={{ ...card, padding: 18, fontSize: 14, color: 'var(--c-ink2)', textAlign: 'center', lineHeight: 1.5 }}>{anyEvent ? t('freelance.dayEmpty') : t('freelance.nothingYet')}</p>
      ) : (
        <>
          {day.events.map(({ ev, shifts }) => <AssignedEventCard key={ev.id} ev={ev} shifts={shifts} />)}
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
