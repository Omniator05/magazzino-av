import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../utils/formatDate'
import TimeField from './TimeField'
import DateField from './DateField'
import DateRangeField from './DateRangeField'
import MultiDateField from './MultiDateField'
import Picker from './Picker'
import EventManagerField from './EventManagerField'

// Corpo del form evento della colonna laterale del Calendario (desktop),
// condiviso tra creazione e modifica così i due restano identici.
// Ordine: tipo → nome → luogo → "Quando" (date + orario in due righe) → note,
// poi tre righe retraibili con il riepilogo a destra (Ripetizione, Montaggio/
// smontaggio, Riferimento e responsabile): si sa cosa contengono senza aprirle,
// e luogo e note restano vicini ai campi che si usano sempre.
const PHASE_CONFIG = [
  { key: 'montaggio', labelKey: 'calendar.legendAssembly', color: '#2563eb', bg: 'var(--c-blue-bg)' },
  { key: 'smontaggio', labelKey: 'calendar.legendDisassembly', color: '#ea580c', bg: 'var(--c-orange-bg)' },
]

export const fieldLabel = { display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.4px', color: 'var(--c-ink2)', textTransform: 'uppercase', marginBottom: 6 }

export function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="btn-no-anim"
      style={{ width: 40, height: 24, borderRadius: 12, background: on ? '#e63946' : 'var(--c-dash)', border: 'none', padding: 3, display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background 0.18s ease', flexShrink: 0 }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--c-surface)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', display: 'block' }} />
    </button>
  )
}

