import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import LogoutButton from '../components/LogoutButton'
import { useSwipeMonth } from '../hooks/useSwipeMonth'
import { deleteStorageFile } from '../utils/brasserieStorage'

// La grafica "Next" serve solo per la serata a cui è legata: passata questa
// finestra di grazia dalla data dell'evento, viene eliminata da Storage per
// non far crescere inutilmente lo spazio occupato
const NEXT_GRAPHIC_RETENTION_DAYS = 7

// Config di default se l'admin non ha ancora impostato nulla per questo organizzatore
// (mantiene il comportamento storico di Brasserie: ogni giovedì fino al 17/09/2026)
const DEFAULT_ORG_CONFIG = { eventName: 'Brasserie', frequency: 'weekly', weekday: 4, monthDay: 1, endDate: '2026-09-17', customDates: [] }

function isEventDay(ymd, dateObj, config) {
  if (config.frequency === 'weekly') {
    if (dateObj.getDay() !== config.weekday) return false
    return !config.endDate || ymd <= config.endDate
  }
  if (config.frequency === 'monthly') {
    if (dateObj.getDate() !== config.monthDay) return false
    return !config.endDate || ymd <= config.endDate
  }
  if (config.frequency === 'custom') {
    return (config.customDates || []).includes(ymd)
  }
  return false
}

const greeting = () => {
  const h = new Date().getHours()
  if (h < 5)  return 'Buonanotte'
  if (h < 12) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const pad = n => String(n).padStart(2, '0')
const toYMD = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const todayYMD = () => { const t = new Date(); return toYMD(t.getFullYear(), t.getMonth(), t.getDate()) }

// Griglia con celle "vuote" (prima/dopo il mese) marcate, per lo stile compatto stile Calendar.jsx
function monthCells(year, month) {
  const first = new Date(year, month, 1)
  const startDay = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  const prevMonthDays = new Date(year, month, 0).getDate()
  for (let i = startDay - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, current: false, dateObj: new Date(year, month - 1, prevMonthDays - i) })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true, dateObj: new Date(year, month, d) })
  while (cells.length % 7 !== 0) {
    const nextIdx = cells.length - startDay - daysInMonth + 1
    cells.push({ day: nextIdx, current: false, dateObj: new Date(year, month + 1, nextIdx) })
  }
  return cells
}

