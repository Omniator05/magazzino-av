import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, usernameToEmail } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { db, auth } from '../firebase'
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, query, orderBy, where } from 'firebase/firestore'
import { Check, Save, Trash, Edit, User, Warn } from '../components/Icon'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth'

const WEEKDAY_NAMES = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato']
const EMPTY_ORG_CONFIG = { eventName:'', frequency:'weekly', weekday:4, monthDay:1, customDates:[], endDate:'' }

// Campi di configurazione evento per il ruolo Organizzatore — condivisi tra
// il form di creazione account e il pannello di modifica di un utente esistente.
function OrgConfigFields({ orgConfig, setOrgConfig, newCustomDate, setNewCustomDate, addCustomDate, removeCustomDate }) {
  return (
    <>
      <div className="form-group">
        <label>Nome evento</label>
        <input value={orgConfig.eventName} onChange={e => setOrgConfig(c => ({ ...c, eventName:e.target.value }))} placeholder="es. Brasserie" />
      </div>
      <div className="form-group">
        <label>Frequenza</label>
        <select value={orgConfig.frequency} onChange={e => setOrgConfig(c => ({ ...c, frequency:e.target.value }))}>
          <option value="weekly">Settimanale</option>
          <option value="monthly">Mensile</option>
          <option value="custom">Date singole</option>
        </select>
      </div>

      {orgConfig.frequency === 'weekly' && (
        <div className="form-group">
          <label>Giorno della settimana</label>
          <select value={orgConfig.weekday} onChange={e => setOrgConfig(c => ({ ...c, weekday:Number(e.target.value) }))}>
            {WEEKDAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
          </select>
        </div>
      )}

      {orgConfig.frequency === 'monthly' && (
        <div className="form-group">
          <label>Giorno del mese</label>
          <input type="number" min="1" max="31" value={orgConfig.monthDay} onChange={e => setOrgConfig(c => ({ ...c, monthDay:Number(e.target.value) }))} />
        </div>
      )}

      {orgConfig.frequency === 'custom' && (
        <div className="form-group">
          <label>Date specifiche</label>
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <input type="date" value={newCustomDate} onChange={e => setNewCustomDate(e.target.value)} style={{ flex:1 }} />
            <button onClick={addCustomDate} className="btn btn-secondary" style={{ flexShrink:0 }}>+ Aggiungi</button>
          </div>
          {orgConfig.customDates.map(d => (
            <div key={d} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 10px', marginBottom:5 }}>
              <span style={{ fontSize:13 }}>{new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day:'numeric', month:'long', year:'numeric' })}</span>
              <button onClick={() => removeCustomDate(d)} className="btn-no-anim" style={{ background:'transparent', color:'var(--red)', fontSize:12, fontWeight:700 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {orgConfig.frequency !== 'custom' && (
        <div className="form-group" style={{ marginBottom:0 }}>
          <label>Data fine <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale, lascia vuoto per nessuna scadenza)</span></label>
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
  return (
    <div className="form-group" style={{ marginBottom:0 }}>
      <label>Evento collegato</label>
      <select value={assignedEventId} onChange={e => setAssignedEventId(e.target.value)}>
        <option value="">— Seleziona un evento —</option>
        {events.map(ev => (
          <option key={ev.id} value={ev.id}>
            {ev.name} — {new Date(ev.date + 'T12:00:00').toLocaleDateString('it-IT', { day:'numeric', month:'long', year:'numeric' })}
          </option>
        ))}
      </select>
      {events.length === 0 && (
        <p style={{ color:'var(--text2)', fontSize:12, marginTop:5 }}>Nessun evento futuro in calendario — creane uno prima da Eventi.</p>
      )}
    </div>
  )
}

export default function AdminUsers() {
  const { user, profile, logout } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [users, setUsers]             = useState([])
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
    const q = query(collection(db, 'profiles'), orderBy('name'))
    return onSnapshot(q, snap => setUsers(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [])

  // Eventi da oggi in poi, per il selettore dell'Organizzatore evento
  useEffect(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const q = query(collection(db, 'events'), orderBy('date'))
    return onSnapshot(q, snap => setEvents(
      snap.docs
        .map(d => ({ id:d.id, ...d.data() }))
        .filter(e => (e.dateEnd || e.date) >= todayStr)
    ))
  }, [])

  useEffect(() => {
    if (!showDetail) { setDetailUnavail([]); return }
    const q = query(collection(db, 'unavailability'), where('workerId', '==', showDetail.id))
    return onSnapshot(q, snap => setDetailUnavail(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [showDetail?.id])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }
  const clearDetailMsg = () => setDetailMsg({ text:'', type:'' })

  // ── Crea account ──────────────────────────────────────────────
  const createAccount = async () => {
    if (!form.name.trim() || !form.username.trim() || form.password.length < 6) {
      setError('Compila tutti i campi. Password minimo 6 caratteri.'); return
    }
    if (form.role === 'organizzatore-brasserie' && !orgConfig.eventName.trim()) {
      setError('Inserisci il nome dell\'evento per l\'organizzatore.'); return
    }
    if (form.role === 'organizzatore-evento' && !assignedEventId) {
      setError('Seleziona l\'evento collegato all\'organizzatore.'); return
    }
    const username = form.username.toLowerCase().trim().replace(/\s+/g, '.')
    if (users.some(u => u.username === username)) {
      setError('Nome utente già in uso.'); return
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
        showToast(`Account creato per ${form.name}!`)
      } else {
        // Non abbiamo la password admin in sessione → avvisa e forza logout
        showToast(`Account creato! Dovrai riaccedere come admin.`)
        setTimeout(() => logout(), 2500)
      }

      setForm({ name:'', username:'', password:'', email:'', role:'worker' })
      setOrgConfig(EMPTY_ORG_CONFIG)
      setAssignedEventId('')
      setShowCreate(false)
    } catch(e) {
      const msgs = {
        'auth/email-already-in-use': 'Nome utente già registrato nel sistema',
        'auth/weak-password':        'Password troppo corta (min. 6 caratteri)',
      }
      setError(msgs[e.code] || e.message)
    } finally { setLoading(false) }
  }

  // ── Attiva / disattiva ────────────────────────────────────────
  const toggleActive = async () => {
    const isActive = showDetail.active !== false
    if (!(await confirm({
      title: isActive ? 'Disattiva account' : 'Riattiva account',
      message: `Vuoi ${isActive ? 'disattivare' : 'riattivare'} l'account di ${showDetail.name}?`,
      confirmLabel: isActive ? 'Disattiva' : 'Riattiva',
      danger: isActive,
    }))) return
    await updateDoc(doc(db, 'profiles', showDetail.id), { active: !isActive })
    setShowDetail(d => ({ ...d, active: !isActive }))
    clearDetailMsg()
    showToast(isActive ? '✓ Accesso disattivato' : '✓ Accesso riattivato')
  }

  // ── Cambia ruolo (Admin / Magazziniere / Organizzatore) ──
  const ROLE_LABELS = { admin: 'Amministratore', worker: 'Magazziniere', 'organizzatore-brasserie': 'Organizzatore Brasserie', 'organizzatore-evento': 'Organizzatore evento' }
  const changeRole = async (newRole) => {
    if (newRole === showDetail.role) return
    if (!(await confirm({
      title: 'Cambia ruolo',
      message: `Vuoi rendere ${showDetail.name} ${ROLE_LABELS[newRole]}?`,
      confirmLabel: 'Conferma',
    }))) return
    await updateDoc(doc(db, 'profiles', showDetail.id), { role: newRole })
    setShowDetail(d => ({ ...d, role: newRole }))
    clearDetailMsg()
    setRoleMenuOpen(false)
    showToast(`✓ ${showDetail.name} è ora ${ROLE_LABELS[newRole]}`)
  }

  // ── Configurazione evento organizzatore (nome + frequenza) ──────
  const saveOrgConfig = async () => {
    if (!orgConfig.eventName.trim()) { setDetailMsg({ text:'Inserisci il nome dell\'evento.', type:'error' }); return }
    const cleaned = { ...orgConfig, eventName: orgConfig.eventName.trim() }
    await updateDoc(doc(db, 'profiles', showDetail.id), { organizerConfig: cleaned })
    setShowDetail(d => ({ ...d, organizerConfig: cleaned }))
    clearDetailMsg()
    showToast('✓ Configurazione evento salvata')
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
    if (!assignedEventId) { setDetailMsg({ text:'Seleziona un evento.', type:'error' }); return }
    await updateDoc(doc(db, 'profiles', showDetail.id), { assignedEventId })
    setShowDetail(d => ({ ...d, assignedEventId }))
    clearDetailMsg()
    showToast('✓ Evento collegato salvato')
  }

  // ── Rimuovi indisponibilità ────────────────────────────────────
  const removeUnavailability = async (id) => {
    if (!(await confirm({ title: 'Rimuovi indisponibilità', message: 'Rimuovere questo periodo di indisponibilità?', confirmLabel: 'Rimuovi', danger: true }))) return
    await deleteDoc(doc(db, 'unavailability', id))
  }

  // ── Cambia password ───────────────────────────────────────────
  // Strategia: riloghiamo temporaneamente come l'utente target,
  // aggiorniamo la password, poi riloghiamo come admin.
  const changePassword = async () => {
    if (newPw.length < 6) { setDetailMsg({ text:'Password minimo 6 caratteri.', type:'error' }); return }
    if (!adminPw) { setDetailMsg({ text:'Inserisci la tua password admin per confermare.', type:'error' }); return }

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
        showToast(`✓ Nuova password salvata, verrà applicata al prossimo accesso di ${showDetail.name}`)
      } catch(e) {
        setDetailMsg({ text: 'Password admin non corretta o errore di connessione.', type:'error' })
      } finally { setLoading(false) }
      return
    }

    // Rientra come admin
    try { await signInWithEmailAndPassword(auth, adminEmail, adminPw) } catch(e) {}
    clearDetailMsg()
    setNewPw(''); setAdminPw('')
    setLoading(false)
    showToast(`✓ Password di ${showDetail.name} aggiornata`)
  }

  // ── Modifica username ─────────────────────────────────────────
  const saveUsername = async () => {
    const cleaned = newUsername.toLowerCase().trim().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')
    if (!cleaned) { setDetailMsg({ text:'Il nome utente non può essere vuoto.', type:'error' }); return }
    if (cleaned === showDetail.username) return
    if (users.some(u => u.username === cleaned && u.id !== showDetail.id)) {
      setDetailMsg({ text:'Nome utente già in uso da un altro account.', type:'error' }); return
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
    showToast(`✓ Nome utente aggiornato a @${cleaned}`)
  }

  // ── Elimina account ───────────────────────────────────────────
  const deleteAccount = async () => {
    if (!(await confirm({
      title: 'Elimina account',
      message: `Eliminare definitivamente l'account di ${showDetail.name}?\nQuesta azione non può essere annullata.`,
      confirmLabel: 'Elimina',
      danger: true,
    }))) return
    const name = showDetail.name
    await deleteDoc(doc(db, 'profiles', showDetail.id))
    // Il record Firebase Auth rimane ma senza profilo l'utente non accede all'app.
    // Per rimuoverlo del tutto serve Firebase Console → Authentication → elimina utente.
    setShowDetail(null)
    showToast(`Account di ${name} eliminato.`)
  }

  const workers   = users.filter(u => u.role === 'worker')
  const admins    = users.filter(u => u.role === 'admin')
  const organizers = users.filter(u => u.role === 'organizzatore-brasserie' || u.role === 'organizzatore-evento')

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
          <p style={{ color:'var(--text2)', fontSize:13 }}>@{u.username}</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span className="badge" style={{
            background: roleColor ? roleColor.bg : u.active !== false ? 'rgba(79,195,247,0.15)' : 'rgba(144,144,176,0.15)',
            color: roleColor ? roleColor.color : u.active !== false ? 'var(--blue)' : 'var(--text2)'
          }}>
            {u.role === 'admin' ? 'Admin' : roleColor ? ROLE_LABELS[u.role] : u.active !== false ? 'Attivo' : 'Disattivato'}
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
          <div><h1>Utenti</h1><p>{users.length} account totali</p></div>
          <button onClick={() => { setShowCreate(true); setError(''); setOrgConfig(EMPTY_ORG_CONFIG); setNewCustomDate(''); setAssignedEventId('') }} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>+ Nuovo</button>
        </div>
      </div>

      <div style={{ padding:'16px 0 0' }}>
        {admins.length > 0 && (
          <>
            <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>Amministratori</p>
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'0 16px 16px', overflow:'hidden' }}>
              {admins.map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </>
        )}

        <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>Magazzinieri</p>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'0 16px 16px', overflow:'hidden' }}>
          {workers.length === 0
            ? <div className="empty-state" style={{ padding:'30px' }}>
                <p style={{ color:'var(--text3)', marginBottom:4 }}><User size={34} /></p>
                <h3>Nessun magazziniere</h3>
                <p>Crea il primo account con il tasto + in alto</p>
              </div>
            : workers.map(u => <UserRow key={u.id} u={u} />)
          }
        </div>

        {organizers.length > 0 && (
          <>
            <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>Organizzatori</p>
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'0 16px 16px', overflow:'hidden' }}>
              {organizers.map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </>
        )}

        <div style={{ margin:'16px', background:'rgba(79,195,247,0.05)', border:'1px solid rgba(79,195,247,0.15)', borderRadius:'var(--radius)', padding:'14px' }}>
          <p style={{ color:'var(--blue)', fontWeight:700, fontSize:13, marginBottom:6 }}>Come funziona il login</p>
          <p style={{ color:'var(--text2)', fontSize:13, lineHeight:1.6 }}>I magazzinieri accedono con il loro <strong style={{ color:'var(--text)' }}>nome utente</strong> (es. <code>marco.bianchi</code>) o con la loro <strong style={{ color:'var(--text)' }}>email</strong> se inserita, più la password impostata da te.</p>
        </div>
      </div>

      {/* ── Modal crea account ─────────────────────────────── */}
      {showCreate && (
        <div className={`modal-overlay${createDrag.closing ? ' closing' : ''}`} onClick={createDrag.onOverlayClick}>
          <div className={`modal${createDrag.jiggling ? ' modal-jiggle' : ''}${createDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...createDrag.props}>
            <button className="close-btn" onClick={createDrag.close}>✕</button>
            <h2>Nuovo account</h2>

            {error && (
              <div style={{ background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', color:'var(--red)', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label>Nome completo *</label>
              <input value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="es. Marco Bianchi" />
            </div>
            <div className="form-group">
              <label>Nome utente * <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(per il login)</span></label>
              <input
                value={form.username}
                onChange={e => setForm({...form, username: e.target.value.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')})}
                placeholder="es. marco.bianchi"
                autoCapitalize="none" autoCorrect="off"
              />
              {form.username && (
                <p style={{ color:'var(--text2)', fontSize:12, marginTop:5 }}>
                  Accederà con: <strong style={{ color:'var(--blue)', fontFamily:'monospace' }}>{form.username}</strong>
                </p>
              )}
            </div>
            <div className="form-group">
              <label>Email <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale — per accedere anche con email)</span></label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                placeholder="es. marco@email.com"
                autoCapitalize="none"
              />
            </div>
            <div className="form-group">
              <label>Ruolo</label>
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                <option value="worker">Magazziniere</option>
                <option value="organizzatore-brasserie">Organizzatore Brasserie</option>
                <option value="organizzatore-evento">Organizzatore evento</option>
              </select>
            </div>

            {form.role === 'organizzatore-brasserie' && (
              <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                <p style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Configurazione evento</p>
                <OrgConfigFields
                  orgConfig={orgConfig} setOrgConfig={setOrgConfig}
                  newCustomDate={newCustomDate} setNewCustomDate={setNewCustomDate}
                  addCustomDate={addCustomDate} removeCustomDate={removeCustomDate}
                />
              </div>
            )}

            {form.role === 'organizzatore-evento' && (
              <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                <p style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Evento organizzato</p>
                <EventOrganizerFields events={events} assignedEventId={assignedEventId} setAssignedEventId={setAssignedEventId} />
              </div>
            )}

            <div className="form-group" style={{ marginBottom:6 }}>
              <label>Password * <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(min. 6 caratteri)</span></label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password:e.target.value})} placeholder="••••••••" />
            </div>

            <div style={{ background:'rgba(79,195,247,0.06)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:8, padding:'10px 12px', marginBottom:16 }}>
              <p style={{ color:'var(--blue)', fontSize:12, lineHeight:1.6 }}>
                Il magazziniere accede con <strong>nome utente</strong> o <strong>email</strong> (se inserita) e la password. Dopo la creazione potresti dover riaccedere come admin.
              </p>
            </div>

            <button onClick={createAccount} className="btn btn-primary btn-full" disabled={loading} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}>
              {loading ? 'Creazione in corso...' : <><Check size={16} /> Crea account</>}
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
                ← Indietro
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
                <p style={{ color:'var(--blue)', fontSize:15, fontFamily:'monospace', fontWeight:600, marginTop:6 }}>@{showDetail.username}</p>

                {showDetail.email && (
                  <p style={{ color:'var(--text2)', fontSize:13, marginTop:4 }}>{showDetail.email}</p>
                )}
                <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:10 }}>
                  <span className="badge" style={{
                    background: ROLE_COLORS[showDetail.role]?.bg || 'rgba(79,195,247,0.15)',
                    color: ROLE_COLORS[showDetail.role]?.color || 'var(--blue)', fontSize:13, padding:'5px 14px'
                  }}>
                    {ROLE_LABELS[showDetail.role] || 'Magazziniere'}
                  </span>
                  <span className="badge" style={{
                    background: showDetail.active !== false ? 'rgba(105,240,174,0.15)' : 'rgba(144,144,176,0.15)',
                    color: showDetail.active !== false ? 'var(--green)' : 'var(--text2)', fontSize:13, padding:'5px 14px'
                  }}>
                    {showDetail.active !== false ? '● Attivo' : '○ Disattivato'}
                  </span>
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
                    <span style={{ color:'var(--text2)', fontSize:13 }}>Account creato il</span>
                    <span style={{ fontSize:13, fontWeight:600 }}>{new Date(showDetail.createdAt).toLocaleDateString('it-IT', { day:'numeric', month:'long', year:'numeric' })}</span>
                  </div>
                )}

                <button
                  onClick={() => { setEditMode(true); setNewUsername(showDetail.username); clearDetailMsg() }}
                  className="btn btn-secondary btn-full"
                  style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}
                >
                  <Edit size={16} /> Modifica
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
                  <label>Nome utente</label>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ color:'var(--text2)', fontFamily:'monospace', fontSize:15 }}>@</span>
                    <input
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, ''))}
                      style={{ fontFamily:'monospace', flex:1 }}
                      onKeyDown={e => { if (e.key === 'Enter') saveUsername() }}
                    />
                    <button onClick={saveUsername} className="btn btn-secondary" style={{ padding:'9px 16px', flexShrink:0 }}>Salva</button>
                  </div>
                </div>

                {/* Cambio password — sempre aperta */}
                <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                  <p style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Cambia password</p>
                  <div className="form-group">
                    <label>Nuova password</label>
                    <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Minimo 6 caratteri" />
                  </div>
                  <div className="form-group" style={{ marginBottom:10 }}>
                    <label>Tua password admin <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(per confermare)</span></label>
                    <input type="password" value={adminPw} onChange={e => setAdminPw(e.target.value)} placeholder="La tua password attuale" />
                  </div>
                  <button onClick={changePassword} className="btn btn-secondary" style={{ width:'100%', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }} disabled={loading}>
                    {loading ? 'Salvataggio...' : <><Save size={16} /> Salva nuova password</>}
                  </button>
                </div>

                {/* Cambio ruolo — menu ad hamburger */}
                {showDetail.id !== user.uid && (
                  <div style={{ marginBottom:16, position:'relative' }}>
                    <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Ruolo</p>
                    <button onClick={() => setRoleMenuOpen(o => !o)} className="btn btn-secondary" style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:9 }}>☰ {ROLE_LABELS[showDetail.role]}</span>
                      <span style={{ fontSize:12 }}>{roleMenuOpen ? '▲' : '▼'}</span>
                    </button>
                    {roleMenuOpen && (
                      <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.16)', zIndex:20, overflow:'hidden' }}>
                        {[
                          { key:'worker', label:'Magazziniere' },
                          { key:'admin', label:'Admin' },
                          { key:'organizzatore-brasserie', label:'Organizzatore Brasserie' },
                          { key:'organizzatore-evento', label:'Organizzatore evento' },
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
                    <p style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Configurazione evento</p>
                    <OrgConfigFields
                      orgConfig={orgConfig} setOrgConfig={setOrgConfig}
                      newCustomDate={newCustomDate} setNewCustomDate={setNewCustomDate}
                      addCustomDate={addCustomDate} removeCustomDate={removeCustomDate}
                    />
                    <button onClick={saveOrgConfig} className="btn btn-primary btn-full" style={{ marginTop:12 }}>Salva configurazione evento</button>
                  </div>
                )}

                {/* Sotto-menu: evento collegato (solo per il ruolo Organizzatore evento) */}
                {showDetail.role === 'organizzatore-evento' && (
                  <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                    <p style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Evento organizzato</p>
                    <EventOrganizerFields events={events} assignedEventId={assignedEventId} setAssignedEventId={setAssignedEventId} />
                    <button onClick={saveAssignedEvent} className="btn btn-primary btn-full" style={{ marginTop:12 }}>Salva evento collegato</button>
                  </div>
                )}

                {/* Indisponibilità (solo worker) */}
                {showDetail.role === 'worker' && detailUnavail.length > 0 && (
                  <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
                    <p style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>Indisponibilità segnalate</p>
                    {[...detailUnavail].sort((a,b) => a.startDate.localeCompare(b.startDate)).map(u => (
                      <div key={u.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', marginBottom:6 }}>
                        <div>
                          <p style={{ fontWeight:700, fontSize:13 }}>
                            {u.startDate === u.endDate
                              ? new Date(u.startDate).toLocaleDateString('it-IT', { day:'numeric', month:'long', year:'numeric' })
                              : `${new Date(u.startDate).toLocaleDateString('it-IT', { day:'numeric', month:'short' })} → ${new Date(u.endDate).toLocaleDateString('it-IT', { day:'numeric', month:'short', year:'numeric' })}`
                            }
                          </p>
                          {u.reason && <p style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{u.reason}</p>}
                        </div>
                        <button onClick={() => removeUnavailability(u.id)} className="btn-no-anim" style={{ background:'transparent', color:'var(--red)', fontSize:12, fontWeight:700, flexShrink:0 }}>Rimuovi</button>
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
                    {showDetail.active !== false ? <><Warn size={15} /> Disattiva accesso</> : <><Check size={15} /> Riattiva accesso</>}
                  </button>
                  {showDetail.id !== user.uid && (
                    <button onClick={deleteAccount} style={{
                      background:'rgba(255,82,82,0.1)', color:'var(--red)',
                      borderRadius:10, padding:'12px', fontWeight:700, fontSize:13,
                      display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7
                    }}>
                      <Trash size={15} /> Elimina account
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