// Riga retraibile: etichetta a sinistra, riepilogo a destra (grigio, scuro se
// contiene qualcosa), freccia che ruota. Il contenuto si apre sotto.
function FormRow({ label, summary, hasValue, open, onToggle, children, last }) {
  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid var(--c-fill)' }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="btn-no-anim"
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', background: 'transparent', border: 'none', textAlign: 'left' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-ink)', flexShrink: 0 }}>{label}</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13, fontWeight: 600, color: hasValue ? 'var(--c-ink)' : 'var(--c-ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <span style={{ color: 'var(--c-ink3)', display: 'flex', flexShrink: 0, transition: 'transform 0.2s ease', transform: open ? 'rotate(90deg)' : 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </span>
      </button>
      {open && <div style={{ padding: '2px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>}
    </div>
  )
}

// useRange: un solo selettore di intervallo "booking" al posto della coppia inizio → fine
// (telefono, dove due campi affiancati sarebbero stretti). autoFocusName: apre subito la tastiera.
export default function EventFormFields({ form, setForm, idp, teamId, showType, showRecurrence, today, futureDates = [], useRange, autoFocusName }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState({ repeat: false, phases: false, extra: false })
  const toggle = k => setOpen(o => ({ ...o, [k]: !o[k] }))
  const set = patch => setForm(f => ({ ...f, ...patch }))
  const short = d => formatDate(d + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)

  const isInstall = form.type === 'installation'
  const recurrence = form.recurrence || 'never'
  const recurrenceOptions = (isInstall ? ['never', 'custom'] : ['never', 'daily', 'weekly', 'monthly', 'yearly', 'custom'])
    .map(value => ({ value, label: t(`events.recurrence${value[0].toUpperCase()}${value.slice(1)}`) }))
  const recurrenceLabel = t(`events.recurrence${recurrence[0].toUpperCase()}${recurrence.slice(1)}`)
  const repeatSummary = recurrence === 'never' ? recurrenceLabel
    : recurrence === 'custom' ? t('calendar.nDates', { count: (form.customDates || []).length })
    : `${recurrenceLabel}${form.endDate ? ` · ${t('calendar.untilDate', { date: short(form.endDate) })}` : ''}`

  const phases = form.phases || {}
  const phaseParts = PHASE_CONFIG.filter(p => phases[p.key]).map(p => `${t(p.labelKey)} ${short(phases[p.key])}`)
  const managerName = (form.managerName || '').trim()
  const quoteRef = (form.quoteRef || '').trim()
  const extraSummary = [managerName, quoteRef].filter(Boolean).join(' · ')

  return (
    <>
      {showType && (
        <div style={{ display: 'flex', gap: 8, background: 'var(--c-fill)', borderRadius: 12, padding: 4 }}>
          <button type="button" onClick={() => set({ type: 'event' })} aria-pressed={!isInstall}
            style={{ flex: 1, padding: 8, borderRadius: 9, fontWeight: 700, fontSize: 12.5, background: !isInstall ? 'var(--c-surface)' : 'transparent', color: !isInstall ? 'var(--c-ink)' : 'var(--c-ink2)', border: 'none' }}>
            {t('events.typeEvent')}
          </button>
          <button type="button" onClick={() => set({ type: 'installation', recurrence: 'never', endDate: '', customDates: [] })} aria-pressed={isInstall}
            style={{ flex: 1, padding: 8, borderRadius: 9, fontWeight: 700, fontSize: 12.5, background: isInstall ? 'var(--c-violet-bg)' : 'transparent', color: isInstall ? '#5b4fcf' : 'var(--c-ink2)', border: 'none' }}>
            {t('events.typeInstallation')}
          </button>
        </div>
      )}

      <div>
        <label htmlFor={`${idp}-name`} style={fieldLabel}>{t('calendar.eventNameLabel')}</label>
        <input id={`${idp}-name`} value={form.name || ''} onChange={e => set({ name: e.target.value })} placeholder={t('calendar.eventNamePlaceholder')} autoFocus={autoFocusName} />
      </div>

      <div>
        <label htmlFor={`${idp}-location`} style={fieldLabel}>{t('calendar.locationLabel')}</label>
        <input id={`${idp}-location`} value={form.location || ''} onChange={e => set({ location: e.target.value })} placeholder={t('calendar.locationPlaceholder')} />
      </div>

      {/* Quando: date e orario nello stesso riquadro, in due righe */}
      <div>
        <span style={fieldLabel}>{t('calendar.whenLabel')}</span>
        <div style={{ border: '1px solid var(--c-line)', borderRadius: 14, background: 'var(--c-surface)' }}>
          {useRange ? (
            <div style={{ padding: '10px 12px' }}>
              <DateRangeField start={form.date} end={form.dateEnd || form.date} onChange={(st, en) => set({ date: st, dateEnd: en === st ? '' : en })} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <DateField value={form.date || ''} onChange={v => set({ date: v, dateEnd: form.dateEnd && form.dateEnd < v ? '' : form.dateEnd })} />
              </div>
              <span aria-hidden="true" style={{ color: 'var(--c-ink3)', fontWeight: 700 }}>→</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <DateRangeField endOnly start={form.date} end={form.dateEnd || form.date} placeholder={t('calendar.endPlaceholder')} singleDayLabel={t('calendar.singleDay')}
                  onChange={(st, en) => set({ dateEnd: en === st ? '' : en })} />
              </div>
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--c-fill)', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-ink)', flex: form.allDay !== false ? 1 : '0 0 auto' }}>{t('events.allDayLabel')}</span>
            {form.allDay === false && (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}><TimeField value={form.timeStart || ''} onChange={v => set({ timeStart: v })} compact /></div>
                <span aria-hidden="true" style={{ color: 'var(--c-ink3)' }}>–</span>
                <div style={{ flex: 1, minWidth: 0 }}><TimeField value={form.timeEnd || ''} onChange={v => set({ timeEnd: v })} clearable compact /></div>
              </div>
            )}
            <Switch on={form.allDay !== false} onChange={v => set({ allDay: v, ...(!v && !form.timeStart && !form.timeEnd ? { timeStart: '09:00', timeEnd: '18:00' } : {}) })} label={t('events.allDayLabel')} />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor={`${idp}-notes`} style={fieldLabel}>{t('calendar.notesLabel')}</label>
        <textarea id={`${idp}-notes`} value={form.notes || ''} onChange={e => set({ notes: e.target.value })} placeholder={t('events.notesPlaceholder')} rows={2} />
      </div>

      <div style={{ border: '1px solid var(--c-line)', borderRadius: 14, background: 'var(--c-surface)' }}>
        {showRecurrence && (
          <FormRow label={t('events.repeatLabel')} summary={repeatSummary} hasValue={recurrence !== 'never'} open={open.repeat} onToggle={() => toggle('repeat')}>
            <Picker value={recurrence} options={recurrenceOptions} ariaLabel={t('events.repeatLabel')} onChange={v => set({ recurrence: v, endDate: '', customDates: [] })} />
            {recurrence === 'custom' ? (
              <div>
                <span style={fieldLabel}>{t('events.customDatesLabel')}</span>
                <MultiDateField dates={form.customDates || []} anchorDate={form.date} onChange={v => set({ customDates: v })} />
              </div>
            ) : recurrence !== 'never' && (
              <div>
                <span style={fieldLabel}>{t('events.repeatEndLabel')}</span>
                <DateField value={form.endDate || ''} min={form.date || today} onChange={v => set({ endDate: v })} />
              </div>
            )}
            {futureDates.length > 0 && (
              <div style={{ background: 'rgba(79,195,247,0.08)', border: '1px solid rgba(79,195,247,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 700 }}>{t('events.totalEventsCount', { count: futureDates.length + 1 })}</p>
                <p style={{ color: 'var(--c-ink2)', fontSize: 12, marginTop: 3 }}>
                  {t('workerCalendar.dateRange', {
                    start: formatDate([form.date, ...futureDates].sort().at(0) + 'T12:00:00', { day: 'numeric', month: 'long', year: 'numeric' }, i18n.language),
                    end: formatDate([form.date, ...futureDates].sort().at(-1) + 'T12:00:00', { day: 'numeric', month: 'long', year: 'numeric' }, i18n.language),
                  })}
                </p>
              </div>
            )}
          </FormRow>
        )}

        {!isInstall && (
          <FormRow label={t('calendar.phasesLabel')} summary={phaseParts.length ? phaseParts.join(' · ') : '—'} hasValue={phaseParts.length > 0} open={open.phases} onToggle={() => toggle('phases')}>
            {PHASE_CONFIG.map(p => (
              <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ background: p.bg, color: p.color, borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 800, minWidth: 82, textAlign: 'center', flexShrink: 0 }}>{t(p.labelKey)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DateField value={phases[p.key] || ''} clearable placeholder="—"
                    onChange={v => setForm(f => { const ph = { ...(f.phases || {}) }; if (v) ph[p.key] = v; else delete ph[p.key]; return { ...f, phases: ph } })} />
                </div>
              </div>
            ))}
          </FormRow>
        )}

        <FormRow last label={t('events.extraDetailsLabel')} summary={extraSummary || '—'} hasValue={!!extraSummary} open={open.extra} onToggle={() => toggle('extra')}>
          <div>
            <label htmlFor={`${idp}-quote`} style={fieldLabel}>{t('events.quoteRefLabel')}</label>
            <input id={`${idp}-quote`} value={form.quoteRef || ''} onChange={e => set({ quoteRef: e.target.value })} placeholder={t('events.quoteRefPlaceholder')} />
          </div>
          <div>
            <span style={fieldLabel}>{t('events.eventManagerLabel')}</span>
            <EventManagerField teamId={teamId} name={form.managerName || ''} phone={form.managerPhone || ''} email={form.managerEmail || ''}
              onChange={v => set({ managerName: v.name, managerPhone: v.phone, managerEmail: v.email })} />
          </div>
        </FormRow>
      </div>
    </>
  )
}
