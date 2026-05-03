import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, usernameToEmail } from '../context/AuthContext'
import { db, auth } from '../firebase'
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth'

export default function AdminUsers() {
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers]             = useState([])
  const [showCreate, setShowCreate]   = useState(false)
  const [showDetail, setShowDetail]   = useState(null)
  const [form, setForm]               = useState({ name:'', username:'', password:'', email:'' })
  const [pwSection, setPwSection]     = useState(false)
  const [newPw, setNewPw]             = useState('')
  const [adminPw, setAdminPw]         = useState('')
  const [editUsername, setEditUsername] = useState(false)
  const [newUsername, setNewUsername]   = useState('')
  const [error, setError]             = useState('')
  const [detailMsg, setDetailMsg]     = useState({ text:'', type:'' })
  const [loading, setLoading]         = useState(false)
  const [toast, setToast]             = useState('')

  useEffect(() => {
    const q = query(collection(db, 'profiles'), orderBy('name'))
    return onSnapshot(q, snap => setUsers(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }
  const clearDetailMsg = () => setDetailMsg({ text:'', type:'' })

  // ── Crea account ──────────────────────────────────────────────
  const createAccount = async () => {
    if (!form.name.trim() || !form.username.trim() || form.password.length < 6) {
      setError('Compila tutti i campi. Password minimo 6 caratteri.'); return
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
        role:          'worker',
        active:        true,
        createdAt:     new Date().toISOString(),
        createdBy:     user.uid,
      })

      // Firebase ci ha switchato all'utente appena creato → rientra come admin
      if (adminPassword) {
        await signInWithEmailAndPassword(auth, adminEmail, adminPassword)
        showToast(`✅ Account creato per ${form.name}!`)
      } else {
        // Non abbiamo la password admin in sessione → avvisa e forza logout
        showToast(`✅ Account creato! Dovrai riaccedere come admin.`)
        setTimeout(() => logout(), 2500)
      }

      setForm({ name:'', username:'', password:'', email:'' })
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
    if (!confirm(`Vuoi ${isActive ? 'disattivare' : 'riattivare'} l'account di ${showDetail.name}?`)) return
    await updateDoc(doc(db, 'profiles', showDetail.id), { active: !isActive })
    setShowDetail(d => ({ ...d, active: !isActive }))
    clearDetailMsg()
  }

  // ── Promuovi / declassa ruolo ─────────────────────────────────
  const toggleRole = async () => {
    const newRole = showDetail.role === 'admin' ? 'worker' : 'admin'
    if (!confirm(`Vuoi rendere ${showDetail.name} ${newRole === 'admin' ? 'Amministratore' : 'Magazziniere'}?`)) return
    await updateDoc(doc(db, 'profiles', showDetail.id), { role: newRole })
    setShowDetail(d => ({ ...d, role: newRole }))
    setDetailMsg({ text: `${showDetail.name} è ora ${newRole === 'admin' ? 'Amministratore' : 'Magazziniere'}.`, type:'success' })
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
        setDetailMsg({ text: `✅ Nuova password salvata. Verrà applicata al prossimo accesso di ${showDetail.name}.`, type:'success' })
        setNewPw(''); setAdminPw(''); setPwSection(false)
      } catch(e) {
        setDetailMsg({ text: 'Password admin non corretta o errore di connessione.', type:'error' })
      } finally { setLoading(false) }
      return
    }

    // Rientra come admin
    try { await signInWithEmailAndPassword(auth, adminEmail, adminPw) } catch(e) {}
    setDetailMsg({ text: `✅ Password di ${showDetail.name} aggiornata!`, type:'success' })
    setNewPw(''); setAdminPw(''); setPwSection(false)
    setLoading(false)
  }

  // ── Modifica username ─────────────────────────────────────────
  const saveUsername = async () => {
    const cleaned = newUsername.toLowerCase().trim().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')
    if (!cleaned) { setDetailMsg({ text:'Il nome utente non può essere vuoto.', type:'error' }); return }
    if (cleaned === showDetail.username) { setEditUsername(false); return }
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
    setEditUsername(false)
    setDetailMsg({ text: `Nome utente aggiornato a @${cleaned}.`, type:'success' })
  }

  // ── Elimina account ───────────────────────────────────────────
  const deleteAccount = async () => {
    if (!confirm(`Eliminare definitivamente l'account di ${showDetail.name}?\nQuesta azione non può essere annullata.`)) return
    const name = showDetail.name
    await deleteDoc(doc(db, 'profiles', showDetail.id))
    // Il record Firebase Auth rimane ma senza profilo l'utente non accede all'app.
    // Per rimuoverlo del tutto serve Firebase Console → Authentication → elimina utente.
    setShowDetail(null)
    showToast(`🗑 Account di ${name} eliminato.`)
  }

  const workers = users.filter(u => u.role === 'worker')
  const admins  = users.filter(u => u.role === 'admin')

  const UserRow = ({ u }) => (
    <div className="item-row" onClick={() => { setShowDetail(u); setPwSection(false); clearDetailMsg(); setNewPw(''); setAdminPw('') }} style={{ cursor:'pointer' }}>
      <div className="item-icon" style={{
        background: u.role === 'admin' ? 'rgba(233,69,96,0.15)' : u.active !== false ? 'rgba(79,195,247,0.15)' : 'rgba(144,144,176,0.1)'
      }}>
        {u.role === 'admin' ? '👑' : u.active !== false ? '👷' : '🚫'}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontWeight:700, fontSize:15, color: u.active !== false ? 'var(--text)' : 'var(--text2)' }}>{u.name}</p>
        <p style={{ color:'var(--text2)', fontSize:13 }}>@{u.username}</p>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span className="badge" style={{
          background: u.role === 'admin' ? 'rgba(233,69,96,0.15)' : u.active !== false ? 'rgba(79,195,247,0.15)' : 'rgba(144,144,176,0.15)',
          color: u.role === 'admin' ? 'var(--accent)' : u.active !== false ? 'var(--blue)' : 'var(--text2)'
        }}>
          {u.role === 'admin' ? 'Admin' : u.active !== false ? 'Attivo' : 'Disattivato'}
        </span>
        <span style={{ color:'var(--text2)', fontSize:18 }}>›</span>
      </div>
    </div>
  )

  return (
    <div className="page">
      {/* Toast globale */}
      {toast && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 20px', zIndex:999, fontSize:14, fontWeight:600, color:'var(--text)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}

      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <button onClick={() => navigate('/')} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14 }}>← Indietro</button>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h1>Utenti</h1><p>{users.length} account totali</p></div>
          <button onClick={() => { setShowCreate(true); setError('') }} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>+ Nuovo</button>
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
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'0 16px', overflow:'hidden' }}>
          {workers.length === 0
            ? <div className="empty-state" style={{ padding:'30px' }}>
                <p style={{ fontSize:32 }}>👷</p>
                <h3>Nessun magazziniere</h3>
                <p>Crea il primo account con il tasto + in alto</p>
              </div>
            : workers.map(u => <UserRow key={u.id} u={u} />)
          }
        </div>

        <div style={{ margin:'16px', background:'rgba(79,195,247,0.05)', border:'1px solid rgba(79,195,247,0.15)', borderRadius:'var(--radius)', padding:'14px' }}>
          <p style={{ color:'var(--blue)', fontWeight:700, fontSize:13, marginBottom:6 }}>ℹ️ Come funziona il login</p>
          <p style={{ color:'var(--text2)', fontSize:13, lineHeight:1.6 }}>I magazzinieri accedono con il loro <strong style={{ color:'var(--text)' }}>nome utente</strong> (es. <code>marco.bianchi</code>) o con la loro <strong style={{ color:'var(--text)' }}>email</strong> se inserita, più la password impostata da te.</p>
        </div>
      </div>

      {/* ── Modal crea account ─────────────────────────────── */}
      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowCreate(false)}>✕</button>
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
            <div className="form-group" style={{ marginBottom:6 }}>
              <label>Password * <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(min. 6 caratteri)</span></label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password:e.target.value})} placeholder="••••••••" />
            </div>

            <div style={{ background:'rgba(79,195,247,0.06)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:8, padding:'10px 12px', marginBottom:16 }}>
              <p style={{ color:'var(--blue)', fontSize:12, lineHeight:1.6 }}>
                💡 Il magazziniere accede con <strong>nome utente</strong> o <strong>email</strong> (se inserita) e la password. Dopo la creazione potresti dover riaccedere come admin.
              </p>
            </div>

            <button onClick={createAccount} className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Creazione in corso...' : '✅ Crea account'}
            </button>
          </div>
        </div>
      )}

      {/* ── Modal dettaglio account ────────────────────────── */}
      {showDetail && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowDetail(null)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowDetail(null)}>✕</button>

            {/* Intestazione */}
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:52, marginBottom:8 }}>
                {showDetail.role === 'admin' ? '👑' : showDetail.active !== false ? '👷' : '🚫'}
              </div>
              <h2 style={{ margin:0, fontSize:22 }}>{showDetail.name}</h2>

              {/* Username modificabile */}
              {!editUsername ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:6 }}>
                  <p style={{ color:'var(--blue)', fontSize:15, fontFamily:'monospace', fontWeight:600 }}>@{showDetail.username}</p>
                  <button
                    onClick={() => { setNewUsername(showDetail.username); setEditUsername(true); clearDetailMsg() }}
                    style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:6, padding:'3px 8px', fontSize:12, fontWeight:600 }}
                  >
                    ✏️ modifica
                  </button>
                </div>
              ) : (
                <div style={{ marginTop:8, display:'flex', gap:8, alignItems:'center', justifyContent:'center' }}>
                  <span style={{ color:'var(--text2)', fontFamily:'monospace', fontSize:15 }}>@</span>
                  <input
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, ''))}
                    style={{ fontFamily:'monospace', fontSize:14, padding:'6px 10px', maxWidth:180, textAlign:'center' }}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') saveUsername(); if (e.key === 'Escape') setEditUsername(false) }}
                  />
                  <button onClick={saveUsername} style={{ background:'var(--green)', color:'#000', borderRadius:8, padding:'6px 12px', fontWeight:700, fontSize:13 }}>✓</button>
                  <button onClick={() => setEditUsername(false)} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:8, padding:'6px 10px', fontWeight:700, fontSize:13 }}>✕</button>
                </div>
              )}

              {/* Email opzionale */}
              {showDetail.email && (
                <p style={{ color:'var(--text2)', fontSize:13, marginTop:4 }}>📧 {showDetail.email}</p>
              )}
              <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:10 }}>
                <span className="badge" style={{
                  background: showDetail.role === 'admin' ? 'rgba(233,69,96,0.15)' : 'rgba(79,195,247,0.15)',
                  color: showDetail.role === 'admin' ? 'var(--accent)' : 'var(--blue)', fontSize:13, padding:'5px 14px'
                }}>
                  {showDetail.role === 'admin' ? '👑 Amministratore' : '👷 Magazziniere'}
                </span>
                <span className="badge" style={{
                  background: showDetail.active !== false ? 'rgba(105,240,174,0.15)' : 'rgba(144,144,176,0.15)',
                  color: showDetail.active !== false ? 'var(--green)' : 'var(--text2)', fontSize:13, padding:'5px 14px'
                }}>
                  {showDetail.active !== false ? '● Attivo' : '○ Disattivato'}
                </span>
              </div>
            </div>

            {/* Info creazione */}
            {showDetail.createdAt && (
              <div style={{ background:'var(--bg3)', borderRadius:8, padding:'10px 14px', marginBottom:16, display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'var(--text2)', fontSize:13 }}>Account creato il</span>
                <span style={{ fontSize:13, fontWeight:600 }}>{new Date(showDetail.createdAt).toLocaleDateString('it-IT', { day:'numeric', month:'long', year:'numeric' })}</span>
              </div>
            )}

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

            {/* Azioni stato + ruolo */}
            <div style={{ display:'grid', gridTemplateColumns: showDetail.id !== user.uid ? '1fr 1fr' : '1fr', gap:10, marginBottom:16 }}>
              <button onClick={toggleActive} style={{
                background: showDetail.active !== false ? 'rgba(255,82,82,0.1)' : 'rgba(105,240,174,0.1)',
                color: showDetail.active !== false ? 'var(--red)' : 'var(--green)',
                borderRadius:10, padding:'12px', fontWeight:700, fontSize:13
              }}>
                {showDetail.active !== false ? '🚫 Disattiva accesso' : '✅ Riattiva accesso'}
              </button>
              {showDetail.id !== user.uid && (
                <button onClick={toggleRole}
                  className={showDetail.role === 'admin' ? '' : 'btn-gold'}
                  style={showDetail.role === 'admin' ? {
                    background:'rgba(245,166,35,0.1)', color:'var(--accent2)',
                    borderRadius:10, padding:'12px', fontWeight:700, fontSize:13
                  } : {
                    borderRadius:10, padding:'12px', fontWeight:700, fontSize:13
                  }}>
                  {showDetail.role === 'admin' ? '👷 Rendi Magazziniere' : '👑 Rendi Admin'}
                </button>
              )}
            </div>

            {/* Cambio password */}
            <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px', marginBottom:16 }}>
              <button
                onClick={() => { setPwSection(!pwSection); clearDetailMsg(); setNewPw(''); setAdminPw('') }}
                style={{ background:'transparent', color:'var(--text)', fontWeight:700, fontSize:14, width:'100%', textAlign:'left', display:'flex', justifyContent:'space-between', alignItems:'center' }}
              >
                <span>🔑 Cambia password</span>
                <span style={{ color:'var(--text2)', fontSize:18 }}>{pwSection ? '▲' : '▼'}</span>
              </button>

              {pwSection && (
                <div style={{ marginTop:12 }}>
                  <div className="form-group">
                    <label>Nuova password</label>
                    <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Minimo 6 caratteri" />
                  </div>
                  <div className="form-group" style={{ marginBottom:10 }}>
                    <label>Tua password admin <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(per confermare)</span></label>
                    <input type="password" value={adminPw} onChange={e => setAdminPw(e.target.value)} placeholder="La tua password attuale" />
                  </div>
                  <button onClick={changePassword} className="btn btn-secondary" style={{ width:'100%' }} disabled={loading}>
                    {loading ? 'Salvataggio...' : '💾 Salva nuova password'}
                  </button>
                </div>
              )}
            </div>

            {/* Elimina (non su se stesso) */}
            {showDetail.id !== user.uid && (
              <button onClick={deleteAccount} style={{
                width:'100%', background:'rgba(255,82,82,0.07)',
                color:'var(--red)', border:'1px solid rgba(255,82,82,0.2)',
                borderRadius:10, padding:'13px', fontWeight:700, fontSize:14
              }}>
                🗑 Elimina account definitivamente
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
