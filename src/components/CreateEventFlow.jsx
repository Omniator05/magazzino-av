import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, where, serverTimestamp } from 'firebase/firestore'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { formatDate } from '../utils/formatDate'
import { generateDates } from '../utils/recurrence'
import { syncEventToGoogle } from '../utils/googleCalendar'
import DateField from './DateField'

const IconDoc = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
)
const IconList = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
)
const IconChevronSm = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)
const IconChevronLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
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
})

/**
 * Unico punto da cui si crea un evento in tutta l'app (Calendar.jsx ed
 * Events.jsx la montano allo stesso modo) — prima c'erano due modal diversi,
 * uno molto più semplice (Calendar) che non offriva né template né la scelta
 * Evento/Installazione. Nessuna logica di MODIFICA qui dentro: quella resta
 * a ciascuna pagina, che ha un proprio modal più semplice per l'editing (il
 * toggle tipo/i template non servono lì, vedi il rispettivo `!editing`).
 *
 * Props:
 * - open: mostra il flusso
 * - onClose: chiusura completa (qualunque step)
 * - initialDate: precompila la data di inizio (es. il giorno selezionato in Calendar)
 * - skipChoice: 'blank' salta dritto al form vuoto (usato da Dashboard → "Crea evento"),
 *   oppure un oggetto { name, items } per saltare dritto al form con quel contenuto
 *   già pronto (usato da Archive → "Usa come template")
 * - onCreated(eventId, { fromTemplate }): l'evento è stato creato
 */
