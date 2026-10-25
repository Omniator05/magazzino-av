import { useTranslation } from 'react-i18next'
import { PersonAvatar } from './AssigneeAvatars'
import { List, Check } from './Icon'
import { formatDate } from '../utils/formatDate'

// Card di un'attività (task libero della timeline "Assegna personale") per la home dei magazzinieri e per la
// Postazione: titolo, orario, A CHI è assegnata e — per chi è assegnato — il bottone per completarla.
// `meId`: chi guarda (il suo uid, o l'operatore alla postazione; vuoto se alla postazione nessuno è entrato).
// `onToggle(act, done)`: segna fatta / riapre. `station`: alla postazione il bottone c'è per tutti, perché
// prima si entra col badge; nell'app dei magazzinieri lo vede solo chi è assegnato.
export default function ActivityCard({ act, meId, onToggle, onOpenList, linkedEventName, station = false, large = false }) {
  const { t, i18n } = useTranslation()
  const mine = !!meId && act.people.some(p => p.uid === meId)
  const canAct = mine || (station && !meId)       // alla postazione senza operatore il tocco chiede il badge
  const people = [...act.people].sort((a, b) => Number(b.uid === meId) - Number(a.uid === meId))
  const time = act.cont ? `${t('workerCalendar.taskContinues')} · 00:00–${act.endTime}` : `${act.startTime}–${act.endTime}`
  const doneAt = act.doneAt?.toDate ? formatDate(act.doneAt.toDate(), { hour: '2-digit', minute: '2-digit' }, i18n.language) : ''
  const accent = act.done ? '#2f9e5b' : '#e63946'
  const pad = large ? '16px 18px' : '15px 16px'

  return (
    <div style={{ margin: large ? 0 : '0 18px 12px', background: 'var(--c-surface)', border: `1px solid ${act.done ? 'var(--c-line)' : 'rgba(230,57,70,0.4)'}`, borderRadius: 18, padding: pad, opacity: act.done ? 0.82 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: large ? 16 : 15, color: 'var(--c-ink)', textDecoration: act.done ? 'line-through' : 'none', minWidth: 0, overflowWrap: 'anywhere' }}>{act.label || t('staffTimeline.untitledTask')}</p>
            <span style={{ background: act.done ? 'rgba(47,158,91,0.14)' : 'rgba(230,57,70,0.12)', color: accent, borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 800, flexShrink: 0, textTransform: 'uppercase' }}>
              {act.done ? t('activities.doneTag') : t('workerHome.taskTag')}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--c-ink2)', fontVariantNumeric: 'tabular-nums' }}>{time}</p>
          {act.description && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--c-ink2)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{act.description}</p>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {people.length === 0
          ? <span style={{ fontSize: 12, color: 'var(--c-ink3)', fontStyle: 'italic' }}>{t('calendar.noneAssigned')}</span>
          : people.map(p => (
            <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--c-alt, var(--c-fill))', border: '1px solid var(--c-line)', borderRadius: 20, padding: '3px 10px 3px 4px', fontSize: 12, fontWeight: 700, color: 'var(--c-ink)' }}>
              <PersonAvatar person={p} size={20} /> {p.name || t('common.unknown')}
              {p.uid && p.uid === meId && <span style={{ fontSize: 10, fontWeight: 800, color: '#e63946', background: 'rgba(230,57,70,0.12)', borderRadius: 6, padding: '1px 6px' }}>{t('eventSummary.you')}</span>}
            </span>
          ))}
      </div>

      {act.linkedEventId && onOpenList && (
        <button type="button" className="btn-no-anim" onClick={() => onOpenList(act)}
          style={{ marginTop: 10, background: 'transparent', color: 'var(--blue)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0 }}>
          <List size={13} /> {t('workerHome.openLinkedList')}{linkedEventName ? ` · ${linkedEventName}` : ''}
        </button>
      )}

      {act.done ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#2f9e5b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Check size={14} /> {t('activities.doneBy', { name: act.doneByName || t('common.unknown') })}{doneAt ? ` · ${doneAt}` : ''}
          </p>
          {onToggle && canAct && (
            <button type="button" className="btn-no-anim" onClick={() => onToggle(act, false)}
              style={{ background: 'transparent', color: 'var(--c-ink3)', fontSize: 12, fontWeight: 700, textDecoration: 'underline', padding: '6px 4px' }}>{t('activities.reopen')}</button>
          )}
        </div>
      ) : onToggle && (station || mine) && (
        <button type="button" className="btn-no-anim" disabled={!canAct} onClick={() => onToggle(act, true)}
          style={{ marginTop: 12, width: '100%', minHeight: large ? 48 : 44, borderRadius: 13, fontSize: 14.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: canAct ? '#2f9e5b' : 'var(--c-fill)', color: canAct ? '#fff' : 'var(--c-ink2)' }}>
          <Check size={16} /> {canAct ? t('activities.complete') : t('activities.onlyAssigned')}
        </button>
      )}
    </div>
  )
}
