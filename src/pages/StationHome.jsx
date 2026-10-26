import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useKeyboardWedgeScanner } from '../hooks/useKeyboardWedgeScanner'
import { parseScannedCode, generateItemCode } from '../utils/generateCode'
import { eventRowIncludesItem } from '../utils/kitInventory'
import { addIssue, removeIssueById, sortedIssues } from '../utils/itemIssues'
import { notifyTeamPush } from '../utils/pushNotifications'
import { formatDate, capitalize } from '../utils/formatDate'
import { todayStr } from '../utils/workHours'
import { useOperator } from '../context/OperatorContext'
import LogoutButton from '../components/LogoutButton'
import ActivityCard from '../components/ActivityCard'
import { doneFeedback } from '../utils/feedback'
import { groupActivities, activitiesForDay, setActivityDone, isAssignedTo } from '../utils/activities'
import { isModuleEnabled } from '../utils/modules'
import { Wrench, Warn, Pin, QrCode, ChevronRight, Unload, Check } from '../components/Icon'

// Home della "Postazione magazzino" (account con isStation, vedi SettingsUsers.jsx):
// pensata per un PC fisso in magazzino con un lettore USB. Il lettore "digita" il
// codice dell'etichetta e qui compare subito la scheda dell'oggetto — dove sta,
// quanti ce ne sono, quali eventi lo aspettano, gli ultimi movimenti — con due
// pulsanti grandi per segnarlo rotto o con difetto. Se il codice è quello di una
// singola unità (…-07) il pezzo n° 7 viene riconosciuto e la segnalazione lo riguarda.
const TONES = {
  late:  { head: '#c2410c', chipBg: 'rgba(234,88,12,0.14)', tile: '#ea580c', tileInk: '#fff', border: 'rgba(234,88,12,0.45)', cardBg: 'var(--c-surface)', bar: '#ea580c' },
  today: { head: '#e63946', chipBg: 'rgba(230,57,70,0.12)', tile: '#e63946', tileInk: '#fff', border: 'rgba(230,57,70,0.4)', cardBg: 'var(--c-surface)', bar: '#e63946' },
  calm:  { head: 'var(--c-ink3)', chipBg: 'var(--c-fill)', tile: 'var(--c-fill)', tileInk: 'var(--c-ink)', border: 'var(--c-line)', cardBg: 'var(--c-surface)', bar: '#e63946' },
}
// Stessi pallini dello storico degli oggetti: blu pronto, arancione caricato, verde rientrato,
// una "×" per il mancante.
// Montaggi, smontaggi e inizio/fine dei rent: stessi colori della home dei magazzinieri.
const KIND = {
  montaggio:  { color: '#2563eb', labelKey: 'calendar.legendAssembly' },
  smontaggio: { color: '#ea580c', labelKey: 'calendar.legendDisassembly' },
  rentStart:  { color: '#7c6fea', labelKey: 'station.rentStart' },
  rentEnd:    { color: '#7c6fea', labelKey: 'station.rentEnd' },
}
const ACTION_DOT = { pronto: 'var(--blue)', loaded: 'var(--accent2)', returned: 'var(--green)' }