export default function CreateEventFlow({ open, onClose, initialDate, skipChoice, onCreated }) {
  const { t, i18n } = useTranslation()
  const { user, team, teamId } = useAuth()
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

  const [step, setStep] = useState('choice') // 'choice' | 'templates' | 'form'
  const [templates, setTemplates] = useState([])
  const [pendingTemplateItems, setPendingTemplateItems] = useState(null)
  const [form, setForm] = useState(() => blankForm(initialDate))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (skipChoice === 'blank') {
      setPendingTemplateItems(null)
      setForm(blankForm(initialDate))
      setStep('form')
    } else if (skipChoice && typeof skipChoice === 'object') {
      setForm({ ...blankForm(initialDate), name: skipChoice.name || '' })
      setPendingTemplateItems(skipChoice.items || [])
      setStep('form')
    } else {
      setPendingTemplateItems(null)
      setForm(blankForm(initialDate))
      setStep('choice')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || !teamId) return
    const q = query(collection(db, 'templates'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [open, teamId])

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
        teamId,
        createdAt: serverTimestamp(), createdBy: user.uid,
        recurrence: form.recurrence, seriesId,
        type: form.type || 'event',
        phases: form.phases || {},
      }
      const ref = await addDoc(collection(db, 'events'), { ...base, date: form.date })
      const gId = await syncEventToGoogle({ ...base, date: form.date }, team?.googleCalendarId)
      if (gId) await updateDoc(doc(db, 'events', ref.id), { googleEventId: gId })
      for (const date of futureDates) {
        const r = await addDoc(collection(db, 'events'), { ...base, date, createdAt: serverTimestamp() })
        const gId2 = await syncEventToGoogle({ ...base, date }, team?.googleCalendarId)
        if (gId2) await updateDoc(doc(db, 'events', r.id), { googleEventId: gId2 })
      }
      onCreated?.(ref.id, { fromTemplate: !!pendingTemplateItems })
      onClose?.()
    } finally { setSaving(false) }
  }

  const chooseBlank = () => { setPendingTemplateItems(null); setStep('form') }
  const chooseTemplate = (tpl) => {
    setForm(f => ({ ...f, name: tpl.name }))
    setPendingTemplateItems((tpl.components || []).map(c => ({ id:c.id, name:c.name, category:c.category, qty:c.qty, loaded:false, returned:false })))
    setStep('form')
  }

  const choiceDrag    = useModalDrag(() => onClose?.(), undefined, undefined, open && step === 'choice')
  const templatesDrag = useModalDrag(() => onClose?.(), undefined, undefined, open && step === 'templates')
  const formDrag      = useModalDrag(() => onClose?.(), undefined, saveEvent, open && step === 'form')

  useModalScrollLock(open)

  if (!open) return null

  return (
    <>
      {step === 'choice' && (
        <div className={`modal-overlay${choiceDrag.closing ? ' closing' : ''}`} onClick={choiceDrag.onOverlayClick}>
          <div className={`modal${choiceDrag.jiggling ? ' modal-jiggle' : ''}${choiceDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...choiceDrag.props}>
            <button className="close-btn" onClick={choiceDrag.close} aria-label={t('common.close')}>✕</button>
            <h2>{t('calendar.newEventTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16 }}>{t('events.newEventModalDesc')}</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:8 }}>
              <button onClick={chooseBlank}
                style={{ background:'var(--card2)', border:'2px solid var(--border)', borderRadius:16, padding:'24px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <span style={{ color:'var(--text)' }}><IconDoc /></span>
                <span style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>{t('events.blankEvent')}</span>
                <span style={{ fontSize:12, color:'var(--text2)', textAlign:'center', lineHeight:1.4 }}>{t('events.blankEventDesc')}</span>
              </button>
              <button onClick={() => setStep('templates')}
                style={{ background:'rgba(79,195,247,0.08)', border:'2px solid rgba(79,195,247,0.3)', borderRadius:16, padding:'24px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <span style={{ color:'var(--blue)' }}><IconList /></span>
                <span style={{ fontWeight:700, fontSize:15, color:'var(--blue)' }}>{t('archive.useTemplate')}</span>
                <span style={{ fontSize:12, color:'var(--text2)', textAlign:'center', lineHeight:1.4 }}>{t('events.templateOptionDesc')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'templates' && (
        <div className={`modal-overlay${templatesDrag.closing ? ' closing' : ''}`} onClick={templatesDrag.onOverlayClick}>
          <div className={`modal${templatesDrag.jiggling ? ' modal-jiggle' : ''}${templatesDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...templatesDrag.props}>
            <button className="close-btn" onClick={templatesDrag.close} aria-label={t('common.close')}>✕</button>
            <button onClick={() => setStep('choice')} aria-label={t('common.back')}
              style={{ display:'inline-flex', alignItems:'center', gap:4, color:'var(--text2)', fontSize:13, fontWeight:700, marginBottom:10, background:'transparent', padding:'6px 10px', margin:'0 0 10px -10px', borderRadius:10 }}>
              <IconChevronLeft /> {t('common.back')}
            </button>
            <h2>{t('archive.useTemplate')}</h2>
            {templates.length === 0 ? (
              <div style={{ padding:'16px', background:'var(--card2)', borderRadius:10, textAlign:'center', marginTop:8 }}>
                <p style={{ color:'var(--text2)', fontSize:13 }}>{t('events.noTemplates')}</p>
              </div>
            ) : (
              <div style={{ marginTop:8 }}>
                {templates.map(tpl => (
                  <button key={tpl.id} onClick={() => chooseTemplate(tpl)}
                    style={{ width:'100%', padding:'12px 16px', borderRadius:12, background:'rgba(79,195,247,0.07)', border:'1px solid rgba(79,195,247,0.25)', color:'var(--text)', fontWeight:600, fontSize:14, textAlign:'left', marginBottom:8, display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ color:'var(--blue)', flexShrink:0 }}><IconList /></span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:700 }}>{tpl.name}</p>
                      <p style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>
                        {t('events.itemsCount', { count: (tpl.components || []).length })}
                        {tpl.notes ? ` · ${tpl.notes}` : ''}
                      </p>
                    </div>
                    <span style={{ color:'var(--blue)' }}><IconChevronSm /></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'form' && (
        <div className={`modal-overlay${formDrag.closing ? ' closing' : ''}`} onClick={formDrag.onOverlayClick}>
          <div className={`modal${formDrag.jiggling ? ' modal-jiggle' : ''}${formDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...formDrag.props}>
            <button className="close-btn" onClick={formDrag.close} aria-label={t('common.close')}>✕</button>
            <h2>{pendingTemplateItems ? t('events.newEventFromTemplateTitle') : t('calendar.newEventTitle')}</h2>

            {!pendingTemplateItems && (
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
              <label>{t('calendar.startDateLabel')}</label>
              <DateField value={form.date} onChange={v => setForm({...form, date:v})} />
            </div>
            <div className="form-group">
              <label>{t('calendar.endDateLabel')} {form.type === 'installation' ? <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('events.endDateHintInstallation')}</span> : <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('events.endDateHintEvent')}</span>}</label>
              <DateField value={form.dateEnd} min={form.date} clearable onChange={v => setForm({...form, dateEnd:v})} placeholder={t('common.noneOption')} />
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
      )}
    </>
  )
}
