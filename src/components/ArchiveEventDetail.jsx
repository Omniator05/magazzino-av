import { useTranslation } from 'react-i18next'
import { formatDate, capitalize } from '../utils/formatDate'
import { getEventLists, rowListId, MAIN_LIST_ID } from '../utils/eventLists'
import { Calendar, Clock, Pin, User, Phone, Mail, FileText, Truck, Wrench } from './Icon'

// Corpo del dettaglio di un evento in archivio: tutti i dati dell'evento e
// la sua lista di carico. Usato sia nella colonna laterale (computer) sia nel
// foglio a scorrimento (telefono) di pages/Archive.jsx — i pulsanti "Elimina"
// e "Usa lista" stanno fuori, fissi in fondo a entrambi.
const PHASE_META = {
  montaggio: { color: '#2563eb', labelKey: 'calendar.legendAssembly' },
  smontaggio: { color: '#ea580c', labelKey: 'calendar.legendDisassembly' },
}

const sectionLabel = { margin: 0, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9a9a9a' }
const valueStyle = { margin: 0, fontSize: 14, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.4 }

function Row({ icon, label, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '11px 0', borderBottom: '1px solid #eceae6' }}>
      <span style={{ flexShrink: 0, color: '#9a9a9a', display: 'flex', marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...sectionLabel, marginBottom: 3 }}>{label}</p>
        {children}
      </div>
    </div>
  )
}