export default function StationHome() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { teamId, team, profile } = useAuth()
  const { operator, requireOperator } = useOperator()
  const lang = i18n.language
  const [items, setItems] = useState([])
  const [events, setEvents] = useState([])
  const [activity, setActivity] = useState([])
  const [scanned, setScanned] = useState(null)   // { id, unit } | null
  const [notFound, setNotFound] = useState('')
  const [manual, setManual] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [blocks, setBlocks] = useState([])      // assegnazioni di "Assegna personale" (le attività libere sono senza evento)
  const [people, setPeople] = useState({})      // uid → nome
  const [actMsg, setActMsg] = useState('')

  useEffect(() => {
    if (!teamId) return
    return onSnapshot(query(collection(db, 'items'), where('teamId', '==', teamId)), snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])
  useEffect(() => {
    if (!teamId) return
    return onSnapshot(query(collection(db, 'events'), where('teamId', '==', teamId)), snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    return onSnapshot(query(collection(db, 'assignmentBlocks'), where('teamId', '==', teamId)), snap => setBlocks(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])
  useEffect(() => {
    if (!teamId) return
    return onSnapshot(query(collection(db, 'profiles'), where('teamId', '==', teamId)), snap => {
      const map = {}
      snap.docs.forEach(d => { map[d.id] = d.data().name || d.data().username || '' })
      setPeople(map)
    })
  }, [teamId])

  const item = scanned ? items.find(i => i.id === scanned.id) : null
  useEffect(() => {
    if (!item?.id) { setActivity([]); return }
    const q = query(collection(db, 'itemActivity'), where('catalogItemId', '==', item.id), orderBy('createdAt', 'desc'), limit(5))
    return onSnapshot(q, snap => setActivity(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [item?.id])

  const onScan = raw => {
    const { baseCode, unitNumber } = parseScannedCode(raw)
    const found = items.find(i => (i.code || generateItemCode(i.id)) === baseCode)
    setMsg(''); setNote('')
    if (!found) { setScanned(null); setNotFound(baseCode); return }
    setNotFound('')
    setScanned({ id: found.id, unit: unitNumber ? parseInt(unitNumber, 10) : null })
  }
  useKeyboardWedgeScanner(onScan)

  // Esc: torna alla schermata di attesa per scansionare il prossimo
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !(['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName))) { setScanned(null); setNotFound(''); setMsg('') } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Eventi che toccano questo oggetto (anche come componente di un kit): ancora fuori,
  // oppure con data di fine da oggi in poi.
  const itemEvents = useMemo(() => {
    if (!item) return []
    const today = todayStr()
    return events.map(ev => {
      const rows = (ev.items || []).filter(r => eventRowIncludesItem(r, item.id, items))
      if (rows.length === 0 || ev.archived) return null
      const out = rows.some(r => r.loaded && !r.returned)
      const end = ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date
      if (!out && !(end && end >= today)) return null
      return { ev, qty: rows.reduce((n, r) => n + (r.qty || 1), 0), out }
    }).filter(Boolean).sort((a, b) => (a.ev.date || '').localeCompare(b.ev.date || ''))
  }, [events, items, item])

  // ── Attività di oggi, con a chi sono assegnate: le completa chi è assegnato, dopo il badge ──
  const [actHold, setActHold] = useState({})            // appena spuntate: restano un attimo al loro posto (si vede l'animazione)
  const todayActs = useMemo(() => {
    const today = todayStr()
    const yesterday = todayStr(new Date(Date.now() - 86400000))
    return activitiesForDay(groupActivities(blocks, uid => people[uid]), today, yesterday, actHold)
  }, [blocks, people, actHold])
  const toggleActivity = async (act, done) => {
    setActMsg('')
    if (!requireOperator()) return                      // senza badge si apre la richiesta e basta
    if (!isAssignedTo(act, operator?.userId)) { setActMsg(t('activities.onlyAssignedMsg')); return }
    setActHold(h => ({ ...h, [act.id]: !!act.done }))
    setTimeout(() => setActHold(h => { const n = { ...h }; delete n[act.id]; return n }), 1300)
    if (done) doneFeedback({ sound: true })               // "din" + vibrazione: chi ha le mani occupate lo sente
    try { await setActivityDone(act, done, { uid: operator.userId, name: operator.name }) } catch { setActMsg(t('station.saveError')) }
  }

  // ── Home: eventi da preparare (elenco) o calendario del mese ─────────────
  const loadListsOn = isModuleEnabled(team, 'loadLists')
  const groups = useMemo(() => {
    const today = todayStr()
    const tomorrow = todayStr(new Date(Date.now() + 86400000))
    const endOf = e => (e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date)
    const stillOut = e => (e.items || []).some(r => r.loaded && !r.returned)
    const live = events.filter(e => !e.archived)
    // Da scaricare: evento finito ma con pezzi ancora fuori (o un rent scaduto)
    const late = live.filter(e => e.type === 'installation' ? (e.dateEnd && e.dateEnd < today) : (endOf(e) < today && stillOut(e)))
    const lateIds = new Set(late.map(e => e.id))

    // Ogni voce dell'elenco è una "cosa da fare" in un giorno: l'evento, il suo montaggio o
    // smontaggio (date a parte, anche se l'evento è un altro giorno) e l'inizio/fine di un rent.
    const entries = []
    live.filter(e => !lateIds.has(e.id)).forEach(e => {
      if (e.type === 'installation') {
        if (e.date >= today) entries.push({ key: `${e.id}:rentStart`, ev: e, date: e.date, kind: 'rentStart', time: !e.allDay ? e.timeStart : '' })
        if (e.dateEnd && e.dateEnd > e.date && e.dateEnd >= today) entries.push({ key: `${e.id}:rentEnd`, ev: e, date: e.dateEnd, kind: 'rentEnd', time: !e.allDay ? e.timeEnd : '' })
      } else if (endOf(e) >= today) {
        entries.push({ key: `${e.id}:event`, ev: e, date: e.date < today ? today : e.date, kind: 'event', time: !e.allDay ? e.timeStart : '' })
      }
      ;['montaggio', 'smontaggio'].forEach(k => {
        const d = e.phases?.[k]
        if (d && d >= today) entries.push({ key: `${e.id}:${k}`, ev: e, date: d, kind: k, time: e.phaseTimes?.[k]?.timeStart || '' })
      })
    })
    const byDate = (a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')
    const lateEntries = late.map(e => ({ key: `${e.id}:late`, ev: e, date: e.type === 'installation' ? e.dateEnd : endOf(e), kind: e.type === 'installation' ? 'rentEnd' : 'event', time: '' })).sort(byDate)
    return [
      { key: 'late', title: t('station.groupLate'), list: lateEntries, tone: 'late' },
      { key: 'today', tone: 'today', title: t('station.groupToday', { date: capitalize(formatDate(`${today}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' }, lang)) }), list: entries.filter(x => x.date === today).sort(byDate) },
      { key: 'tomorrow', tone: 'calm', title: t('station.groupTomorrow', { date: capitalize(formatDate(`${tomorrow}T12:00:00`, { weekday: 'long', day: 'numeric' }, lang)) }), list: entries.filter(x => x.date === tomorrow).sort(byDate) },
      { key: 'later', tone: 'calm', title: t('station.groupLater'), list: entries.filter(x => x.date > tomorrow).sort(byDate).slice(0, 12) },
    ].filter(g => g.list.length > 0)
  }, [events, lang, t])

  // Stato di avanzamento della lista di carico (stessa logica di WorkerHome).
  const progressOf = ev => {
    const rows = ev.items || []
    const total = rows.length
    const loaded = rows.filter(r => r.loaded).length
    const returned = rows.filter(r => r.returned).length
    if (!loadListsOn || total === 0) return { key: 'prep', done: 0, total: 0, label: t('station.phasePrep'), pill: 'n' }
    if (returned === total) return { key: 'done', done: returned, total, label: t('station.phaseDone'), pill: 'ok' }
    if (loaded === total) return { key: 'out', done: returned, total, label: t('station.phaseOut', { returned, total }), pill: 'wa' }
    if (loaded > 0) return { key: 'partial', done: loaded, total, label: t('station.phasePartial', { loaded, total }), pill: 'wa' }
    return { key: 'ready', done: 0, total, label: t('station.phaseReady', { total }), pill: 'n' }
  }

  const fmt = (d, o) => capitalize(formatDate(`${d}T12:00:00`, o, lang))
  const total = item?.totalQty || 0
  const unit = scanned?.unit && total > 1 && scanned.unit >= 1 && scanned.unit <= total ? scanned.unit : null
  const unitIssue = unit ? (item?.issues || []).find(i => i.unit === unit) : null
  const canMark = item && item.category !== 'Consumabili'

  // Segna rotto / con difetto: stessa matematica della vista dei magazzinieri
  // (rotto toglie dai disponibili, difetto no) e, se la scansione era di una singola
  // unità, la segnalazione porta il numero del pezzo.
  const markIssue = async type => {
    if (!item || saving) return
    // Segnare un problema richiede un operatore: serve sapere chi l'ha fatto.
    if (!requireOperator()) return
    if (unitIssue && unitIssue.type === type) { setMsg(t('station.alreadyMarked')); return }
    setSaving(true); setMsg('')
    try {
      const clamp = v => Math.min(total, Math.max(0, v))
      let b = item.brokenQty || 0
      let d = item.defectQty || 0
      const prevOut = total - (item.availableQty || 0) - b
      if (unitIssue) { if (unitIssue.type === 'broken') b--; else d-- }
      if (type === 'broken') b++; else d++
      b = clamp(b); d = clamp(d)
      const trimmed = note.trim()
      await updateDoc(doc(db, 'items', item.id), {
        brokenQty: b, defectQty: d,
        availableQty: Math.max(0, total - b - prevOut),
        issues: addIssue(item.issues, { type, unit, note: trimmed, by: operator.name }),
        ...(type === 'broken' && trimmed && !unit ? { brokenNote: trimmed } : {}),
        ...(type === 'defect' && trimmed && !unit ? { defectNote: trimmed } : {}),
      })
      notifyTeamPush({
        title: t(type === 'broken' ? 'inventory.pushBrokenTitle' : 'inventory.pushDefectTitle'),
        body: [item.name, [unit ? `n° ${unit}` : '', trimmed].filter(Boolean).join(': '), operator.name].filter(Boolean).join(' — '),
        url: `/inventory?filter=${type}`,
        audience: { type: 'admins' },
      })
      setNote('')
      setMsg(t(type === 'broken' ? 'station.markedBroken' : 'station.markedDefect'))
    } catch {
      setMsg(t('station.saveError'))
    } finally { setSaving(false) }
  }

  // Riparato: toglie la segnalazione (quella del pezzo scansionato; altrimenti la più recente)
  // e per i rotti rimette il pezzo tra i disponibili — stessa matematica di "Risolto" in
  // Inventory.jsx.
  const fixTarget = (() => {
    if (!item) return null
    if (unit) return unitIssue || null
    const list = [...(item.issues || [])].sort((a, b) => (b.at || 0) - (a.at || 0))
    if (list[0]) return list[0]
    if ((item.brokenQty || 0) > 0) return { type: 'broken' }
    if ((item.defectQty || 0) > 0) return { type: 'defect' }
    return null
  })()
  const markFixed = async () => {
    if (!item || !fixTarget || saving) return
    if (!requireOperator()) return
    setSaving(true); setMsg('')
    try {
      const issues = fixTarget.id ? removeIssueById(item.issues, fixTarget.id) : (item.issues || [])
      let upd
      if (fixTarget.type === 'broken') {
        const b = Math.max(0, (item.brokenQty || 0) - 1)
        const prevOut = total - (item.availableQty || 0) - (item.brokenQty || 0)
        upd = { issues, brokenQty: b, availableQty: Math.max(0, total - b - prevOut), ...(b === 0 ? { brokenNote: '' } : {}) }
      } else {
        const d = Math.max(0, (item.defectQty || 0) - 1)
        upd = { issues, defectQty: d, ...(d === 0 ? { defectNote: '' } : {}) }
      }
      await updateDoc(doc(db, 'items', item.id), upd)
      setMsg(t('station.markedFixed'))
    } catch {
      setMsg(t('station.saveError'))
    } finally { setSaving(false) }
  }

  const card = { background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 18 }
  const label = { margin: 0, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--c-ink3)' }
  const stat = (value, text, color) => (
    <div style={{ flex: '1 1 110px', padding: '12px 14px', borderRadius: 14, background: 'var(--c-alt)', border: '1px solid var(--c-line)' }}>
      <p style={{ margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1, color: color || 'var(--c-ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--c-ink2)' }}>{text}</p>
    </div>
  )

  const closeScan = () => { setScanned(null); setNotFound(''); setMsg('') }
  const closeBtn = (
    <button type="button" className="btn-no-anim" onClick={closeScan} aria-label={t('common.close')}
      style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', background: 'var(--c-fill)', color: 'var(--c-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>×</span></button>
  )
  const pillStyle = k => k === 'ok' ? { background: 'rgba(47,125,79,0.13)', color: '#1f5a38' } : k === 'wa' ? { background: 'rgba(217,119,6,0.14)', color: '#b45309' } : { background: 'var(--c-fill)', color: 'var(--c-ink2)' }

  return (
    <div className="page" style={{ padding: '24px 0 140px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 24px 16px', paddingRight: 250, minHeight: 46 }}>
        <div>
          <p style={label}>{team?.name}</p>
          <h1 style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.4px' }}>{t('station.title')}</h1>
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 12px 12px 18px', marginBottom: 20 }}>
          <span style={{ color: 'var(--c-ink2)', display: 'flex' }}><QrCode size={24} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{t('station.scanBarTitle')}</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--c-ink2)' }}>{t('station.scanBarText')}</p>
          </div>
          <form onSubmit={e => { e.preventDefault(); if (manual.trim()) { onScan(manual.trim()); setManual('') } }} style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <input value={manual} onChange={e => setManual(e.target.value)} placeholder={t('station.manualPlaceholder')} aria-label={t('station.manualPlaceholder')} style={{ width: 300, fontFamily: 'monospace', fontSize: 13 }} />
            <button type="submit" className="btn btn-secondary" disabled={!manual.trim()} style={{ flexShrink: 0 }}>{t('station.manualGo')}</button>
          </form>
        </div>

        {todayActs.length > 0 && (
          <section style={{ marginBottom: 26 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 800 }}>{t('activities.todayTitle')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
              {todayActs.map(act => (
                <ActivityCard key={`${act.id}-${act.cont ? 'c' : 'o'}`} act={act} meId={operator?.userId} onToggle={toggleActivity} station large
                  linkedEventName={act.linkedEventId ? events.find(e => e.id === act.linkedEventId)?.name : ''}
                  onOpenList={a => navigate(`/events/${a.linkedEventId}${a.linkedListId ? `?list=${a.linkedListId}` : ''}`)} />
              ))}
            </div>
            {actMsg && <p role="status" style={{ margin: '12px 0 0', fontSize: 14, fontWeight: 700, color: '#e63946' }}>{actMsg}</p>}
          </section>
        )}

        <h2 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 800 }}>{t('station.eventsToPrepare')}</h2>
      </div>

      <div style={{ padding: '0 24px' }}>
        {groups.length === 0 && <p style={{ ...card, padding: 24, margin: 0, textAlign: 'center', color: 'var(--c-ink3)', fontSize: 14 }}>{t('station.noEventsHome')}</p>}
        {groups.map(g => {
          // Tre toni, come la home dei magazzinieri: da scaricare (arancione), oggi (rosso),
          // domani e prossimi (neutro, più quieto).
          const tone = TONES[g.tone]
          return (
            <section key={g.key} style={{ marginBottom: 26 }}>
              <p style={{ margin: '0 0 10px 2px', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: tone.head }}>
                {g.tone === 'late' && <Unload size={14} />}{g.title}
                {g.tone !== 'calm' && <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '1px 8px', background: tone.chipBg, color: tone.head }}>{g.list.length}</span>}
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                {g.list.map(entry => {
                  const { ev, kind } = entry
                  const pr = progressOf(ev)
                  const d = new Date(`${entry.date}T12:00:00`)
                  const kindInfo = KIND[kind]
                  const timed = entry.time
                  const range = kind === 'event' && ev.dateEnd && ev.dateEnd > ev.date ? ` — ${fmt(ev.dateEnd, { day: 'numeric', month: 'long' })}` : ''
                  return (
                    <button key={entry.key} type="button" className="btn-no-anim" onClick={() => navigate(`/events/${ev.id}`)}
                      style={{ display: 'grid', gridTemplateColumns: '50px minmax(0,1fr) 220px 20px', alignItems: 'center', gap: 16, width: '100%', padding: '14px 18px', borderRadius: 18, textAlign: 'left', background: tone.cardBg, border: `1px solid ${(kind === 'rentStart' || kind === 'rentEnd') && g.tone === 'today' ? 'rgba(124,111,234,0.45)' : tone.border}` }}>
                      <div style={{ width: 50, height: 50, borderRadius: 13, background: kindInfo ? ((kind === 'rentStart' || kind === 'rentEnd') && g.tone === 'today' ? 'linear-gradient(135deg, #e63946 0%, #7c6fea 100%)' : kindInfo.color) : tone.tile, color: kindInfo ? '#fff' : tone.tileInk, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
                        <span style={{ fontSize: 19, fontWeight: 800 }}>{d.getDate()}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', opacity: 0.85 }}>{formatDate(d, { month: 'short' }, lang)}</span>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 15.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</p>
                        {kindInfo && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, margin: '4px 0 0', padding: '1px 8px', borderRadius: 8, fontSize: 11, fontWeight: 800, color: kindInfo.color, background: `${kindInfo.color}18`, border: `1px solid ${kindInfo.color}44` }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: kindInfo.color }} />{t(kindInfo.labelKey)}
                          </span>
                        )}
                        <p style={{ margin: '3px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--c-ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fmt(entry.date, { weekday: 'long', day: 'numeric', month: 'long' })}{range}{timed ? ` · ${timed}` : ''}
                        </p>
                        {ev.location && <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--c-ink3)', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', whiteSpace: 'nowrap' }}><Pin size={12} /> {ev.location}</p>}
                      </div>
                      <div>
                        <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '3px 10px', ...pillStyle(pr.pill) }}>{pr.label}</span>
                        {pr.total > 0 && (
                          <div style={{ height: 5, borderRadius: 3, background: 'var(--c-fill)', marginTop: 8, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round((pr.done / pr.total) * 100)}%`, borderRadius: 3, background: pr.key === 'done' ? 'var(--c-green, #22a55b)' : tone.bar, transition: 'width .3s' }} />
                          </div>
                        )}
                      </div>
                      <span style={{ color: 'var(--c-ink3)', display: 'flex' }}><ChevronRight size={18} /></span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <LogoutButton name={profile?.name} className="btn btn-secondary" style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13 }} />
        </div>
      </div>

      {(item || notFound) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 950, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={closeScan} style={{ position: 'absolute', inset: 0, background: 'rgba(28,28,26,0.32)' }} />
          <aside role="dialog" aria-label={item ? item.name : t('station.scanBarTitle')}
            style={{ position: 'relative', width: 'min(620px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--c-bg, #f5f5f3)', borderLeft: '1px solid var(--c-line)', padding: '18px 18px 120px', animation: 'stationDrawerIn .22s ease-out' }}>
            {notFound && !item && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>{closeBtn}</div>
            )}
            {notFound && !item && (
              <p role="alert" style={{ margin: 0, padding: '14px 16px', borderRadius: 14, background: 'rgba(230,57,70,0.10)', color: '#e63946', fontSize: 15, fontWeight: 700 }}>{t('station.notFound', { code: notFound })}</p>
            )}
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ ...card, padding: '22px 22px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <p style={label}>{item.category}</p>
                <h2 style={{ margin: '2px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px', overflowWrap: 'anywhere' }}>{item.name}</h2>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--c-ink3)', fontFamily: 'monospace' }}>{item.code || generateItemCode(item.id)}{unit ? ` · ${t('station.unitN', { n: unit })}` : ''}</p>
              </div>
              {closeBtn}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 16px', fontSize: 16, fontWeight: 700, color: item.location ? 'var(--c-ink)' : 'var(--c-ink3)' }}>
              <Pin size={18} /> {item.location || t('station.noLocation')}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {stat(`${item.availableQty ?? item.totalQty ?? 0}`, t('station.available', { total }), 'var(--c-green)')}
              {(item.brokenQty || 0) > 0 && stat(item.brokenQty, t('station.broken'), '#e63946')}
              {(item.defectQty || 0) > 0 && stat(item.defectQty, t('station.defect'), '#d97706')}
              {itemEvents.some(e => e.out) && stat(itemEvents.filter(e => e.out).reduce((n, e) => n + e.qty, 0), t('station.outNow'), 'var(--c-ink)')}
            </div>

            {(item.issues || []).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={{ ...label, marginBottom: 6 }}>{t('inventory.issuesPiecesTitle')}</p>
                {sortedIssues(item.issues).map(i => (
                  <div key={i.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '1px solid var(--c-line)', fontSize: 14, background: unit && i.unit === unit ? 'rgba(230,57,70,0.06)' : 'transparent' }}>
                    <span style={{ fontWeight: 800, whiteSpace: 'nowrap', color: i.type === 'broken' ? '#e63946' : '#b45309' }}>{i.unit ? t('inventory.issuePieceNumber', { n: i.unit }) : t('inventory.issuePieceNoNumber')}</span>
                    <span style={{ flex: 1, overflowWrap: 'anywhere' }}><strong>{i.type === 'broken' ? t('inventory.brokenSingle') : t('inventory.defectSingle')}</strong>{i.note ? ` — ${i.note}` : ''}{i.by ? <span style={{ color: 'var(--c-ink3)' }}> · {i.by}</span> : null}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canMark && (
            <div style={{ ...card, padding: 18 }}>
              <p style={{ ...label, marginBottom: 8 }}>{unit ? t('station.markUnit', { n: unit }) : t('station.markTitle')}</p>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('inventory.issueNotePlaceholder')} aria-label={t('inventory.issueNoteLabel')} style={{ marginBottom: 12, fontSize: 15 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={saving} onClick={() => markIssue('broken')}
                  style={{ flex: '1 1 0', minWidth: 0, minHeight: 46, borderRadius: 12, background: '#e63946', color: '#fff', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <Wrench size={16} /> {t('station.markBroken')}
                </button>
                <button type="button" disabled={saving} onClick={() => markIssue('defect')}
                  style={{ flex: '1 1 0', minWidth: 0, minHeight: 46, borderRadius: 12, background: 'rgba(217,119,6,0.14)', color: '#b45309', border: '1.5px solid rgba(217,119,6,0.4)', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <Warn size={16} /> {t('station.markDefectShort')}
                </button>
                {fixTarget && (
                  <button type="button" disabled={saving} onClick={markFixed}
                    style={{ flex: '1 1 0', minWidth: 0, minHeight: 46, borderRadius: 12, background: 'rgba(47,125,79,0.12)', color: '#1f5a38', border: '1.5px solid rgba(47,125,79,0.4)', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                    <Check size={16} /> {t('station.markFixed')}
                  </button>
                )}
              </div>
              {msg && <p role="status" style={{ margin: '12px 0 0', fontSize: 14, fontWeight: 700, color: 'var(--c-ink2)' }}>{msg}</p>}
            </div>
          )}

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <div style={{ ...card, padding: 18 }}>
              <p style={{ ...label, marginBottom: 8 }}>{t('station.eventsTitle')}</p>
              {itemEvents.length === 0 ? (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--c-ink3)' }}>{t('station.noEvents')}</p>
              ) : itemEvents.map(({ ev, qty, out }) => (
                <button key={ev.id} type="button" className="btn-no-anim" onClick={() => navigate(`/events/${ev.id}`)}
                  style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--c-line)', background: 'transparent', textAlign: 'left' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, overflowWrap: 'anywhere' }}>{ev.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--c-ink2)' }}>
                      {ev.dateEnd && ev.dateEnd > ev.date ? `${fmt(ev.date, { day: 'numeric', month: 'short' })} → ${fmt(ev.dateEnd, { day: 'numeric', month: 'short' })}` : fmt(ev.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                      {ev.location ? ` · ${ev.location}` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-ink2)' }}>×{qty}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 8, padding: '3px 9px', background: out ? 'rgba(217,119,6,0.14)' : 'var(--c-fill)', color: out ? '#b45309' : 'var(--c-ink2)' }}>{out ? t('station.statusOut') : t('station.statusPlanned')}</span>
                </button>
              ))}
            </div>

            <div style={{ ...card, padding: 18 }}>
              <p style={{ ...label, marginBottom: 8 }}>{t('station.activityTitle')}</p>
              {activity.length === 0 ? (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--c-ink3)' }}>{t('station.noActivity')}</p>
              ) : activity.map(a => {
                const when = a.createdAt?.toDate ? a.createdAt.toDate() : null
                return (
                  <div key={a.id} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid var(--c-line)', fontSize: 14 }}>
                    {a.action === 'missing'
                      ? <span aria-hidden="true" style={{ width: 10, flexShrink: 0, marginTop: 1, fontSize: 15, lineHeight: '15px', fontWeight: 800, color: '#ea580c', textAlign: 'center' }}>×</span>
                      : <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 6, background: ACTION_DOT[a.action] || 'var(--c-ink3)' }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{t(`eventDetail.activity_${a.action}`, { name: a.userName || t('eventDetail.unknownUser') })}</p>
                      <p style={{ margin: '1px 0 0', fontSize: 12.5, color: 'var(--c-ink2)' }}>
                        {a.eventName || ''}{a.eventName && when ? ' · ' : ''}{when ? when.toLocaleString(lang === 'en' ? 'en-US' : 'it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
          </aside>
          <style>{`@keyframes stationDrawerIn { from { transform: translateX(32px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
        </div>
      )}
    </div>
  )
}
