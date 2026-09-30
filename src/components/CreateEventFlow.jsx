import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { formatDate } from '../utils/formatDate'
import { generateDates } from '../utils/recurrence'
import { pushEventToGoogle } from '../utils/googleCalendar'
import DateField from './DateField'
import DateRangeField from './DateRangeField'

const IconCalendarSm = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IconWrench = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
)
const IconCheckSm = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconRepeat = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>
)

const blankForm = (initialDate) => ({
  name:'', date: initialDate || new Date().toISOString().split('T')[0], dateEnd:'',
  location:'', notes:'', recurrence:'never', endDate:'', type:'event', phases:{},
  quoteRef:'', managerName:'', managerPhone:'', managerEmail:'',
})

/**
 * Unico punto da cui si crea un evento in tutta l'app (Calendar.jsx ed
 * Events.jsx la montano allo stesso modo) — prima c'erano due modal diversi,
 * uno molto più semplice (Calendar) che non offriva né template né la scelta
 * Evento/Installazione. Nessuna logica di MODIFICA qui dentro: quella resta
 * a ciascuna pagina, che ha un proprio modal più semplice per l'editing (il
 * toggle tipo/i template non servono lì, vedi il rispettivo `!editing`).
 *
 * Niente più schermata di scelta "evento vuoto o da template": si va
 * sempre dritti al form (più veloce), e se serve un template lo si applica
 * dopo alla lista (già vuota) dalla pagina evento — stesso identico elenco
 * template, vedi il picker in EventDetail.jsx.
 *
 * Props:
 * - open: mostra il flusso
 * - onClose: chiusura completa
 * - initialDate: precompila la data di inizio (es. il giorno selezionato in Calendar)
 * - skipChoice: 'blank' per un form vuoto, oppure un oggetto { name, items }
 *   per un form con quel contenuto già pronto (usato da Archive/InventoryItemHistory
 *   → "Usa come template"; con `allowTypeChoice: true` il form offre anche il
 *   toggle Evento/Rent-Install)
 * - onCreated(eventId, { fromTemplate }): l'evento è stato creato
 */
