import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, usernameToEmail } from '../context/AuthContext'
import { isProPlan, FREE_LIMITS, promptLimitReached } from '../utils/planLimits'
import { formatDate } from '../utils/formatDate'
import { useConfirm } from '../context/ConfirmProvider'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { db, secondaryAuth } from '../firebase'
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, query, orderBy, where } from 'firebase/firestore'
import { Check, Save, Trash, Edit, User, Warn, Box, Calendar } from '../components/Icon'
import Toast from '../components/Toast'
import SaveButton from '../components/SaveButton'
import BackHomeButton from '../components/BackHomeButton'
import FabButton from '../components/FabButton'
import Picker from '../components/Picker'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  signOut
} from 'firebase/auth'

const EMPTY_ORG_CONFIG = { eventName:'', frequency:'weekly', weekday:4, monthDay:1, customDates:[], endDate:'' }

// Campi di configurazione evento per il ruolo Organizzatore — condivisi tra
// il form di creazione account e il pannello di modifica di un utente esistente.
function OrgConfigFields({ orgConfig, setOrgConfig, newCustomDate, setNewCustomDate, addCustomDate, removeCustomDate }) {
  const { t, i18n } = useTranslation()
  const WEEKDAY_NAMES = [
    t('adminUsers.weekdaySunday'), t('adminUsers.weekdayMonday'), t('adminUsers.weekdayTuesday'),
    t('adminUsers.weekdayWednesday'), t('adminUsers.weekdayThursday'), t('adminUsers.weekdayFriday'), t('adminUsers.weekdaySaturday'),
  ]
  return (
    <>
      <div className="form-group">
        <label>{t('adminUsers.eventNameLabel')}</label>
        <input value={orgConfig.eventName} onChange={e => setOrgConfig(c => ({ ...c, eventName:e.target.value }))} placeholder={t('adminUsers.eventNamePlaceholder')} />
      </div>
      <div className="form-group">
        <label>{t('adminUsers.frequencyLabel')}</label>
        <select value={orgConfig.frequency} onChange={e => setOrgConfig(c => ({ ...c, frequency:e.target.value }))}>
          <option value="weekly">{t('adminUsers.frequencyWeekly')}</option>
          <option value="monthly">{t('adminUsers.frequencyMonthly')}</option>
          <option value="custom">{t('adminUsers.frequencyCustom')}</option>
        </select>
      </div>

      {orgConfig.frequency === 'weekly' && (
        <div className="form-group">
          <label>{t('adminUsers.weekdayLabel')}</label>
          <select value={orgConfig.weekday} onChange={e => setOrgConfig(c => ({ ...c, weekday:Number(e.target.value) }))}>
            {WEEKDAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
          </select>
        </div>
      )}

      {orgConfig.frequency === 'monthly' && (
        <div className="form-group">
          <label>{t('adminUsers.monthDayLabel')}</label>
          <input type="number" min="1" max="31" value={orgConfig.monthDay} onChange={e => setOrgConfig(c => ({ ...c, monthDay:Number(e.target.value) }))} />
        </div>
      )}

      {orgConfig.frequency === 'custom' && (
        <div className="form-group">
          <label>{t('adminUsers.specificDatesLabel')}</label>
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <input type="date" value={newCustomDate} onChange={e => setNewCustomDate(e.target.value)} style={{ flex:1 }} />
            <button onClick={addCustomDate} className="btn btn-secondary" style={{ flexShrink:0 }}>{t('adminUsers.addDate')}</button>
          </div>
          {orgConfig.customDates.map(d => (
            <div key={d} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 10px', marginBottom:5 }}>
              <span style={{ fontSize:13 }}>{formatDate(d + 'T12:00:00', { day:'numeric', month:'long', year:'numeric' }, i18n.language)}</span>
              <button onClick={() => removeCustomDate(d)} className="btn-no-anim" style={{ background:'transparent', color:'var(--red)', fontSize:12, fontWeight:700 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {orgConfig.frequency !== 'custom' && (
        <div className="form-group" style={{ marginBottom:0 }}>
          <label>{t('calendar.endDateLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('adminUsers.endDateOptional')}</span></label>
          <input type="date" value={orgConfig.endDate} onChange={e => setOrgConfig(c => ({ ...c, endDate:e.target.value }))} />
        </div>
      )}
    </>
  )
}

// Selettore evento per il ruolo Organizzatore evento (generico) — l'organizzatore
// carica i propri contenuti (video, pptx, sfondo di riserva) per un evento specifico
// già presente in calendario, invece di avere una programmazione ricorrente come Brasserie.
function EventOrganizerFields({ events, assignedEventId, setAssignedEventId }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="form-group" style={{ marginBottom:0 }}>
      <label>{t('adminUsers.linkedEventLabel')}</label>
      <select value={assignedEventId} onChange={e => setAssignedEventId(e.target.value)}>
        <option value="">{t('adminUsers.selectEventPlaceholder')}</option>
        {events.map(ev => (
          <option key={ev.id} value={ev.id}>
            {ev.name} — {formatDate(ev.date + 'T12:00:00', { day:'numeric', month:'long', year:'numeric' }, i18n.language)}
          </option>
        ))}
      </select>
      {events.length === 0 && (
        <p style={{ color:'var(--text2)', fontSize:12, marginTop:5 }}>{t('adminUsers.noFutureEvents')}</p>
      )}
    </div>
  )
}

export default function SettingsUsers() {
  const { t, i18n } = useTranslation()
  const { user, teamId, team } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [users, setUsers]             = useState([])
  const [showCreate, setShowCreate]   = useState(false)
  const [showDetail, setShowDetail]   = useState(null)
  const createDrag = useModalDrag(() => setShowCreate(false))
  const detailDrag  = useModalDrag(() => setShowDetail(null))
  useModalScrollLock(showCreate || !!showDetail)
  const [editMode, setEditMode]       = useState(false)
  const [form, setForm]               = useState({ name:'', username:'', password:'', email:'', role:'worker', canManageInventory:false })
  const [newPw, setNewPw]             = useState('')
  const [newUsername, setNewUsername]   = useState('')
  const [error, setError]             = useState('')
  const [detailMsg, setDetailMsg]     = useState({ text:'', type:'' })
  const [loading, setLoading]         = useState(false)
  const [toast, setToast]             = useState('')
  const [detailUnavail, setDetailUnavail] = useState([])
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)
  const [orgConfig, setOrgConfig]     = useState(EMPTY_ORG_CONFIG)
  const [newCustomDate, setNewCustomDate] = useState('')
  const [events, setEvents]           = useState([])
  const [assignedEventId, setAssignedEventId] = useState('')

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'profiles'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setUsers(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [teamId])

  // Eventi da oggi in poi, per il selettore dell'Organizzatore evento
  useEffect(() => {
    if (!teamId) return
    const todayStr = new Date().toISOString().slice(0, 10)
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date'))
    return onSnapshot(q, snap => setEvents(
      snap.docs
        .map(d => ({ id:d.id, ...d.data() }))
        .filter(e => (e.dateEnd || e.date) >= todayStr)
    ))
  }, [teamId])

  useEffect(() => {
    if (!showDetail || !teamId) { setDetailUnavail([]); return }
    // Le regole Firestore valutano "list" sulla query stessa: senza un filtro
    // di uguaglianza su teamId corrispondente alla regola (resource.data.teamId),
    // l'intera richiesta viene rifiutata con permission-denied, anche se il
    // worker non ha alcuna indisponibilità registrata.
    const q = query(collection(db, 'unavailability'), where('teamId', '==', teamId), where('workerId', '==', showDetail.id))
    return onSnapshot(q, snap => setDetailUnavail(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [showDetail?.id, teamId])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }
  const clearDetailMsg = () => setDetailMsg({ text:'', type:'' })

  // ── Crea account ──────────────────────────────────────────────
  // Ritorna true solo se l'account è stato davvero creato — SaveButton
  // mostra la spunta e chiude solo in quel caso, mai sui rami di validazione/
  // limite piano gratuito che si fermano prima.
  const createAccount = async () => {
    if (!form.name.trim() || !form.username.trim() || form.password.length < 6) {
      setError(t('adminUsers.errorFillAllFields')); return false
    }
    if (form.role === 'organizzatore-evento' && !assignedEventId) {
      setError(t('adminUsers.errorOrgLinkedEvent')); return false
    }
    const username = form.username.toLowerCase().trim().replace(/\s+/g, '.')
    if (users.some(u => u.username === username)) {
      setError(t('adminUsers.errorUsernameTaken')); return false
    }
    // Piano gratuito: 1 admin, 3 magazzinieri — chi crea account qui è
    // sempre l'admin stesso (pagina admin-only), niente da controllare oltre
    // al ruolo scelto.
    if (!isProPlan(team)) {
      const role = form.role || 'worker'
      if (role === 'admin' && users.filter(u => u.role === 'admin').length >= FREE_LIMITS.admins) {
        await promptLimitReached({ confirm, navigate, isAdmin: true, t, message: t('planLimits.adminsMsg', { limit: FREE_LIMITS.admins }) })
        return false
      }
      if (role === 'worker' && users.filter(u => u.role === 'worker').length >= FREE_LIMITS.workers) {
        await promptLimitReached({ confirm, navigate, isAdmin: true, t, message: t('planLimits.workersMsg', { limit: FREE_LIMITS.workers }) })
        return false
      }
    }
    setLoading(true); setError('')

    const internalEmail = usernameToEmail(username)

    let cred = null
    try {
      // Crea il nuovo utente su un'app Firebase secondaria: non tocca la
      // sessione admin corrente (createUserWithEmailAndPassword su `auth`
      // switcherebbe l'admin al nuovo utente appena creato).
      cred = await createUserWithEmailAndPassword(secondaryAuth, internalEmail, form.password)

      // Salva il profilo
      await setDoc(doc(db, 'profiles', cred.user.uid), {
        name:          form.name.trim(),
        username,
        internalEmail,
        email:         form.email.trim().toLowerCase() || null,
        role:          form.role || 'worker',
        teamId:        teamId,
        approved:      true,
        active:        true,
        createdAt:     new Date().toISOString(),
        createdBy:     user.uid,
        ...(form.role === 'organizzatore-evento'
          ? { assignedEventId }
          : {}),
        ...(form.role === 'worker'
          ? { canManageInventory: !!form.canManageInventory }
          : {}),
      })

      await signOut(secondaryAuth)

      // Email di invito best-effort: solo se è stata data un'email vera, e
      // non deve mai far sembrare fallita una creazione account già riuscita.
      const inviteEmail = form.email.trim().toLowerCase()
      if (inviteEmail) {
        try {
          const idToken = await user.getIdToken()
          await fetch('/api/send-invite-email', {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ toEmail: inviteEmail, workerName: form.name.trim(), username, password: form.password }),
          })
        } catch {}
      }

      setForm({ name:'', username:'', password:'', email:'', role:'worker', canManageInventory:false })
      setOrgConfig(EMPTY_ORG_CONFIG)
      setAssignedEventId('')
      return true
    } catch(e) {
      // Il profilo non si è salvato: se l'account Auth era stato creato,
      // ripulisci — altrimenti resta orfano e blocca per sempre quello username.
      if (cred) await cred.user.delete().catch(() => {})
      const msgs = {
        'auth/email-already-in-use': t('adminUsers.errorEmailInUse'),
        'auth/weak-password':        t('adminUsers.errorWeakPassword'),
      }
      setError(msgs[e.code] || e.message)
    } finally { setLoading(false) }
  }

  // ── Approva richiesta di adesione (self-signup "unisciti a squadra") ──
  const approveUser = async () => {
    await updateDoc(doc(db, 'profiles', showDetail.id), { approved: true })
    setShowDetail(d => ({ ...d, approved: true }))
    clearDetailMsg()
    showToast(t('adminUsers.approvedToast', { name: showDetail.name }))
  }

  // ── Rifiuta richiesta di adesione ──────────────────────────────
  const rejectUser = async () => {
    if (!(await confirm({
      title: t('adminUsers.confirmRejectTitle'),
      message: t('adminUsers.confirmRejectMessage', { name: showDetail.name }),
      confirmLabel: t('adminUsers.confirmRejectLabel'),
      danger: true,
    }))) return
    const name = showDetail.name
    await deleteDoc(doc(db, 'profiles', showDetail.id))
    setShowDetail(null)
    showToast(t('adminUsers.rejectedToast', { name }))
  }

  // ── Attiva / disattiva ────────────────────────────────────────
  const toggleActive = async () => {
    const isActive = showDetail.active !== false
    if (!(await confirm({
      title: isActive ? t('adminUsers.confirmDeactivateTitle') : t('adminUsers.confirmReactivateTitle'),
      message: t('adminUsers.confirmToggleActiveMessage', { action: isActive ? t('adminUsers.deactivateAction') : t('adminUsers.reactivateAction'), name: showDetail.name }),
      confirmLabel: isActive ? t('adminUsers.confirmDeactivateLabel') : t('adminUsers.confirmReactivateLabel'),
      danger: isActive,
    }))) return
    await updateDoc(doc(db, 'profiles', showDetail.id), { active: !isActive })
    setShowDetail(d => ({ ...d, active: !isActive }))
    clearDetailMsg()
    showToast(isActive ? t('adminUsers.accessDeactivatedToast') : t('adminUsers.accessReactivatedToast'))
  }

  // ── Cambia ruolo (Admin / Magazziniere / Organizzatore) ──
  const ROLE_LABELS = { admin: t('profile.roleAdmin'), worker: t('adminUsers.roleMagazziniere'), 'organizzatore-brasserie': t('adminUsers.roleOrgBrasserieOption'), 'organizzatore-evento': t('adminUsers.roleOrgEventOption') }
  // Versione corta SOLO per il badge compatto nella riga utente: "Organizzatore
  // Brasserie/evento" per intero non ci sta su una riga su mobile e finisce
  // per andare a capo/coprire l'email sotto. Altrove (conferme, dettaglio)
  // resta l'etichetta piena di ROLE_LABELS.
  const ROLE_BADGE_LABELS = { ...ROLE_LABELS, 'organizzatore-brasserie': t('adminUsers.roleOrgBrasserieBadge'), 'organizzatore-evento': t('adminUsers.roleOrgEventBadge') }
  const changeRole = async (newRole) => {
    if (newRole === showDetail.role) return
    if (!(await confirm({
      title: t('adminUsers.confirmChangeRoleTitle'),
      message: t('adminUsers.confirmChangeRoleMessage', { name: showDetail.name, role: ROLE_LABELS[newRole] }),
      confirmLabel: t('adminUsers.confirmChangeRoleLabel'),
    }))) return
    await updateDoc(doc(db, 'profiles', showDetail.id), { role: newRole })
    setShowDetail(d => ({ ...d, role: newRole }))
    clearDetailMsg()
    setRoleMenuOpen(false)
    showToast(t('adminUsers.roleChangedToast', { name: showDetail.name, role: ROLE_LABELS[newRole] }))
  }

  const toggleCanManageInventory = async () => {
    const next = !showDetail.canManageInventory
    await updateDoc(doc(db, 'profiles', showDetail.id), { canManageInventory: next })
    setShowDetail(d => ({ ...d, canManageInventory: next }))
    showToast(next ? t('adminUsers.canManageInventoryOnToast', { name: showDetail.name }) : t('adminUsers.canManageInventoryOffToast', { name: showDetail.name }))
  }

  // ── Configurazione evento organizzatore (nome + frequenza) ──────
  const saveOrgConfig = async () => {
    if (!orgConfig.eventName.trim()) { setDetailMsg({ text:t('adminUsers.errorOrgEventNameShort'), type:'error' }); return }
    const cleaned = { ...orgConfig, eventName: orgConfig.eventName.trim() }
    await updateDoc(doc(db, 'profiles', showDetail.id), { organizerConfig: cleaned })
    setShowDetail(d => ({ ...d, organizerConfig: cleaned }))
    clearDetailMsg()
    showToast(t('adminUsers.eventConfigSavedToast'))
  }
  const addCustomDate = () => {
    if (!newCustomDate || orgConfig.customDates.includes(newCustomDate)) return
    setOrgConfig(c => ({ ...c, customDates: [...c.customDates, newCustomDate].sort() }))
    setNewCustomDate('')
  }
  const removeCustomDate = (d) => {
    setOrgConfig(c => ({ ...c, customDates: c.customDates.filter(x => x !== d) }))
  }

  // ── Evento collegato (Organizzatore evento) ─────────────────────
  const saveAssignedEvent = async () => {
    if (!assignedEventId) { setDetailMsg({ text:t('adminUsers.errorSelectEvent'), type:'error' }); return }
    await updateDoc(doc(db, 'profiles', showDetail.id), { assignedEventId })
    setShowDetail(d => ({ ...d, assignedEventId }))
    clearDetailMsg()
    showToast(t('adminUsers.linkedEventSavedToast'))
  }

  // ── Rimuovi indisponibilità ────────────────────────────────────
  const removeUnavailability = async (id) => {
    if (!(await confirm({ title: t('adminUsers.confirmRemoveUnavailTitle'), message: t('adminUsers.confirmRemoveUnavailMessage'), confirmLabel: t('adminUsers.confirmRemoveUnavailLabel'), danger: true }))) return
    await deleteDoc(doc(db, 'unavailability', id))
  }

  // ── Cambia password ───────────────────────────────────────────
  // Login temporaneo come utente target su un'app Firebase secondaria:
  // non tocca mai la sessione admin principale (stesso pattern di createAccount).
  const changePassword = async () => {
    if (newPw.length < 6) { setDetailMsg({ text:t('adminUsers.errorPasswordLength'), type:'error' }); return }

    setLoading(true); clearDetailMsg()

    try {
      // 1. Entra come utente target (su secondaryAuth)
      const targetCred = await signInWithEmailAndPassword(secondaryAuth, showDetail.internalEmail, showDetail._currentPw || '??')
      // Se arriviamo qui la password era già quella — caso raro
      await updatePassword(targetCred.user, newPw)
      await signOut(secondaryAuth)
    } catch(loginErr) {
      // Non conosciamo la password attuale → non possiamo cambiarla via client SDK
      // (servirebbero le Firebase Admin SDK / Cloud Functions). Come alternativa
      // pratica, salviamo la nuova password come "richiesta di cambio" e la
      // applichiamo al prossimo login dell'utente.
      await updateDoc(doc(db, 'profiles', showDetail.id), {
        pendingPassword: btoa(newPw),
        pendingPasswordSetAt: new Date().toISOString(),
      })
      clearDetailMsg()
      setNewPw('')
      setLoading(false)
      showToast(t('adminUsers.passwordPendingToast', { name: showDetail.name }))
      return
    }

    clearDetailMsg()
    setNewPw('')
    setLoading(false)
    showToast(t('adminUsers.passwordUpdatedToast', { name: showDetail.name }))
  }

  // ── Modifica username ─────────────────────────────────────────
  const saveUsername = async () => {
    const cleaned = newUsername.toLowerCase().trim().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')
    if (!cleaned) { setDetailMsg({ text:t('adminUsers.errorUsernameEmpty'), type:'error' }); return }
    if (cleaned === showDetail.username) return
    if (users.some(u => u.username === cleaned && u.id !== showDetail.id)) {
      setDetailMsg({ text:t('adminUsers.errorUsernameTakenOther'), type:'error' }); return
    }
    const newInternalEmail = usernameToEmail(cleaned)
    // Aggiorna solo il profilo Firestore — l'email Firebase Auth rimane quella vecchia
    // (cambiare l'email Firebase Auth richiede Admin SDK)
    // Il login funzionerà comunque perché cerca per username → internalEmail nel profilo
    await updateDoc(doc(db, 'profiles', showDetail.id), {
      username: cleaned,
      internalEmail: newInternalEmail,
    })
    setShowDetail(d => ({ ...d, username: cleaned, internalEmail: newInternalEmail }))
    clearDetailMsg()
    showToast(t('adminUsers.usernameUpdatedToast', { username: cleaned }))
  }

  // ── Elimina account ───────────────────────────────────────────
  const deleteAccount = async () => {
    if (!(await confirm({
      title: t('adminUsers.confirmDeleteAccountTitle'),
      message: t('adminUsers.confirmDeleteAccountMessage', { name: showDetail.name }),
      confirmLabel: t('adminUsers.confirmDeleteAccountLabel'),
      danger: true,
    }))) return
    const name = showDetail.name
    await deleteDoc(doc(db, 'profiles', showDetail.id))
    // Il record Firebase Auth rimane ma senza profilo l'utente non accede all'app.
    // Per rimuoverlo del tutto serve Firebase Console → Authentication → elimina utente.
    setShowDetail(null)
    showToast(t('adminUsers.accountDeletedToast', { name }))
  }

  const pending   = users.filter(u => u.approved === false)
  const workers   = users.filter(u => u.role === 'worker' && u.approved !== false)
  const admins    = users.filter(u => u.role === 'admin' && u.approved !== false)
  const organizers = users.filter(u => (u.role === 'organizzatore-brasserie' || u.role === 'organizzatore-evento') && u.approved !== false)

  const ROLE_COLORS = {
    admin: { bg:'rgba(233,69,96,0.15)', color:'var(--accent)' },
    'organizzatore-brasserie': { bg:'rgba(155,89,224,0.15)', color:'#9b59e0' },
    'organizzatore-evento': { bg:'rgba(22,160,133,0.15)', color:'#16a085' },
  }

  const UserRow = ({ u }) => {
    const roleColor = ROLE_COLORS[u.role]
    return (
      <div className="item-row" onClick={() => {
        setShowDetail(u); setEditMode(false); clearDetailMsg(); setNewPw(''); setRoleMenuOpen(false)
        setOrgConfig(u.organizerConfig || EMPTY_ORG_CONFIG)
        setAssignedEventId(u.assignedEventId || '')
      }} style={{ cursor:'pointer' }}>
        <div className="item-icon" style={{
          background: roleColor ? roleColor.bg : u.active !== false ? 'rgba(79,195,247,0.15)' : 'rgba(144,144,176,0.1)',
          color: roleColor ? roleColor.color : u.active !== false ? 'var(--blue)' : 'var(--text2)',
          fontWeight: 800, fontSize: 18,
        }}>
          {u.avatar || (u.name || u.username || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, fontSize:15, color: u.active !== false ? 'var(--text)' : 'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.name}</p>
          <p style={{ color:'var(--text2)', fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.username ? `@${u.username}` : u.email}</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          {u.role === 'worker' && u.canManageInventory && (
            <span title={t('adminUsers.canManageInventoryLabel')} style={{ color:'var(--accent2)', display:'flex', flexShrink:0 }}>
              <Box size={15} />
            </span>
          )}
          <span className="badge" style={{
            background: u.approved === false ? 'rgba(245,166,35,0.15)' : roleColor ? roleColor.bg : u.active !== false ? 'rgba(79,195,247,0.15)' : 'rgba(144,144,176,0.15)',
            color: u.approved === false ? 'var(--accent2)' : roleColor ? roleColor.color : u.active !== false ? 'var(--blue)' : 'var(--text2)',
            whiteSpace:'nowrap', flexShrink:0,
          }}>
            {u.approved === false ? t('adminUsers.waitingBadge') : u.role === 'admin' ? t('adminUsers.adminBadge') : roleColor ? ROLE_BADGE_LABELS[u.role] : u.active !== false ? t('adminUsers.activeBadge') : t('adminUsers.deactivatedBadge')}
          </span>
          <span style={{ color:'var(--text2)', fontSize:18 }}>›</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page users-page">
      <Toast message={toast} />

      <div className="page-header" style={{ display:'flex', alignItems:'center', gap:12 }}>
        <BackHomeButton to="/admin/settings" />
        <div>
          <h1>{t('adminUsers.title')}</h1>
          <p>{t('adminUsers.totalAccounts', { count: users.length })}</p>
        </div>
      </div>

      <FabButton onClick={() => { setShowCreate(true); setError(''); setOrgConfig(EMPTY_ORG_CONFIG); setNewCustomDate(''); setAssignedEventId('') }} ariaLabel={t('adminUsers.newButton')} />

      <div style={{ padding:'8px 0 0' }}>
        {pending.length > 0 && (
          <>
            <p style={{ padding:'0 16px 10px', color:'var(--accent2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('adminUsers.pendingApprovalSection')}</p>
            <div style={{ background:'var(--card)', border:'1px solid rgba(245,166,35,0.3)', borderRadius:'var(--radius)', margin:'0 16px 16px', overflow:'hidden' }}>
              {pending.map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </>
        )}

        {admins.length > 0 && (
          <>
            <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('adminUsers.administratorsSection')}</p>
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'0 16px 16px', overflow:'hidden' }}>
              {admins.map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </>
        )}

        <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('adminUsers.workersSection')}</p>
        <div style={{ margin:'0 16px 16px', background:'rgba(79,195,247,0.05)', border:'1px solid rgba(79,195,247,0.15)', borderRadius:'var(--radius)', padding:'14px' }}>
          <p style={{ color:'var(--blue)', fontWeight:700, fontSize:13, marginBottom:6 }}>{t('adminUsers.howLoginWorksTitle')}</p>
          <p style={{ color:'var(--text2)', fontSize:13, lineHeight:1.6 }}>{t('adminUsers.howLoginWorksDesc')}</p>
        </div>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'0 16px 16px', overflow:'hidden' }}>
          {workers.length === 0
            ? <div className="empty-state" style={{ padding:'30px' }}>
                <p style={{ color:'var(--text3)', marginBottom:4 }}><User size={34} /></p>
                <h3>{t('adminUsers.noWorkersTitle')}</h3>
                <p>{t('adminUsers.noWorkersDesc')}</p>
              </div>
            : workers.map(u => <UserRow key={u.id} u={u} />)
          }
        </div>

        {organizers.length > 0 && (
          <>
            <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('adminUsers.organizersSection')}</p>
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'0 16px 16px', overflow:'hidden' }}>
              {organizers.map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </>
        )}
      </div>

      {/* ── Modal crea account ─────────────────────────────── */}
      {showCreate && (
        <div className={`modal-overlay${createDrag.closing ? ' closing' : ''}`} onClick={createDrag.onOverlayClick}>
          <div className={`modal admin-user-modal${createDrag.jiggling ? ' modal-jiggle' : ''}${createDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...createDrag.props}>
            <button className="close-btn" onClick={createDrag.close}>✕</button>
            <h2>{t('adminUsers.newAccountTitle')}</h2>

            {error && (
              <div style={{ background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', color:'var(--red)', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label>{t('adminUsers.fullNameLabel')}</label>
              <input value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder={t('adminUsers.fullNamePlaceholder')} />
            </div>
            <div className="form-group">
              <label>{t('adminUsers.usernameLabel')}</label>
              <input
                value={form.username}
                onChange={e => setForm({...form, username: e.target.value.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')})}
                placeholder={t('adminUsers.usernamePlaceholder')}
                autoCapitalize="none" autoCorrect="off"
              />
              {form.username && (
                <p style={{ color:'var(--text2)', fontSize:12, marginTop:5 }}>
                  {t('adminUsers.willLoginWith')} <strong style={{ color:'var(--blue)', fontFamily:'monospace' }}>{form.username}</strong>
                </p>
              )}
            </div>
            <div className="form-group">
              <label>{t('adminUsers.emailLabel')}</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                placeholder={t('adminUsers.emailPlaceholder')}
                autoCapitalize="none"
              />
            </div>
            <div className="form-group">
              <label>{t('adminUsers.roleLabel')}</label>
              <Picker
                value={form.role}
                onChange={role => setForm({...form, role})}
                ariaLabel={t('adminUsers.roleLabel')}
                options={[
                  { value:'worker', label:t('adminUsers.roleWorkerOption'), icon:<User size={17} /> },
                  { value:'organizzatore-evento', label:t('adminUsers.roleOrgEventOption'), icon:<Calendar size={17} /> },
                ]}
              />
            </div>

            {form.role === 'organizzatore-evento' && (
              <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                <p style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>{t('adminUsers.organizedEventTitle')}</p>
                <EventOrganizerFields events={events} assignedEventId={assignedEventId} setAssignedEventId={setAssignedEventId} />
              </div>
            )}

            {form.role === 'worker' && (
              <button
                type="button"
                onClick={() => setForm({...form, canManageInventory: !form.canManageInventory})}
                className="btn-no-anim"
                style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px', borderRadius:10, marginBottom:16,
                  background: form.canManageInventory ? 'rgba(245,166,35,0.08)' : 'var(--card2)',
                  border: form.canManageInventory ? '1.5px solid rgba(245,166,35,0.35)' : '1.5px solid var(--border)',
                }}
              >
                <span style={{ textAlign:'left' }}>
                  <span style={{ display:'block', fontSize:13, fontWeight:700, color: form.canManageInventory ? 'var(--accent2)' : 'var(--text)' }}>{t('adminUsers.canManageInventoryLabel')}</span>
                  <span style={{ display:'block', fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{t('adminUsers.canManageInventoryHint')}</span>
                </span>
                <span style={{ flexShrink:0, marginLeft:10, width:36, height:20, borderRadius:10, background: form.canManageInventory ? '#ea580c' : 'var(--border)', display:'flex', alignItems:'center', padding:'0 3px', transition:'background 0.2s', justifyContent: form.canManageInventory ? 'flex-end' : 'flex-start' }}>
                  <span style={{ width:14, height:14, borderRadius:'50%', background:'white', display:'block' }} />
                </span>
              </button>
            )}

            <div className="form-group" style={{ marginBottom:22 }}>
              <label>{t('adminUsers.passwordLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('adminUsers.passwordHint')}</span></label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password:e.target.value})} placeholder="••••••••" />
            </div>

            <SaveButton onSave={createAccount} onDone={createDrag.close} onError={createDrag.triggerJiggle} className="btn btn-primary btn-full">
              <Check size={16} /> {t('adminUsers.createAccount')}
            </SaveButton>
          </div>
        </div>
      )}

      {/* ── Modal dettaglio account ────────────────────────── */}
      {showDetail && (
        <div className={`modal-overlay${detailDrag.closing ? ' closing' : ''}`} onClick={detailDrag.onOverlayClick}>
          <div className={`modal admin-user-modal${detailDrag.jiggling ? ' modal-jiggle' : ''}${detailDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...detailDrag.props}>
            <button className="close-btn" onClick={detailDrag.close}>✕</button>

            {editMode && (
              <button onClick={() => setEditMode(false)} className="btn-no-anim" style={{ background:'transparent', display:'flex', alignItems:'center', gap:6, color:'var(--text2)', fontWeight:700, fontSize:14, marginBottom:14 }}>
                ← {t('common.back')}
              </button>
            )}

            {/* Intestazione — in modifica solo il nome, altrimenti tutti i dati principali */}
            {!editMode ? (
              <div style={{ textAlign:'center', marginBottom:20 }}>
                <div style={{
                  width:64, height:64, borderRadius:20, margin:'0 auto 12px',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:26, fontWeight:800,
                  background: showDetail.role === 'admin' ? 'rgba(233,69,96,0.15)' : showDetail.active !== false ? 'rgba(79,195,247,0.15)' : 'rgba(144,144,176,0.12)',
                  color: showDetail.role === 'admin' ? 'var(--accent)' : showDetail.active !== false ? 'var(--blue)' : 'var(--text2)',
                }}>
                  {showDetail.avatar || (showDetail.name || showDetail.username || '?').charAt(0).toUpperCase()}
                </div>
                <h2 style={{ margin:0, fontSize:22 }}>{showDetail.name}</h2>
                {showDetail.username && (
                  <p style={{ color:'var(--blue)', fontSize:15, fontFamily:'monospace', fontWeight:600, marginTop:6 }}>@{showDetail.username}</p>
                )}

                {showDetail.email && (
                  <p style={{ color:'var(--text2)', fontSize:13, marginTop:4 }}>{showDetail.email}</p>
                )}
                <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:10, flexWrap:'wrap' }}>
                  <span className="badge" style={{
                    background: ROLE_COLORS[showDetail.role]?.bg || 'rgba(79,195,247,0.15)',
                    color: ROLE_COLORS[showDetail.role]?.color || 'var(--blue)', fontSize:13, padding:'5px 14px'
                  }}>
                    {ROLE_LABELS[showDetail.role] || t('adminUsers.roleMagazziniere')}
                  </span>
                  {showDetail.approved === false ? (
                    <span className="badge" style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', fontSize:13, padding:'5px 14px' }}>
                      ⏳ {t('adminUsers.pendingApprovalSection')}
                    </span>
                  ) : (
                    <span className="badge" style={{
                      background: showDetail.active !== false ? 'rgba(105,240,174,0.15)' : 'rgba(144,144,176,0.15)',
                      color: showDetail.active !== false ? 'var(--green)' : 'var(--text2)', fontSize:13, padding:'5px 14px'
                    }}>
                      {showDetail.active !== false ? t('vehicles.active') : t('vehicles.deactivated')}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <h2 style={{ margin:'0 0 20px', fontSize:22, textAlign:'center' }}>{showDetail.name}</h2>
            )}

            {!editMode ? (
              <>
                {/* Info creazione */}
                {showDetail.createdAt && (
                  <div style={{ background:'var(--bg3)', borderRadius:8, padding:'10px 14px', marginBottom:16, display:'flex', justifyContent:'space-between' }}>
                    <span style={{ color:'var(--text2)', fontSize:13 }}>{t('adminUsers.accountCreatedOn')}</span>
                    <span style={{ fontSize:13, fontWeight:600 }}>{formatDate(showDetail.createdAt, { day:'numeric', month:'long', year:'numeric' }, i18n.language)}</span>
                  </div>
                )}

                {showDetail.approved === false && (
                  <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                    <button onClick={approveUser} className="btn btn-primary" style={{ flex:1 }}>
                      <Check size={16} /> {t('adminUsers.approve')}
                    </button>
                    <button onClick={rejectUser} className="btn btn-secondary" style={{ flex:1, color:'var(--red)' }}>
                      {t('adminUsers.reject')}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => { setEditMode(true); setNewUsername(showDetail.username); clearDetailMsg() }}
                  className="btn btn-secondary btn-full"
                  style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}
                >
                  <Edit size={16} /> {t('adminUsers.edit')}
                </button>
              </>
            ) : (
              <>
                {/* Messaggio feedback */}
                {detailMsg.text && (
                  <div style={{
                    background: detailMsg.type === 'error' ? 'rgba(255,82,82,0.1)' : 'rgba(105,240,174,0.1)',
                    border: `1px solid ${detailMsg.type === 'error' ? 'rgba(255,82,82,0.3)' : 'rgba(105,240,174,0.3)'}`,
                    color: detailMsg.type === 'error' ? 'var(--red)' : 'var(--green)',
                    borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, lineHeight:1.5
                  }}>
                    {detailMsg.text}
                  </div>
                )}

                {/* Nome utente */}
                <div className="form-group">
                  <label>{t('adminUsers.changeUsernameLabel')}</label>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ color:'var(--text2)', fontFamily:'monospace', fontSize:15 }}>@</span>
                    <input
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, ''))}
                      style={{ fontFamily:'monospace', flex:1 }}
                      onKeyDown={e => { if (e.key === 'Enter') saveUsername() }}
                    />
                    <button onClick={saveUsername} className="btn btn-secondary" style={{ padding:'9px 16px', flexShrink:0 }}>{t('adminUsers.save')}</button>
                  </div>
                </div>

                {/* Cambio password — sempre aperta */}
                <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                  <p style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>{t('adminUsers.changePasswordTitle')}</p>
                  <div className="form-group">
                    <label>{t('adminUsers.newPasswordLabel')}</label>
                    <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder={t('adminUsers.newPasswordPlaceholder')} />
                  </div>
                  <button onClick={changePassword} className="btn btn-secondary" style={{ width:'100%', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7, marginTop:10 }} disabled={loading}>
                    {loading ? t('common.saving') : <><Save size={16} /> {t('adminUsers.saveNewPassword')}</>}
                  </button>
                </div>

                {/* Cambio ruolo — menu ad hamburger */}
                {showDetail.id !== user.uid && (
                  <div style={{ marginBottom:16, position:'relative' }}>
                    <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>{t('adminUsers.roleSectionTitle')}</p>
                    <button onClick={() => setRoleMenuOpen(o => !o)} className="btn btn-secondary" style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:9 }}>☰ {ROLE_LABELS[showDetail.role]}</span>
                      <span style={{ fontSize:12 }}>{roleMenuOpen ? '▲' : '▼'}</span>
                    </button>
                    {roleMenuOpen && (
                      <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.16)', zIndex:20, overflow:'hidden' }}>
                        {[
                          { key:'worker', label:t('adminUsers.roleMagazziniere') },
                          { key:'admin', label:t('adminUsers.roleAdminOption') },
                          { key:'organizzatore-evento', label:t('adminUsers.roleOrgEventOption') },
                        ].map(r => (
                          <button key={r.key} onClick={() => changeRole(r.key)} className="btn-no-anim" style={{
                            width:'100%', textAlign:'left', padding:'11px 14px', fontSize:14, fontWeight:600,
                            background: showDetail.role === r.key ? 'var(--card2)' : 'transparent',
                            color: showDetail.role === r.key ? 'var(--accent)' : 'var(--text)',
                          }}>
                            {r.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Sotto-menu: configurazione evento (solo per il ruolo Organizzatore) */}
                {showDetail.role === 'organizzatore-brasserie' && (
                  <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                    <p style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>{t('adminUsers.eventConfigTitle')}</p>
                    <OrgConfigFields
                      orgConfig={orgConfig} setOrgConfig={setOrgConfig}
                      newCustomDate={newCustomDate} setNewCustomDate={setNewCustomDate}
                      addCustomDate={addCustomDate} removeCustomDate={removeCustomDate}
                    />
                    <button onClick={saveOrgConfig} className="btn btn-primary btn-full" style={{ marginTop:12 }}>{t('adminUsers.eventConfigSaveButton')}</button>
                  </div>
                )}

                {/* Sotto-menu: evento collegato (solo per il ruolo Organizzatore evento) */}
                {showDetail.role === 'organizzatore-evento' && (
                  <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                    <p style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>{t('adminUsers.organizedEventTitle')}</p>
                    <EventOrganizerFields events={events} assignedEventId={assignedEventId} setAssignedEventId={setAssignedEventId} />
                    <button onClick={saveAssignedEvent} className="btn btn-primary btn-full" style={{ marginTop:12 }}>{t('adminUsers.organizedEventSaveButton')}</button>
                  </div>
                )}

                {/* Permesso magazzino avanzato (solo worker): stesso ruolo, ma
                    con accesso alla vista magazzino completa (aggiungi/modifica/
                    elimina, etichette, bauli, rotture) invece di quella di sola
                    consultazione — impostabile per singolo utente, non per
                    tutti i magazzinieri insieme. */}
                {showDetail.role === 'worker' && (
                  <button
                    onClick={toggleCanManageInventory}
                    className="btn-no-anim"
                    style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px', borderRadius:10, marginBottom:16,
                      background: showDetail.canManageInventory ? 'rgba(245,166,35,0.08)' : 'var(--card2)',
                      border: showDetail.canManageInventory ? '1.5px solid rgba(245,166,35,0.35)' : '1.5px solid var(--border)',
                    }}
                  >
                    <span style={{ textAlign:'left' }}>
                      <span style={{ display:'block', fontSize:13, fontWeight:700, color: showDetail.canManageInventory ? 'var(--accent2)' : 'var(--text)' }}>{t('adminUsers.canManageInventoryLabel')}</span>
                      <span style={{ display:'block', fontSize:11.5, color:'var(--text2)', marginTop:2 }}>{t('adminUsers.canManageInventoryHint')}</span>
                    </span>
                    <span style={{ flexShrink:0, marginLeft:10, width:36, height:20, borderRadius:10, background: showDetail.canManageInventory ? '#ea580c' : 'var(--border)', display:'flex', alignItems:'center', padding:'0 3px', transition:'background 0.2s', justifyContent: showDetail.canManageInventory ? 'flex-end' : 'flex-start' }}>
                      <span style={{ width:14, height:14, borderRadius:'50%', background:'white', display:'block' }} />
                    </span>
                  </button>
                )}

                {/* Indisponibilità (solo worker) */}
                {showDetail.role === 'worker' && detailUnavail.length > 0 && (
                  <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                    <p style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>{t('adminUsers.reportedUnavailabilityTitle')}</p>
                    {[...detailUnavail].sort((a,b) => a.startDate.localeCompare(b.startDate)).map(u => (
                      <div key={u.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', marginBottom:6 }}>
                        <div>
                          <p style={{ fontWeight:700, fontSize:13 }}>
                            {u.startDate === u.endDate
                              ? formatDate(u.startDate, { day:'numeric', month:'long', year:'numeric' }, i18n.language)
                              : `${formatDate(u.startDate, { day:'numeric', month:'short' }, i18n.language)} → ${formatDate(u.endDate, { day:'numeric', month:'short', year:'numeric' }, i18n.language)}`
                            }
                          </p>
                          {u.reason && <p style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{u.reason}</p>}
                        </div>
                        <button onClick={() => removeUnavailability(u.id)} className="btn-no-anim" style={{ background:'transparent', color:'var(--red)', fontSize:12, fontWeight:700, flexShrink:0 }}>{t('common.remove')}</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Disattiva / Elimina — affiancati */}
                <div style={{ display:'grid', gridTemplateColumns: showDetail.id !== user.uid ? '1fr 1fr' : '1fr', gap:10 }}>
                  <button onClick={toggleActive} style={{
                    background: showDetail.active !== false ? 'rgba(245,166,35,0.12)' : 'rgba(105,240,174,0.1)',
                    color: showDetail.active !== false ? 'var(--accent2)' : 'var(--green)',
                    borderRadius:10, padding:'12px', fontWeight:700, fontSize:13,
                    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7
                  }}>
                    {showDetail.active !== false ? <><Warn size={15} /> {t('adminUsers.deactivateAccess')}</> : <><Check size={15} /> {t('adminUsers.reactivateAccess')}</>}
                  </button>
                  {showDetail.id !== user.uid && (
                    <button onClick={deleteAccount} style={{
                      background:'rgba(255,82,82,0.1)', color:'var(--red)',
                      borderRadius:10, padding:'12px', fontWeight:700, fontSize:13,
                      display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7
                    }}>
                      <Trash size={15} /> {t('adminUsers.deleteAccount')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
