import { useState, useEffect, useRef } from 'react'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import EventFormFields from './EventFormFields'
import { generateDates } from '../utils/recurrence'
import { pushEventToGoogle } from '../utils/googleCalendar'
import { notifyTeamPush } from '../utils/pushNotifications'
import { rememberEventManager } from '../utils/eventManagers'

const IconCheckSm = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const blankForm = (initialDate) => ({
  name:'', date: initialDate || new Date().toISOString().split('T')[0], dateEnd:'',
  allDay:true, timeStart:'', timeEnd:'',
  location:'', notes:'', recurrence:'never', endDate:'', customDates:[], type:'event', phases:{},
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
  const { t } = useTranslation()
  const { user, teamId } = useAuth()
  const today = new Date().toISOString().split('T')[0]

  const [pendingTemplateItems, setPendingTemplateItems] = useState(null)
  const formBase = useRef('')   // fotografia del modulo all'apertura: serve a sapere se hai cambiato qualcosa
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
      const initial = { ...blankForm(initialDate), name: skipChoice.name || '' }
      formBase.current = JSON.stringify(initial)
      setForm(initial)
      setPendingTemplateItems(skipChoice.items || [])
      setPendingLists({ lists: skipChoice.lists || [], mainListName: skipChoice.mainListName || '' })
    } else {
      // skipChoice === 'blank' (ogni chiamante lo passa — vedi Calendar.jsx/
      // Events.jsx) o comunque non un oggetto template: form vuoto.
      setPendingTemplateItems(null)
      setPendingLists({ lists: [], mainListName: '' })
      const initial = blankForm(initialDate)
      formBase.current = JSON.stringify(initial)
      setForm(initial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // "Personalizzato" non segue una regola (ogni N giorni/settimane/mesi):
  // le date arrivano già scelte una per una da MultiDateField, non vanno
  // generate — bastano quelle (meno l'eventuale doppione della data
  // principale, già esclusa lì all'origine).
  const futureDates = form.recurrence === 'custom'
    ? (form.customDates || [])
    : (form.recurrence !== 'never' && form.date && form.endDate
      ? generateDates(form.date, form.recurrence, form.endDate) : [])

  const saveEvent = async () => {
    if (!form.name.trim() || !form.date) return
    setSaving(true)
    try {
      const seriesId = form.recurrence !== 'never' && futureDates.length > 0
        ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : null
      const base = {
        name: form.name.trim(), location: form.location.trim(),
        notes: form.notes.trim(), dateEnd: form.dateEnd || null,
        allDay: form.allDay, timeStart: form.allDay ? null : (form.timeStart || null), timeEnd: form.allDay ? null : (form.timeEnd || null),
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
      if (base.eventManager.name) rememberEventManager(teamId, user.uid, base.eventManager).catch(() => {})
      // Solo admin, solo una volta (anche se ricorrente — un digest per ogni
      // occorrenza sarebbe rumore): gli altri admin sanno che è stato
      // aggiunto un nuovo evento, non serve saperlo per ciascuna data futura.
      notifyTeamPush({
        title: t('calendar.pushNewEventTitle'),
        body: base.name,
        url: `/events/${ref.id}`,
        audience: { type: 'admins' },
      })
      for (const date of futureDates) {
        const r = await addDoc(collection(db, 'events'), { ...base, date, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        pushEventToGoogle(r.id)
      }
      onCreated?.(ref.id, { fromTemplate: !!pendingTemplateItems })
      onClose?.()
    } finally { setSaving(false) }
  }

  // Colonna "Nuovo evento": col clic fuori chiude solo se non hai scritto niente, altrimenti chiede se salvare
  const flowGuard = useUnsavedGuard(() => open && JSON.stringify(form) !== formBase.current)
  const formDrag = useModalDrag(() => onClose?.(), flowGuard.guard, saveEvent, open)
  flowGuard.attach(formDrag)

  useModalScrollLock(open)

  if (!open) return null

  return (
        <div className={`modal-overlay rc-drawer-overlay${formDrag.closing ? ' closing' : ''}`} onClick={e => { if (e.target === e.currentTarget) formDrag.close() }}>
          <div className={`modal rc-drawer rc-drawer-narrow${formDrag.jiggling ? ' modal-jiggle' : ''}${formDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...formDrag.props}>
            <div className="rc-drawer-head rc-dc"><div className="rc-drawer-titlebar rc-dc">
              <button className="close-btn" onClick={formDrag.close} aria-label={t('common.close')}>✕</button>
              <h2>{pendingTemplateItems && !allowTypeChoice ? t('events.newEventFromTemplateTitle') : t('calendar.newEventTitle')}</h2>
            </div></div>

            <div className="rc-drawer-body rc-dc">
            {pendingTemplateItems && (
              <div style={{ background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ color:'var(--blue)' }}><IconCheckSm /></span>
                <p style={{ color:'var(--blue)', fontSize:13, fontWeight:600 }}>
                  {t('events.readyListMsg', { count: pendingTemplateItems.length })}
                </p>
              </div>
            )}
            {/* Stessi campi della colonna del Calendario desktop (EventFormFields):
                nome, luogo, "Quando", note e le righe retraibili con riepilogo. */}
            <div className="rc-ev-form" style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <EventFormFields form={form} setForm={setForm} idp="cef" teamId={teamId} today={today} futureDates={futureDates}
                showType={!pendingTemplateItems || allowTypeChoice} showRecurrence useRange />
            </div>
            </div>
            <div className="rc-drawer-foot rc-dc">
            <button onClick={saveEvent} className="btn btn-primary btn-full" style={{ marginTop:20 }}
              disabled={saving || !form.name.trim() || !form.date}>
              {saving ? t('common.saving')
                : pendingTemplateItems ? t('events.createFromTemplateAndGo')
                : futureDates.length > 0 ? t('events.createMultiple', { count: futureDates.length + 1 })
                : t('calendar.createEvent')}
            </button>
            </div>
          </div>
        </div>
  )
}