export default function CreateEventFlow({ open, onClose, initialDate, skipChoice, onCreated }) {
  const { t, i18n } = useTranslation()
  const { user, teamId } = useAuth()
  const today = new Date().toISOString().split('T')[0]

  const RECURRENCE_OPTIONS = [
    { value:'never',   label:t('events.recurrenceNever') },
    { value:'daily',   label:t('events.recurrenceDaily') },
    { value:'weekly',  label:t('events.recurrenceWeekly') },
    { value:'monthly', label:t('events.recurrenceMonthly') },
    { value:'yearly',  label:t('events.recurrenceYearly') },
  ]
  const PHASE_CONFIG = [
    { key:'montaggio',  label:t('calendar.legendAssembly'),    color:'#2563eb', bg:'#dbeafe' },
    { key:'smontaggio', label:t('calendar.legendDisassembly'), color:'#ea580c', bg:'#ffedd5' },
  ]

  const [pendingTemplateItems, setPendingTemplateItems] = useState(null)
  const [form, setForm] = useState(() => blankForm(initialDate))
  const [saving, setSaving] = useState(false)
  // Liste di carico aggiuntive portate da un evento d'archivio usato come template
  const [pendingLists, setPendingLists] = useState({ lists: [], mainListName: '' })
  // Di norma un flusso con lista già pronta (template) non offre il toggle
  // Evento/Rent-Install; qui sì se il chiamante lo chiede esplicitamente.
  const allowTypeChoice = !!(skipChoice && typeof skipChoice === 'object' && skipChoice.allowTypeChoice)

  useEffect(() => {
    if (!open) return
    if (skipChoice && typeof skipChoice === 'object') {
      setForm({ ...blankForm(initialDate), name: skipChoice.name || '' })
      setPendingTemplateItems(skipChoice.items || [])
      setPendingLists({ lists: skipChoice.lists || [], mainListName: skipChoice.mainListName || '' })
    } else {
      // skipChoice === 'blank' (ogni chiamante lo passa — vedi Calendar.jsx/
      // Events.jsx) o comunque non un oggetto template: form vuoto.
      setPendingTemplateItems(null)
      setPendingLists({ lists: [], mainListName: '' })
      setForm(blankForm(initialDate))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const futureDates = form.recurrence !== 'never' && form.date && form.endDate
    ? generateDates(form.date, form.recurrence, form.endDate) : []

  const saveEvent = async () => {
    if (!form.name.trim() || !form.date) return
    setSaving(true)
    try {
      const seriesId = form.recurrence !== 'never' && futureDates.length > 0
        ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : null
      const base = {
        name: form.name.trim(), location: form.location.trim(),
        notes: form.notes.trim(), dateEnd: form.dateEnd || null,
        items: pendingTemplateItems || [],
        lists: pendingTemplateItems ? pendingLists.lists : [],
        mainListName: pendingTemplateItems ? pendingLists.mainListName : '',
        teamId,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user.uid,
        recurrence: form.recurrence, seriesId,
        type: form.type || 'event',
        phases: form.phases || {},
        quoteRef: form.quoteRef.trim(),
        eventManager: {
          name: form.managerName.trim(), phone: form.managerPhone.trim(), email: form.managerEmail.trim(),
        },
      }
      const ref = await addDoc(collection(db, 'events'), { ...base, date: form.date })
      pushEventToGoogle(ref.id)
      for (const date of futureDates) {
        const r = await addDoc(collection(db, 'events'), { ...base, date, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        pushEventToGoogle(r.id)
      }
      onCreated?.(ref.id, { fromTemplate: !!pendingTemplateItems })
      onClose?.()
    } finally { setSaving(false) }
  }

  const formDrag = useModalDrag(() => onClose?.(), undefined, saveEvent, open)

  useModalScrollLock(open)

  if (!open) return null

  return (
        <div className={`modal-overlay${formDrag.closing ? ' closing' : ''}`} onClick={formDrag.onOverlayClick}>
          <div className={`modal${formDrag.jiggling ? ' modal-jiggle' : ''}${formDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...formDrag.props}>
            <button className="close-btn" onClick={formDrag.close} aria-label={t('common.close')}>✕</button>
            <h2>{pendingTemplateItems && !allowTypeChoice ? t('events.newEventFromTemplateTitle') : t('calendar.newEventTitle')}</h2>

            {(!pendingTemplateItems || allowTypeChoice) && (
              <div style={{ display:'flex', gap:8, marginBottom:16, background:'var(--card2)', borderRadius:12, padding:4 }}>
                <button
                  onClick={() => setForm(f => ({...f, type:'event'}))}
                  aria-pressed={form.type !== 'installation'}
                  style={{ flex:1, padding:'9px', borderRadius:9, fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    background: form.type !== 'installation' ? 'var(--card)' : 'transparent',
                    color: form.type !== 'installation' ? 'var(--text)' : 'var(--text2)',
                    boxShadow: form.type !== 'installation' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                    border: 'none', transition:'all 0.15s',
                  }}><IconCalendarSm /> {t('events.typeEvent')}</button>
                <button
                  onClick={() => setForm(f => ({...f, type:'installation', recurrence:'never', endDate:''}))}
                  aria-pressed={form.type === 'installation'}
                  style={{ flex:1, padding:'9px', borderRadius:9, fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    background: form.type === 'installation' ? '#ede9fe' : 'transparent',
                    color: form.type === 'installation' ? '#5b4fcf' : 'var(--text2)',
                    boxShadow: form.type === 'installation' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                    border: form.type === 'installation' ? '1px solid #ddd6fe' : '1px solid transparent',
                    transition:'all 0.15s',
                  }}><IconWrench /> {t('events.typeInstallation')}</button>
              </div>
            )}
            {pendingTemplateItems && (
              <div style={{ background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ color:'var(--blue)' }}><IconCheckSm /></span>
                <p style={{ color:'var(--blue)', fontSize:13, fontWeight:600 }}>
                  {t('events.readyListMsg', { count: pendingTemplateItems.length })}
                </p>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="cef-name">{t('calendar.eventNameLabel')}</label>
              <input id="cef-name" value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder={t('calendar.eventNamePlaceholder')} />
            </div>
            <div className="form-group">
              <label>{t('calendar.eventDateLabel')} {form.type === 'installation' ? <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('events.endDateHintInstallation')}</span> : <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('events.endDateHintEvent')}</span>}</label>
              {/* Un solo campo stile "booking" al posto di inizio/fine
                  separati: un tap = giorno singolo, un secondo tap su un
                  giorno diverso estende fino a lì. dateEnd resta '' per un
                  giorno singolo (stessa convenzione letta altrove in app). */}
              <DateRangeField
                start={form.date}
                end={form.dateEnd || form.date}
                onChange={(s, e) => setForm(f => ({ ...f, date: s, dateEnd: e === s ? '' : e }))}
              />
            </div>
            {form.type !== 'installation' && (
              <div className="form-group">
                <label style={{ marginBottom:8, display:'block' }}>{t('events.phasesEventLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('common.optional')}</span></label>
                {PHASE_CONFIG.map(p => (
                  <div key={p.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7 }}>
                    <span style={{ background:p.bg, color:p.color, borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:800, minWidth:82, textAlign:'center', flexShrink:0 }}>{p.label}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <DateField value={form.phases?.[p.key] || ''} clearable placeholder="—"
                        onChange={v => setForm(f => { const ph = {...(f.phases||{})}; if (v) ph[p.key] = v; else delete ph[p.key]; return {...f, phases:ph} })} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="form-group">
              <label htmlFor="cef-location">{t('calendar.locationLabel')}</label>
              <input id="cef-location" value={form.location} onChange={e => setForm({...form, location:e.target.value})} placeholder={t('calendar.locationPlaceholder')} />
            </div>
            <div className="form-group">
              <label htmlFor="cef-notes">{t('calendar.notesLabel')}</label>
              <textarea id="cef-notes" value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder={t('events.notesPlaceholder')} rows={2} />
            </div>
            <div className="form-group">
              <label htmlFor="cef-quote">{t('events.quoteRefLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('common.optional')}</span></label>
              <input id="cef-quote" value={form.quoteRef} onChange={e => setForm({...form, quoteRef:e.target.value})} placeholder={t('events.quoteRefPlaceholder')} />
            </div>
            <div className="form-group">
              <label htmlFor="cef-manager-name">{t('events.eventManagerLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('common.optional')}</span></label>
              <input id="cef-manager-name" value={form.managerName} onChange={e => setForm({...form, managerName:e.target.value})} placeholder={t('events.eventManagerNamePlaceholder')} style={{ marginBottom:8 }} />
              <div style={{ display:'flex', gap:8 }}>
                <input value={form.managerPhone} onChange={e => setForm({...form, managerPhone:e.target.value})} placeholder={t('events.eventManagerPhonePlaceholder')} type="tel" style={{ flex:1 }} />
                <input value={form.managerEmail} onChange={e => setForm({...form, managerEmail:e.target.value})} placeholder={t('events.eventManagerEmailPlaceholder')} type="email" style={{ flex:1 }} />
              </div>
            </div>
            {form.type !== 'installation' && (
              <>
                <div className="form-group">
                  <label htmlFor="cef-recurrence" style={{ display:'flex', alignItems:'center', gap:6 }}><IconRepeat /> {t('events.repeatLabel')}</label>
                  <select id="cef-recurrence" value={form.recurrence} onChange={e => setForm({...form, recurrence:e.target.value, endDate:''})}>
                    {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {form.recurrence !== 'never' && (
                  <div className="form-group">
                    <label>{t('events.repeatEndLabel')}</label>
                    <DateField value={form.endDate} min={form.date || today}
                      onChange={v => setForm({...form, endDate:v})} />
                  </div>
                )}
                {futureDates.length > 0 && (
                  <div style={{ background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
                    <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><IconRepeat /> {t('events.totalEventsCount', { count: futureDates.length + 1 })}</p>
                    <p style={{ color:'var(--text2)', fontSize:12, marginTop:3 }}>
                      {t('workerCalendar.dateRange', {
                        start: formatDate(form.date+'T12:00:00', { day:'numeric', month:'long', year:'numeric' }, i18n.language),
                        end: formatDate(futureDates.at(-1)+'T12:00:00', { day:'numeric', month:'long', year:'numeric' }, i18n.language),
                      })}
                    </p>
                  </div>
                )}
              </>
            )}
            <button onClick={saveEvent} className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={saving || !form.name.trim() || !form.date}>
              {saving ? t('common.saving')
                : pendingTemplateItems ? t('events.createFromTemplateAndGo')
                : futureDates.length > 0 ? t('events.createMultiple', { count: futureDates.length + 1 })
                : t('calendar.createEvent')}
            </button>
          </div>
        </div>
  )
}
