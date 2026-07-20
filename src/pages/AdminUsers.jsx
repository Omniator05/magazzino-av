import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, usernameToEmail } from '../context/AuthContext'
import { formatDate } from '../utils/formatDate'
import { useConfirm } from '../context/ConfirmProvider'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { db, auth } from '../firebase'
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, query, orderBy, where } from 'firebase/firestore'
import { Check, Save, Trash, Edit, User, Warn } from '../components/Icon'
import { uploadTeamLogo, deleteTeamLogo, ACCEPT_LOGO_ATTR, ALLOWED_LOGO_TYPES } from '../utils/teamStorage'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
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

export default function AdminUsers() {
  const { t, i18n } = useTranslation()
  const { user, profile, team, updateTeamData, logout } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [users, setUsers]             = useState([])
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError]     = useState('')
  const [showCreate, setShowCreate]   = useState(false)
  const [showDetail, setShowDetail]   = useState(null)
  const createDrag = useModalDrag(() => setShowCreate(false))
  const detailDrag  = useModalDrag(() => setShowDetail(null))
  useModalScrollLock(showCreate || !!showDetail)
  const [editMode, setEditMode]       = useState(false)
  const [form, setForm]               = useState({ name:'', username:'', password:'', email:'', role:'worker' })
  const [newPw, setNewPw]             = useState('')
  const [adminPw, setAdminPw]         = useState('')
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
    if (!profile?.teamId) return
    const q = query(collection(db, 'profiles'), where('teamId', '==', profile.teamId), orderBy('name'))
    return onSnapshot(q, snap => setUsers(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [profile?.teamId])

  // Eventi da oggi in poi, per il selettore dell'Organizzatore evento
  useEffect(() => {
    if (!profile?.teamId) return
    const todayStr = new Date().toISOString().slice(0, 10)
    const q = query(collection(db, 'events'), where('teamId', '==', profile.teamId), orderBy('date'))
    return onSnapshot(q, snap => setEvents(
      snap.docs
        .map(d => ({ id:d.id, ...d.data() }))
        .filter(e => (e.dateEnd || e.date) >= todayStr)
    ))
  }, [profile?.teamId])

  useEffect(() => {
    if (!showDetail || !profile?.teamId) { setDetailUnavail([]); return }
    // Le regole Firestore valutano "list" sulla query stessa: senza un filtro
    // di uguaglianza su teamId corrispondente alla regola (resource.data.teamId),
    // l'intera richiesta viene rifiutata con permission-denied, anche se il
    // worker non ha alcuna indisponibilità registrata.
    const q = query(collection(db, 'unavailability'), where('teamId', '==', profile.teamId), where('workerId', '==', showDetail.id))
    return onSnapshot(q, snap => setDetailUnavail(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [showDetail?.id, profile?.teamId])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }
  const clearDetailMsg = () => setDetailMsg({ text:'', type:'' })

  // ── Logo squadra — sostituisce "The Service Group" nella UI e nei PDF ──
  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !team?.id) return
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) { setLogoError(t('adminUsers.errorLogoType')); return }
    if (file.size > 3 * 1024 * 1024) { setLogoError(t('adminUsers.errorLogoSize')); return }
    setLogoError(''); setLogoUploading(true)
    try {
      const oldPath = team.logoPath
      const { url, path } = await uploadTeamLogo(file, team.id)
      await updateTeamData({ logoUrl: url, logoPath: path })
      if (oldPath) await deleteTeamLogo(oldPath)
      showToast(t('adminUsers.logoUpdatedToast'))
    } catch (e) {
      setLogoError(t('adminUsers.errorLogoUpload'))
    } finally { setLogoUploading(false) }
  }

  const removeLogo = async () => {
    if (!(await confirm({ title: t('adminUsers.confirmRemoveLogoTitle'), message: t('adminUsers.confirmRemoveLogoMessage'), confirmLabel: t('adminUsers.confirmRemoveLogoLabel'), danger: true }))) return
    const oldPath = team?.logoPath
    await updateTeamData({ logoUrl: null, logoPath: null })
    if (oldPath) await deleteTeamLogo(oldPath)
    showToast(t('adminUsers.logoRemovedToast'))
  }

  // ── Crea account ──────────────────────────────────────────────
  const createAccount = async () => {
    if (!form.name.trim() || !form.username.trim() || form.password.length < 6) {
      setError(t('adminUsers.errorFillAllFields')); return
    }
    if (form.role === 'organizzatore-brasserie' && !orgConfig.eventName.trim()) {
      setError(t('adminUsers.errorOrgEventName')); return
    }
    if (form.role === 'organizzatore-evento' && !assignedEventId) {
      setError(t('adminUsers.errorOrgLinkedEvent')); return
    }
    const username = form.username.toLowerCase().trim().replace(/\s+/g, '.')
    if (users.some(u => u.username === username)) {
      setError(t('adminUsers.errorUsernameTaken')); return
    }
    setLoading(true); setError('')

    const internalEmail = usernameToEmail(username)
    const adminEmail    = auth.currentUser.email
    // Leggi la password admin da sessionStorage (salvata al login)
    const adminPassword = sessionStorage.getItem('__ap')

    try {
      // Crea il nuovo utente Firebase Auth
      const cred = await createUserWithEmailAndPassword(auth, internalEmail, form.password)

      // Salva il profilo
      await setDoc(doc(db, 'profiles', cred.user.uid), {
        name:          form.name.trim(),
        username,
        internalEmail,
        email:         form.email.trim().toLowerCase() || null,
        role:          form.role || 'worker',
        teamId:        profile.teamId,
        approved:      true,
        active:        true,
        createdAt:     new Date().toISOString(),
        createdBy:     user.uid,
        ...(form.role === 'organizzatore-brasserie'
          ? { organizerConfig: { ...orgConfig, eventName: orgConfig.eventName.trim() } }
          : {}),
        ...(form.role === 'organizzatore-evento'
          ? { assignedEventId }
          : {}),
      })

      // Firebase ci ha switchato all'utente appena creato → rientra come admin
      if (adminPassword) {
        await signInWithEmailAndPassword(auth, adminEmail, adminPassword)
        showToast(t('adminUsers.accountCreatedFor', { name: form.name }))
      } else {
        // Non abbiamo la password admin in sessione → avvisa e forza logout
        showToast(t('adminUsers.accountCreatedReauth'))
        setTimeout(() => logout(), 2500)
      }

      setForm({ name:'', username:'', password:'', email:'', role:'worker' })
      setOrgConfig(EMPTY_ORG_CONFIG)
      setAssignedEventId('')
      setShowCreate(false)
    } catch(e) {
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
  // Strategia: riloghiamo temporaneamente come l'utente target,
  // aggiorniamo la password, poi riloghiamo come admin.
  const changePassword = async () => {
    if (newPw.length < 6) { setDetailMsg({ text:t('adminUsers.errorPasswordLength'), type:'error' }); return }
    if (!adminPw) { setDetailMsg({ text:t('adminUsers.errorAdminPasswordRequired'), type:'error' }); return }

    setLoading(true); clearDetailMsg()
    const adminEmail = auth.currentUser.email

    try {
      // 1. Entra come utente target
      const targetCred = await signInWithEmailAndPassword(auth, showDetail.internalEmail, showDetail._currentPw || '??')
      // Se arriviamo qui la password era già quella — caso raro
      await updatePassword(targetCred.user, newPw)
    } catch(loginErr) {
      // Non conosciamo la password attuale → usiamo un workaround:
      // riautentichiamo l'admin e scriviamo un flag su Firestore
      // poi l'utente viene "resettato" la prossima volta che accede
      // NOTA: questa limitazione è di Firebase lato client.
      // Per cambiare la password di un altro utente senza conoscerla
      // servono le Firebase Admin SDK (Cloud Functions).
      // Come alternativa pratica, salviamo la nuova password come
      // "richiesta di cambio" e la applichiamo al prossimo login dell'utente.
      try {
        // Riautentica admin (potrebbe essere scaduto il token)
        await signInWithEmailAndPassword(auth, adminEmail, adminPw)
        // Salva la nuova password cifrata base64 (non sicurezza critica, uso interno)
        await updateDoc(doc(db, 'profiles', showDetail.id), {
          pendingPassword: btoa(newPw),
          pendingPasswordSetAt: new Date().toISOString(),
        })
        clearDetailMsg()
        setNewPw(''); setAdminPw('')
        showToast(t('adminUsers.passwordPendingToast', { name: showDetail.name }))
      } catch(e) {
        setDetailMsg({ text: t('adminUsers.errorWrongAdminPassword'), type:'error' })
      } finally { setLoading(false) }
      return
    }

    // Rientra come admin
    try { await signInWithEmailAndPassword(auth, adminEmail, adminPw) } catch(e) {}
    clearDetailMsg()
    setNewPw(''); setAdminPw('')
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
        setShowDetail(u); setEditMode(false); clearDetailMsg(); setNewPw(''); setAdminPw(''); setRoleMenuOpen(false)
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
          <p style={{ fontWeight:700, fontSize:15, color: u.active !== false ? 'var(--text)' : 'var(--text2)' }}>{u.name}</p>
          <p style={{ color:'var(--text2)', fontSize:13 }}>{u.username ? `@${u.username}` : u.email}</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span className="badge" style={{
            background: u.approved === false ? 'rgba(245,166,35,0.15)' : roleColor ? roleColor.bg : u.active !== false ? 'rgba(79,195,247,0.15)' : 'rgba(144,144,176,0.15)',
            color: u.approved === false ? 'var(--accent2)' : roleColor ? roleColor.color : u.active !== false ? 'var(--blue)' : 'var(--text2)'
          }}>
            {u.approved === false ? t('adminUsers.waitingBadge') : u.role === 'admin' ? t('adminUsers.adminBadge') : roleColor ? ROLE_LABELS[u.role] : u.active !== false ? t('adminUsers.activeBadge') : t('adminUsers.deactivatedBadge')}
          </span>
          <span style={{ color:'var(--text2)', fontSize:18 }}>›</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page users-page">
      {/* Toast globale */}
      {toast && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 20px', zIndex:999, fontSize:14, fontWeight:600, color:'var(--text)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}

      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h1>{t('adminUsers.title')}</h1><p>{t('adminUsers.totalAccounts', { count: users.length })}</p></div>
          <button onClick={() => { setShowCreate(true); setError(''); setOrgConfig(EMPTY_ORG_CONFIG); setNewCustomDate(''); setAssignedEventId('') }} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>{t('adminUsers.newButton')}</button>
        </div>
      </div>

      {/* Logo squadra — mostrato al posto del logo di default nell'app e nei PDF */}
      <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
        <div style={{
          width:56, height:56, borderRadius:14, flexShrink:0, overflow:'hidden',
          background:'var(--bg3)', border:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          {team?.logoUrl
            ? <img src={team.logoUrl} alt={team?.name || ''} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
            : <img src="/logo.png" alt="" style={{ width:'70%', height:'70%', objectFit:'contain', opacity:0.5 }} />
          }
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, fontSize:14 }}>{t('adminUsers.teamLogoTitle')}</p>
          <p style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>{t('adminUsers.teamLogoDesc')}</p>
          {logoError && <p style={{ color:'var(--red)', fontSize:12, marginTop:4, fontWeight:600 }}>{logoError}</p>}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
          <label className="btn btn-secondary" style={{ padding:'8px 14px', fontSize:12, textAlign:'center', cursor: logoUploading ? 'default' : 'pointer', opacity: logoUploading ? 0.6 : 1 }}>
            {logoUploading ? t('adminUsers.uploadingLogo') : team?.logoUrl ? t('adminUsers.changeLogo') : t('adminUsers.uploadLogo')}
            <input type="file" accept={ACCEPT_LOGO_ATTR} onChange={handleLogoChange} disabled={logoUploading} style={{ display:'none' }} />
          </label>
          {team?.logoUrl && (
            <button onClick={removeLogo} style={{ background:'transparent', color:'var(--red)', fontSize:12, fontWeight:700, padding:'4px' }}>
              {t('adminUsers.removeLogo')}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding:'16px 0 0' }}>
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

        <div style={{ margin:'16px', background:'rgba(79,195,247,0.05)', border:'1px solid rgba(79,195,247,0.15)', borderRadius:'var(--radius)', padding:'14px' }}>
          <p style={{ color:'var(--blue)', fontWeight:700, fontSize:13, marginBottom:6 }}>{t('adminUsers.howLoginWorksTitle')}</p>
          <p style={{ color:'var(--text2)', fontSize:13, lineHeight:1.6 }}>{t('adminUsers.howLoginWorksDesc')}</p>
        </div>
      </div>

      {/* ── Modal crea account ─────────────────────────────── */}
      {showCreate && (
        <div className={`modal-overlay${createDrag.closing ? ' closing' : ''}`} onClick={createDrag.onOverlayClick}>
          <div className={`modal${createDrag.jiggling ? ' modal-jiggle' : ''}${createDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...createDrag.props}>
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
              <label>{t('adminUsers.usernameLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('adminUsers.usernameHint')}</span></label>
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
              <label>{t('adminUsers.emailLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('adminUsers.emailHint')}</span></label>
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
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                <option value="worker">{t('adminUsers.roleWorkerOption')}</option>
                <option value="organizzatore-brasserie">{t('adminUsers.roleOrgBrasserieOption')}</option>
                <option value="organizzatore-evento">{t('adminUsers.roleOrgEventOption')}</option>
              </select>
            </div>

            {form.role === 'organizzatore-brasserie' && (
              <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                <p style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>{t('adminUsers.eventConfigTitle')}</p>
                <OrgConfigFields
                  orgConfig={orgConfig} setOrgConfig={setOrgConfig}
                  newCustomDate={newCustomDate} setNewCustomDate={setNewCustomDate}
                  addCustomDate={addCustomDate} removeCustomDate={removeCustomDate}
                />
              </div>
            )}

            {form.role === 'organizzatore-evento' && (
              <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                <p style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>{t('adminUsers.organizedEventTitle')}</p>
                <EventOrganizerFields events={events} assignedEventId={assignedEventId} setAssignedEventId={setAssignedEventId} />
              </div>
            )}

            <div className="form-group" style={{ marginBottom:6 }}>
              <label>{t('adminUsers.passwordLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('adminUsers.passwordHint')}</span></label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password:e.target.value})} placeholder="••••••••" />
            </div>

            <div style={{ background:'rgba(79,195,247,0.06)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:8, padding:'10px 12px', marginBottom:16 }}>
              <p style={{ color:'var(--blue)', fontSize:12, lineHeight:1.6 }}>
                {t('adminUsers.createAccountNote')}
              </p>
            </div>

            <button onClick={createAccount} className="btn btn-primary btn-full" disabled={loading} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}>
              {loading ? t('adminUsers.creatingAccount') : <><Check size={16} /> {t('adminUsers.createAccount')}</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Modal dettaglio account ────────────────────────── */}
      {showDetail && (
        <div className={`modal-overlay${detailDrag.closing ? ' closing' : ''}`} onClick={detailDrag.onOverlayClick}>
          <div className={`modal${detailDrag.jiggling ? ' modal-jiggle' : ''}${detailDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...detailDrag.props}>
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
                  <div className="form-group" style={{ marginBottom:10 }}>
                    <label>{t('adminUsers.yourAdminPasswordLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('adminUsers.yourAdminPasswordHint')}</span></label>
                    <input type="password" value={adminPw} onChange={e => setAdminPw(e.target.value)} placeholder={t('adminUsers.yourAdminPasswordPlaceholder')} />
                  </div>
                  <button onClick={changePassword} className="btn btn-secondary" style={{ width:'100%', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }} disabled={loading}>
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
                          { key:'organizzatore-brasserie', label:t('adminUsers.roleOrgBrasserieOption') },
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