export default function ArchiveEventDetail({ event, workers = [], blocks = [], vehicles = [], loadListsOn }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const fmt = (d, o) => formatDate(d + 'T12:00:00', o, lang)

  const hasEnd = event.dateEnd && event.dateEnd > event.date
  const dateLabel = hasEnd
    ? `${fmt(event.date, { day: 'numeric', month: 'long' })} → ${fmt(event.dateEnd, { day: 'numeric', month: 'long', year: 'numeric' })}`
    : capitalize(fmt(event.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
  const timeLabel = event.allDay === false && event.timeStart && event.timeEnd
    ? `${event.timeStart} – ${event.timeEnd}` : t('events.allDayLabel')

  const phases = Object.entries(event.phases || {}).filter(([k, d]) => d && PHASE_META[k]).map(([k, d]) => {
    const pt = event.phaseTimes?.[k]
    return { key: k, ...PHASE_META[k], date: d, time: pt?.timeStart && pt?.timeEnd ? `${pt.timeStart}–${pt.timeEnd}` : null }
  })

  const manager = event.eventManager || {}
  const hasManager = manager.name || manager.phone || manager.email

  // Persone: assegnazioni con orario proprio (blocchi) + le "semplici" del
  // vecchio sistema non già coperte da un blocco, come in EventSummaryModal.
  const nameOf = b => (b.workerId ? workers.find(w => w.id === b.workerId)?.name : b.externalWorkerName)
  const blockPeople = blocks.map(b => {
    const name = nameOf(b)
    if (!name) return null
    return { key: b.id, name, hours: b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : null, phase: b.phase ? PHASE_META[b.phase] : null, date: b.date }
  }).filter(Boolean).sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.name.localeCompare(b.name))
  const coveredIds = new Set(blocks.map(b => b.workerId).filter(Boolean))
  const legacyPeople = (event.assignedWorkers || [])
    .filter(id => !coveredIds.has(id))
    .map(id => workers.find(w => w.id === id)).filter(Boolean)
    .map(w => ({ key: w.id, name: w.name, hours: null, phase: null, date: null }))
  const people = [...blockPeople, ...legacyPeople]
  const showPeopleDate = new Set(blockPeople.map(p => p.date)).size > 1

  // Furgoni usati: unici tra le righe della lista.
  const items = event.items || []
  const vehicleNames = []
  items.forEach(i => {
    let name = null
    if (i.vehicleId) {
      const v = vehicles.find(x => x.id === i.vehicleId)
      if (v) name = `${v.emoji ? v.emoji + ' ' : ''}${v.name}`
    } else if (i.externalVehicleId && i.externalVehicleName) {
      name = i.externalVehicleName
    }
    if (name && !vehicleNames.includes(name)) vehicleNames.push(name)
  })

  const total = items.length
  const returned = items.filter(i => i.returned).length
  const allBack = total > 0 && returned === total
  const lists = getEventLists(event)
  const multiList = lists.length > 1
  const listName = l => l.name || (l.id === MAIN_LIST_ID ? t('eventDetail.mainListName') : t('eventDetail.listUnnamed'))

  return (
    <div>
      {event.type === 'installation' && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ede9fe', color: '#5b4fcf', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          <Wrench size={12} /> {t('events.installLabel')}
        </span>
      )}

      <Row icon={<Calendar size={15} />} label={t('eventDetail.dateFieldLabel')}>
        <p style={valueStyle}>{dateLabel}</p>
      </Row>
      <Row icon={<Clock size={15} />} label={t('eventSummary.timeLabel')}>
        <p style={valueStyle}>{timeLabel}</p>
      </Row>
      {event.location && (
        <Row icon={<Pin size={15} />} label={t('calendar.locationLabel')}>
          <p style={valueStyle}>{event.location}</p>
        </Row>
      )}
      {phases.length > 0 && (
        <Row icon={<Wrench size={15} />} label={t('archive.phasesLabel')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {phases.map(p => (
              <p key={p.key} style={{ ...valueStyle, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <span style={{ color: p.color, fontWeight: 800 }}>{t(p.labelKey)}</span>
                <span style={{ color: '#6b6b6b', fontWeight: 600 }}>{fmt(p.date, { weekday: 'short', day: 'numeric', month: 'short' })}{p.time ? ` · ${p.time}` : ''}</span>
              </p>
            ))}
          </div>
        </Row>
      )}
      {hasManager && (
        <Row icon={<User size={15} />} label={t('eventSummary.managerLabel')}>
          {manager.name && <p style={valueStyle}>{manager.name}</p>}
          {manager.phone && <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6b6b6b', display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={12} /> {manager.phone}</p>}
          {manager.email && <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6b6b6b', display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={12} /> {manager.email}</p>}
        </Row>
      )}
      {people.length > 0 && (
        <Row icon={<User size={15} />} label={t('eventSummary.assignedLabel')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {people.map(p => (
              <p key={p.key} style={{ ...valueStyle, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                {p.name}
                {(p.hours || (showPeopleDate && p.date)) && (
                  <span style={{ color: '#6b6b6b', fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {showPeopleDate && p.date ? fmt(p.date, { day: 'numeric', month: 'short' }) : ''}{showPeopleDate && p.date && p.hours ? ' · ' : ''}{p.hours || ''}
                  </span>
                )}
                {p.phase && <span style={{ color: p.phase.color, background: p.phase.color + '18', borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 800 }}>{t(p.phase.labelKey)}</span>}
              </p>
            ))}
          </div>
        </Row>
      )}
      {vehicleNames.length > 0 && (
        <Row icon={<Truck size={15} />} label={t('archive.vehiclesLabel')}>
          <p style={valueStyle}>{vehicleNames.join(', ')}</p>
        </Row>
      )}
      {event.notes && (
        <Row icon={<FileText size={15} />} label={t('calendar.notesLabel')}>
          <p style={{ ...valueStyle, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{event.notes}</p>
        </Row>
      )}

      {/* Lista di carico */}
      {loadListsOn && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <p style={sectionLabel}>{t('archive.loadingListTitle')}</p>
            {total > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: allBack ? '#15803d' : '#ea580c' }}>
                {t('archive.itemsCount', { count: total })} · {allBack ? t('archive.allReturned') : t('archive.partialReturned', { returned, total })}
              </span>
            )}
          </div>
          {total === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: '#9a9a9a', fontStyle: 'italic' }}>{t('archive.noItems')}</p>
          ) : (
            <div style={{ background: '#faf9f7', border: '1px solid #e0ddd6', borderRadius: 14, overflow: 'hidden' }}>
              {lists.map(l => {
                const rows = items.filter(i => rowListId(i) === l.id)
                if (rows.length === 0) return null
                return (
                  <div key={l.id}>
                    {multiList && (
                      <p style={{ ...sectionLabel, padding: '11px 14px 5px', background: '#f4f3ef', borderTop: '1px solid #eceae6' }}>{listName(l)} · {rows.length}</p>
                    )}
                    {rows.map((item, i) => (
                      <div key={item.id || i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 14px', borderTop: i > 0 ? '1px solid #eceae6' : 'none' }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: '#1a1a1a', overflowWrap: 'anywhere' }}>
                          {item.name}
                          {item.loaded && !item.returned && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: '#ea580c' }}>{t('archive.notReturned')}</span>}
                        </span>
                        <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 800, color: '#6b6b6b', fontVariantNumeric: 'tabular-nums' }}>×{item.qty || 1}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
