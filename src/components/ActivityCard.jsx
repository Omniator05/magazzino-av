import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PersonAvatar } from './AssigneeAvatars'
import { List, Check } from './Icon'
import { localeFor } from '../utils/formatDate'

// Card di un'attività (task libero della timeline "Assegna personale") per la home dei magazzinieri e per la
// Postazione: titolo, orario, A CHI è assegnata e — per chi è assegnato — il bottone per completarla.
// `meId`: chi guarda (il suo uid, o l'operatore alla postazione; vuoto se alla postazione nessuno è entrato).
// `onToggle(act, done)`: segna fatta / riapre. `station`: alla postazione il bottone c'è per tutti, perché
// prima si entra col badge; nell'app dei magazzinieri lo vede solo chi è assegnato.
// `collapseDone`: una volta completata la card si rimpicciolisce a una riga (titolo barrato + tag "Completata" +
// ora), invece di occupare tutto lo spazio; un tocco la riapre per vedere i dettagli o riaprire l'attività.
// `held`: appena spuntata resta intera per un attimo (si vede il segno di spunta), poi si rimpicciolisce.
// Se è già completata quando la pagina si carica, nasce direttamente rimpicciolita (nessuna animazione).
export default function ActivityCard({ act, meId, onToggle, onOpenList, linkedEventName, station = false, large = false, collapseDone = false, held = false }) {
  const { t, i18n } = useTranslation()
  const [peek, setPeek] = useState(false)           // l'utente ha riaperto i dettagli di una card compatta
  const mine = !!meId && act.people.some(p => p.uid === meId)
  const canAct = mine || (station && !meId)       // alla postazione senza operatore il tocco chiede il badge
  const people = [...act.people].sort((a, b) => Number(b.uid === meId) - Number(a.uid === meId))
  const time = act.cont ? `${t('workerCalendar.taskContinues')} · 00:00–${act.endTime}` : `${act.startTime}–${act.endTime}`
  // Solo l'ora (toLocaleDateString con sole opzioni d'ora aggiunge anche la data)
  const doneAt = act.doneAt?.toDate ? act.doneAt.toDate().toLocaleTimeString(localeFor(i18n.language), { hour: '2-digit', minute: '2-digit' }) : ''
  const accent = act.done ? '#2f9e5b' : '#e63946'
  const pad = large ? '16px 18px' : '15px 16px'
  const compact = collapseDone && act.done && !held && !peek
  // Il rosso (bordo e fondo tenue) è di chi è assegnato; le attività degli altri restano neutre. Alla postazione le
  // attività da fare restano tutte in evidenza: chi guarda non è ancora identificato.
  const highlight = !act.done && (mine || station)

  return (
    <div className="tk-card" onClick={compact ? () => setPeek(true) : undefined} role={compact ? 'button' : undefined} tabIndex={compact ? 0 : undefined}
      onKeyDown={compact ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPeek(true) } } : undefined}
      aria-label={compact ? `${act.label || t('staffTimeline.untitledTask')} · ${t('activities.doneTag')}` : undefined}
      style={{ margin: large ? 0 : '0 18px 12px', background: highlight ? 'rgba(230,57,70,0.05)' : 'var(--c-surface)', border: `1px solid ${highlight ? 'rgba(230,57,70,0.4)' : 'var(--c-line)'}`, borderRadius: compact ? 14 : 18, padding: compact ? '10px 14px' : pad, opacity: act.done ? 0.82 : 1, cursor: compact ? 'pointer' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: compact ? 14 : large ? 16 : 15, minWidth: 0, overflowWrap: 'anywhere', ...(compact ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : null) }}>
              <span className="tk-title" data-done={act.done ? 1 : 0} style={{ color: act.done ? 'var(--c-ink3)' : 'var(--c-ink)' }}>{act.label || t('staffTimeline.untitledTask')}</span>
            </p>
            <span key={act.done ? 'd' : 'o'} className={act.done ? 'tk-fade' : undefined} style={{ background: act.done ? 'rgba(47,158,91,0.14)' : 'rgba(230,57,70,0.12)', color: accent, borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 800, flexShrink: 0, textTransform: 'uppercase' }}>
              {act.done ? t('activities.doneTag') : t('workerHome.taskTag')}
            </span>
            {compact && doneAt && <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--c-ink3)', fontVariantNumeric: 'tabular-nums' }}>{doneAt}</span>}
          </div>
          {/* Dettagli: si chiudono con l'altezza che scende a zero (la riga della griglia passa da 1fr a 0fr) */}
          <div className="tk-collapse" style={{ display: 'grid', gridTemplateRows: compact ? '0fr' : '1fr', transition: 'grid-template-rows 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          <div aria-hidden={compact} style={{ minHeight: 0, overflow: 'hidden', opacity: compact ? 0 : 1, visibility: compact ? 'hidden' : 'visible', transition: `opacity 0.2s ease, visibility 0s linear ${compact ? '0.4s' : '0s'}` }}>
          <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--c-ink2)', fontVariantNumeric: 'tabular-nums' }}>{time}</p>
          {act.description && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--c-ink2)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{act.description}</p>}
        </div>
        </div>
        </div>
      </div>

      <div className="tk-collapse" style={{ display: 'grid', gridTemplateRows: compact ? '0fr' : '1fr', transition: 'grid-template-rows 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
      <div aria-hidden={compact} style={{ minHeight: 0, overflow: 'hidden', opacity: compact ? 0 : 1, visibility: compact ? 'hidden' : 'visible', transition: `opacity 0.2s ease, visibility 0s linear ${compact ? '0.4s' : '0s'}` }}>
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
        <div className="tk-fade" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#2f9e5b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path className="tk-draw" d="M5 12.5l4.5 4.5L19 7" pathLength="1" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg> {t('activities.doneBy', { name: act.doneByName || t('common.unknown') })}{doneAt ? ` · ${doneAt}` : ''}
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
      </div>
    </div>
  )
}