export default function BrasserieHome({ onSelectDate }) {
  const { user, profile } = useAuth()
  const config = profile?.organizerConfig || DEFAULT_ORG_CONFIG
  const [weeks, setWeeks] = useState([])
  const [weather, setWeather] = useState(() => {
    try { return JSON.parse(localStorage.getItem('weatherCache')) } catch { return null }
  })
  const init = new Date()
  const [view, setView] = useState({ year: init.getFullYear(), month: init.getMonth() })
  const [selectedDate, setSelectedDate] = useState(null)

  const displayName = profile?.name?.split(' ')[0] || profile?.username || 'Organizzatore'
  const todayLabel = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  const today = todayYMD()

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'brasserieWeeks'), where('organizerId', '==', user.uid), orderBy('date'))
    return onSnapshot(q, snap => setWeeks(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [user])

  // Pulizia grafiche "Next" ormai scadute (settimane passate da più di NEXT_GRAPHIC_RETENTION_DAYS giorni)
  useEffect(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - NEXT_GRAPHIC_RETENTION_DAYS)
    const cutoffYMD = toYMD(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate())
    weeks.forEach(w => {
      if (w.nextGraphic?.path && w.date < cutoffYMD) {
        deleteStorageFile(w.nextGraphic.path).finally(() => {
          updateDoc(doc(db, 'brasserieWeeks', w.id), { nextGraphic: null }).catch(() => {})
        })
      }
    })
  }, [weeks])

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=46.4983&longitude=11.3548&current=weather_code,temperature_2m&timezone=Europe/Rome')
      .then(r => r.json())
      .then(d => {
        const w = { code: d.current.weather_code, temp: Math.round(d.current.temperature_2m) }
        setWeather(w)
        localStorage.setItem('weatherCache', JSON.stringify(w))
      })
      .catch(() => {})
  }, [])

  const weeksByDate = {}
  weeks.forEach(w => { weeksByDate[w.date] = w })

  const prevMonth = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 })
  const nextMonth = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 })
  const swipeMonth = useSwipeMonth(prevMonth, nextMonth)

  const cells = monthCells(view.year, view.month)
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null
  const selectedWeek = selectedDate ? weeksByDate[selectedDate] : null
  const selectedIsEventDay = selectedDate && selectedDateObj ? isEventDay(selectedDate, selectedDateObj, config) : false

  // Posizione corpo celeste basata sull'orario (stesso stile hero della dashboard/home)
  const _now = new Date()
  const _h = _now.getHours() + _now.getMinutes() / 60
  const _DAY_START = 6, _DAY_END = 20
  const _isDay = _h >= _DAY_START && _h < _DAY_END
  const _prog = _isDay
    ? (_h - _DAY_START) / (_DAY_END - _DAY_START)
    : (_h >= _DAY_END ? _h - _DAY_END : _h + (24 - _DAY_END)) / (24 - _DAY_END + _DAY_START)
  const _cx = 5 + _prog * 90
  const _cy = 82 - Math.sin(_prog * Math.PI) * 72

  const _bg = _h >= 5 && _h < 7   ? 'linear-gradient(135deg,#2a3560 0%,#18234a 100%)'
            : _h >= 7 && _h < 17  ? 'linear-gradient(135deg,#3b4a66 0%,#222c42 100%)'
            : _h >= 17 && _h < 20 ? 'linear-gradient(135deg,#3a2f58 0%,#201730 100%)'
                                  : 'linear-gradient(135deg,#1a2240 0%,#0d1525 100%)'

  const _wc = weather?.code ?? -1
  const _wCond = _wc < 0 ? 'clear'
    : _wc <= 1  ? 'clear'
    : _wc === 2 ? 'partly'
    : _wc === 3 ? 'overcast'
    : _wc === 45 || _wc === 48 ? 'fog'
    : (_wc >= 71 && _wc <= 77) ? 'snow'
    : (_wc >= 51 && _wc <= 67) || (_wc >= 80 && _wc <= 82) ? 'rain'
    : _wc >= 95 ? 'storm'
    : 'clear'
  const _showCelestial = _wCond === 'clear' || _wCond === 'partly'
  const _cloudOpMult   = _wCond === 'overcast' ? 3 : _wCond === 'partly' ? 1.6 : 1

  return (
    <div className="page bh-page">
      {/* Header hero (card) — stesso stile del resto dell'app */}
      <div style={{ position: 'relative', overflow: 'hidden', background: _bg, margin: 'calc(env(safe-area-inset-top) + 24px) 16px 18px', padding: '26px 22px', borderRadius: 26, boxShadow: '0 12px 32px rgba(34,44,66,0.26)' }}>
        <div style={{ position: 'absolute', top: '-55%', right: '-6%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, transparent 65%)', animation: 'bhOrb1 14s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-70%', left: '-5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,0,0,0.18) 0%, transparent 65%)', animation: 'bhOrb2 18s ease-in-out infinite', pointerEvents: 'none' }} />

        {_showCelestial && (
          <div style={{
            position: 'absolute', pointerEvents: 'none', zIndex: 0,
            left: `${_cx}%`, top: `${_cy}%`, transform: 'translate(-50%,-50%)',
            width: _isDay ? 100 : 72, height: _isDay ? 100 : 72, borderRadius: '50%',
            background: _isDay
              ? 'radial-gradient(circle, rgba(255,230,100,0.95) 0%, rgba(255,190,50,0.65) 45%, transparent 72%)'
              : 'radial-gradient(circle, rgba(210,220,255,0.90) 0%, rgba(170,190,245,0.55) 45%, transparent 72%)',
            filter: `blur(${_isDay ? 22 : 17}px)`,
          }} />
        )}

        {!_isDay && _showCelestial && [
          { l: '8%', t: '22%', s: 2, dur: '3.2s', d: '0s' },
          { l: '22%', t: '48%', s: 1.5, dur: '4.6s', d: '-1.5s' },
          { l: '38%', t: '14%', s: 2.5, dur: '2.9s', d: '-0.8s' },
          { l: '65%', t: '24%', s: 2, dur: '3.7s', d: '-3s' },
          { l: '88%', t: '18%', s: 2, dur: '3.4s', d: '-2.5s' },
        ].map((s, i) => (
          <div key={i} style={{ position: 'absolute', pointerEvents: 'none', zIndex: 0, left: s.l, top: s.t, width: s.s, height: s.s, borderRadius: '50%', background: 'white', animation: `bhStarTwinkle ${s.dur} ease-in-out infinite ${s.d}` }} />
        ))}

        {(_isDay || _wCond === 'overcast') && _wCond !== 'rain' && _wCond !== 'storm' && _wCond !== 'snow' && _wCond !== 'fog' && [
          { l: '-12%', t: '22%', w: 88, h: 26, op: 0.09, dur: '28s', d: '0s' },
          { l: '35%', t: '55%', w: 68, h: 20, op: 0.07, dur: '40s', d: '-15s' },
          { l: '62%', t: '8%', w: 54, h: 18, op: 0.08, dur: '33s', d: '-8s' },
        ].map((c, i) => (
          <div key={i} style={{ position: 'absolute', pointerEvents: 'none', zIndex: 0, left: c.l, top: c.t, width: c.w, height: c.h, borderRadius: '50%', background: 'white', opacity: Math.min(c.op * _cloudOpMult, 0.32), filter: 'blur(9px)', animation: `bhCloudDrift ${c.dur} linear infinite ${c.d}` }} />
        ))}

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 2 }}>{greeting()},</p>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'white', lineHeight: 1.08, letterSpacing: '-0.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</h1>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.72)', fontWeight: 500, marginTop: 4, textTransform: 'capitalize' }}>{todayLabel}{weather ? ` · ${weather.temp}°C` : ''}</p>
          </div>
          <LogoutButton name={displayName} style={{ flexShrink: 0, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: 12, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }} />
        </div>
      </div>

      <style>{`
        @keyframes bhOrb1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-20px,16px) scale(1.1)} }
        @keyframes bhOrb2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(22px,-14px) scale(0.92)} }
        @keyframes bhStarTwinkle { 0%,100%{opacity:0.85;transform:scale(1)} 50%{opacity:0.15;transform:scale(0.5)} }
        @keyframes bhCloudDrift  { from{transform:translateX(0)} to{transform:translateX(130vw)} }
        @keyframes bhGridIn { from{opacity:0;transform:translateX(6px)} to{opacity:1;transform:translateX(0)} }
        .bh-day:not(:disabled):hover { background: var(--card2) !important; }
        .bh-nav-btn:hover { opacity: 0.65; }
        .bh-grid-anim { animation: bhGridIn 0.2s ease; touch-action: pan-y; }

        @media (min-width: 700px) {
          .bh-page .bh-content { max-width: 640px; margin-left: auto; margin-right: auto; }
          .bh-subtitle { font-size: 24px !important; text-align: center !important; }
          .bh-weekday { font-size: 13px !important; padding: 8px 0 !important; }
          .bh-nav-btn { width: 40px !important; height: 40px !important; font-size: 20px !important; }
          .bh-month-label { font-size: 17px !important; }
          .bh-grid { gap: 8px !important; }
          .bh-day { min-height: 78px !important; border-radius: 14px !important; padding: 8px 4px !important; }
          .bh-day-number { font-size: 15px !important; }
          .bh-dot { width: 10px !important; height: 10px !important; }
        }
      `}</style>

      <div className="bh-content" style={{ padding: '0 16px 16px' }}>
        <p className="bh-subtitle" style={{ color: 'var(--text)', fontSize: 19, fontWeight: 800, letterSpacing: '-0.3px', marginBottom: 16 }}>Scegli la data del tuo evento e aggiungi contenuti.</p>
        {/* Header giorni settimana */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 6 }}>
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="bh-weekday" style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text2)', padding: '6px 0' }}>{w}</div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button className="bh-nav-btn" onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>‹</button>
          <span className="bh-month-label" style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', textTransform: 'capitalize' }}>{MONTHS[view.month]} {view.year}</span>
          <button className="bh-nav-btn" onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>›</button>
        </div>

        {/* Griglia mese — celle compatte, un puntino colorato per il giorno evento; swipe orizzontale per cambiare mese */}
        <div key={`${view.year}-${view.month}`} className="bh-grid bh-grid-anim" {...swipeMonth} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {cells.map((cell, i) => {
            const dStr = toYMD(cell.dateObj.getFullYear(), cell.dateObj.getMonth(), cell.dateObj.getDate())
            const isToday = dStr === today
            const isPast = dStr < today
            const isSelected = dStr === selectedDate
            const eventDay = cell.current && isEventDay(dStr, cell.dateObj, config)
            const week = weeksByDate[dStr]
            const dotColor = !eventDay ? null : week?.status === 'published' ? 'var(--green)' : week?.status === 'draft' ? 'var(--accent2)' : 'var(--red)'

            return (
              <button
                key={i}
                className="bh-day"
                onClick={() => setSelectedDate(dStr)}
                style={{
                  position: 'relative', minHeight: 44, borderRadius: 10, padding: '5px 3px',
                  background: isSelected ? 'rgba(230,57,70,0.08)' : cell.current ? 'var(--card)' : 'transparent',
                  border: isSelected ? '1.5px solid var(--accent)' : isToday ? '1.5px solid rgba(230,57,70,0.4)' : '1px solid var(--border)',
                  opacity: cell.current ? (isPast ? 0.55 : 1) : 0.3,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer',
                }}
              >
                <span className="bh-day-number" style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--accent)' : (cell.current ? 'var(--text)' : 'var(--text3)') }}>
                  {cell.day}
                </span>
                {dotColor && <span className="bh-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, opacity: isPast ? 0.55 : 1 }} />}
              </button>
            )
          })}
        </div>

        {/* Legenda */}
        <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingLeft: 2, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Da configurare</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent2)', display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Bozza salvata</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Pubblicata</span>
          </div>
        </div>
      </div>

      {/* Pannello giorno selezionato */}
      {selectedDate && (
        <div className="bh-content" style={{ padding: '0 16px 24px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
            {selectedDateObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            {selectedDate === today && ' · Oggi'}
          </p>
          {!selectedIsEventDay ? (
            <p style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic', padding: '8px 0' }}>Nessun evento {config.eventName} in questo giorno.</p>
          ) : (
            <div
              onClick={() => onSelectDate(selectedDate)}
              style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: selectedWeek?.status === 'published' ? 'var(--green)' : selectedWeek?.status === 'draft' ? 'var(--accent2)' : 'var(--red)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{config.eventName}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
                  {selectedWeek?.status === 'published' ? 'Pubblicata' : selectedWeek?.status === 'draft' ? 'Bozza salvata' : 'Da configurare'}
                </p>
              </div>
              <span style={{ color: 'var(--text2)', fontSize: 18 }}>›</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
