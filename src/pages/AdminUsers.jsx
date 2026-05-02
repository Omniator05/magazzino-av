import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db, auth } from '../firebase'
import { collection, onSnapshot, doc, setDoc, updateDoc, query, orderBy } from 'firebase/firestore'
import { createUserWithEmailAndPassword } from 'firebase/auth'

export default function AdminUsers() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name:'', email:'', password:'' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'profiles'), orderBy('name'))
    return onSnapshot(q, snap => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  const createWorker = async () => {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      setError('Compila tutti i campi. Password minimo 6 caratteri.'); return
    }
    setLoading(true); setError('')
    try {
      // Salva le credenziali admin attuali
      const currentEmail = auth.currentUser.email
      // Crea il nuovo utente
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password)
      await setDoc(doc(db, 'profiles', cred.user.uid), {
        name: form.name,
        email: form.email,
        role: 'worker',
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: user.uid
      })
      // IMPORTANTE: il nuovo utente è ora loggato — rilogghiamo l'admin
      // In produzione dovresti usare Firebase Admin SDK o Cloud Functions
      // Per ora mostriamo un avviso
      setSuccess(`Account creato per ${form.name}! ⚠️ Dovrai rieffettuare il login come admin.`)
      setForm({ name:'', email:'', password:'' })
      setShowModal(false)
      setTimeout(() => setSuccess(''), 6000)
    } catch(e) {
      const msgs = {
        'auth/email-already-in-use': 'Email già in uso',
        'auth/invalid-email': 'Email non valida',
        'auth/weak-password': 'Password troppo corta'
      }
      setError(msgs[e.code] || e.message)
    } finally { setLoading(false) }
  }

  const toggleWorkerActive = async (uid, currentActive, name) => {
    const action = currentActive ? 'disattivare' : 'riattivare'
    if (!confirm(`Vuoi ${action} l'account di ${name}?`)) return
    await updateDoc(doc(db, 'profiles', uid), { active: !currentActive })
  }

  const workers = users.filter(u => u.role === 'worker')
  const admins  = users.filter(u => u.role === 'admin')

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <button onClick={() => navigate('/')} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14 }}>← Indietro</button>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h1>Utenti</h1><p>{workers.length} magazzinieri</p></div>
          <button onClick={() => { setShowModal(true); setError('') }} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>+ Aggiungi</button>
        </div>
      </div>

      {success && (
        <div style={{ margin:'12px 16px 0', background:'rgba(105,240,174,0.1)', border:'1px solid rgba(105,240,174,0.3)', borderRadius:'var(--radius)', padding:'12px 16px', color:'var(--green)', fontSize:13, fontWeight:600 }}>
          ✅ {success}
        </div>
      )}

      <div style={{ padding:'16px 0 0' }}>
        {admins.length > 0 && (
          <>
            <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:13, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Amministratori</p>
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'0 16px 16px', overflow:'hidden' }}>
              {admins.map(u => (
                <div key={u.id} className="item-row" style={{ cursor:'default' }}>
                  <div className="item-icon" style={{ background:'rgba(233,69,96,0.15)' }}>👑</div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:700, fontSize:15 }}>{u.name || 'Admin'}</p>
                    <p style={{ color:'var(--text2)', fontSize:13 }}>{u.email}</p>
                  </div>
                  <span className="badge" style={{ background:'rgba(233,69,96,0.15)', color:'var(--accent)' }}>Admin</span>
                </div>
              ))}
            </div>
          </>
        )}

        <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:13, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Magazzinieri</p>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'0 16px', overflow:'hidden' }}>
          {workers.length === 0
            ? <div className="empty-state" style={{ padding:'30px' }}>
                <p style={{ fontSize:32 }}>👷</p>
                <h3>Nessun magazziniere</h3>
                <p>Aggiungi il primo account</p>
              </div>
            : workers.map(u => (
              <div key={u.id} className="item-row">
                <div className="item-icon" style={{ background: u.active !== false ? 'rgba(79,195,247,0.15)' : 'rgba(144,144,176,0.15)' }}>
                  {u.active !== false ? '👷' : '🚫'}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontWeight:700, fontSize:15, color: u.active !== false ? 'var(--text)' : 'var(--text2)' }}>{u.name}</p>
                  <p style={{ color:'var(--text2)', fontSize:13 }}>{u.email}</p>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span className="badge" style={{
                    background: u.active !== false ? 'rgba(79,195,247,0.15)' : 'rgba(144,144,176,0.15)',
                    color: u.active !== false ? 'var(--blue)' : 'var(--text2)'
                  }}>
                    {u.active !== false ? 'Attivo' : 'Disattivato'}
                  </span>
                  <button
                    onClick={() => toggleWorkerActive(u.id, u.active !== false, u.name)}
                    style={{ background: u.active !== false ? 'rgba(255,82,82,0.15)' : 'rgba(105,240,174,0.15)', color: u.active !== false ? 'var(--red)' : 'var(--green)', borderRadius:8, padding:'6px 10px', fontSize:12, fontWeight:600 }}>
                    {u.active !== false ? 'Disattiva' : 'Riattiva'}
                  </button>
                </div>
              </div>
            ))
          }
        </div>

        <div style={{ margin:'16px 16px 0', background:'rgba(79,195,247,0.05)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
          <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700, marginBottom:6 }}>ℹ️ Come funziona</p>
          <p style={{ color:'var(--text2)', fontSize:13, lineHeight:1.6 }}>
            I magazzinieri vedono solo gli eventi futuri e possono scansionare gli articoli per segnare carico e scarico. Non possono modificare il magazzino o creare eventi. Disattivando un account il magazziniere non potrà più accedere.
          </p>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            <h2>Nuovo magazziniere</h2>

            {error && (
              <div style={{ background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', color:'var(--red)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:14 }}>
                {error}
              </div>
            )}

            <div className="form-group"><label>Nome *</label><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="es. Marco Bianchi" /></div>
            <div className="form-group"><label>Email *</label><input type="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} placeholder="marco@email.com" /></div>
            <div className="form-group" style={{ marginBottom:8 }}>
              <label>Password *</label>
              <input type="password" value={form.password} onChange={e => setForm({...form,password:e.target.value})} placeholder="Minimo 6 caratteri" />
            </div>
            <p style={{ color:'var(--text2)', fontSize:12, marginBottom:20, lineHeight:1.5 }}>
              ⚠️ Dopo aver creato l'account dovrai rieffettuare il login come admin. Comunica email e password al magazziniere.
            </p>
            <button onClick={createWorker} className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Creazione...' : '✅ Crea account'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
