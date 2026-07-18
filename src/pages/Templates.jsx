import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useNavigate } from 'react-router-dom'
import EditButton from '../components/EditButton'
import DeleteButton from '../components/DeleteButton'
import { List } from '../components/Icon'
import BackHomeButton from '../components/BackHomeButton'

const ICONS = {
  'Audio':'🔊','Video':'📺','Luci':'🔦','Rigging':'⛓️','Corrente':'⚡',
  'Effetti':'🎉','Consumabili':'🪣','Kit':'🧰','Altro':'📦',
}

export default function Templates() {
  const { user, teamId } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [items, setItems]         = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState({ name:'', notes:'' })
  const [components, setComponents] = useState([])  // [{id, name, category, qty}]
  const [search, setSearch]       = useState('')
  const [saving, setSaving]       = useState(false)
  useModalScrollLock(showModal)

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'templates'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setTemplates(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'items'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [teamId])

  const openNew = () => {
    setEditing(null)
    setForm({ name:'', notes:'' })
    setComponents([])
    setSearch('')
    setShowModal(true)
  }

  const openEdit = (t) => {
    setEditing(t)
    setForm({ name:t.name, notes:t.notes||'' })
    setComponents(t.components || [])
    setSearch('')
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name.trim() || components.length === 0) return
    setSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        notes: form.notes.trim(),
        components: components.map(c => ({ id:c.id, name:c.name, category:c.category, qty:c.qty })),
        updatedAt: serverTimestamp(),
      }
      if (editing) {
        await updateDoc(doc(db, 'templates', editing.id), data)
      } else {
        await addDoc(collection(db, 'templates'), { ...data, teamId, createdAt: serverTimestamp(), createdBy: user.uid })
      }
      setShowModal(false)
    } finally { setSaving(false) }
  }

  const deleteTemplate = async (id) => {
    if (!(await confirm({ title: 'Elimina template', message: 'Eliminare questo template?', confirmLabel: 'Elimina', danger: true }))) return
    await deleteDoc(doc(db, 'templates', id))
  }

  const addComponent = (item) => {
    if (components.some(c => c.id === item.id)) return
    setComponents(prev => [...prev, { id:item.id, name:item.name, category:item.category, qty:1 }])
    setSearch('')
  }

  const notInTemplate = items.filter(i =>
    !components.some(c => c.id === i.id) &&
    (!search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.category?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <BackHomeButton />
            <h1>Template</h1>
          </div>
          <button onClick={openNew} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>
            + Template
          </button>
        </div>
        <p style={{ marginTop:4 }}>{templates.length} template salvati</p>
      </div>

      <div style={{ padding:'16px 0' }}>
        {templates.length === 0 ? (
          <div className="empty-state">
            <p style={{ color:'var(--text3)', marginBottom:4 }}><List size={40} /></p>
            <h3>Nessun template</h3>
            <p>Crea template per velocizzare la creazione degli eventi</p>
          </div>
        ) : templates.map(t => (
          <div key={t.id} style={{ margin:'0 16px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
            <div style={{ padding:'14px 16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:700, fontSize:16, marginBottom:4, display:'flex', alignItems:'center', gap:7 }}><List size={16} /> {t.name}</p>
                  {t.notes && <p style={{ color:'var(--text2)', fontSize:13, marginBottom:8 }}>{t.notes}</p>}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                    {(t.components||[]).slice(0,6).map((c,i) => (
                      <span key={i} style={{ background:'var(--card2)', borderRadius:6, padding:'2px 8px', fontSize:12, color:'var(--text2)' }}>
                        {ICONS[c.category]||'📦'} {c.name}{c.qty > 1 ? ` ×${c.qty}` : ''}
                      </span>
                    ))}
                    {(t.components||[]).length > 6 && (
                      <span style={{ background:'var(--card2)', borderRadius:6, padding:'2px 8px', fontSize:12, color:'var(--text2)' }}>
                        +{t.components.length - 6} altri
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <EditButton onClick={() => openEdit(t)} size={34} />
                  <DeleteButton onClick={() => deleteTemplate(t.id)} size={34} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ position:'relative', maxHeight:'calc(100dvh - 96px)', display:'flex', flexDirection:'column', padding:0, overflow:'hidden' }}>
            {/* Header */}
            <div style={{ padding:'20px 20px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
              <h2>{editing ? 'Modifica template' : 'Nuovo template'}</h2>
              <input value={form.name} onChange={e => setForm({...form, name:e.target.value})}
                placeholder="Nome template (es. Evento Fiera Piccolo)" style={{ marginTop:10, fontWeight:600, fontSize:15 }} />
              <input value={form.notes} onChange={e => setForm({...form, notes:e.target.value})}
                placeholder="Note opzionali..." style={{ marginTop:8, fontSize:13 }} />
            </div>

            {/* Componenti selezionati */}
            {components.length > 0 && (
              <div style={{ borderBottom:'1px solid var(--border)', background:'rgba(79,195,247,0.04)', flexShrink:0 }}>
                <p style={{ color:'var(--blue)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', padding:'10px 16px 6px' }}>
                  Lista ({components.length} articoli)
                </p>
                <div style={{ overflowY:'auto', maxHeight:220, padding:'0 16px 10px' }}>
                {components.map(c => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:16 }}>{ICONS[c.category]||'📦'}</span>
                    <span style={{ flex:1, fontSize:14, fontWeight:600, color:'var(--text)' }}>{c.name}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <button onClick={() => setComponents(prev => prev.map(x => x.id===c.id ? {...x,qty:Math.max(1,x.qty-1)} : x))}
                        style={{ width:26, height:26, borderRadius:6, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>-</button>
                      <input type="number" min="1" value={c.qty}
                        onChange={e => setComponents(prev => prev.map(x => x.id===c.id ? {...x,qty:Math.max(1,parseInt(e.target.value)||1)} : x))}
                        style={{ width:44, textAlign:'center', fontWeight:800, fontSize:15, padding:'3px 2px' }} />
                      <button onClick={() => setComponents(prev => prev.map(x => x.id===c.id ? {...x,qty:x.qty+1} : x))}
                        style={{ width:26, height:26, borderRadius:6, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>+</button>
                    </div>
                    <button onClick={() => setComponents(prev => prev.filter(x => x.id !== c.id))}
                      style={{ background:'transparent', color:'var(--text2)', fontSize:16, padding:'2px 4px' }}>✕</button>
                  </div>
                ))}
                </div>
              </div>
            )}

            {/* Ricerca articoli */}
            <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', flexShrink:0, position:'relative' }}>
              <svg style={{ position:'absolute', left:26, top:'50%', transform:'translateY(-50%)' }} viewBox="0 0 24 24" fill="var(--text2)" width="14" height="14"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cerca articolo da aggiungere..."
                style={{ paddingLeft:32, fontSize:13 }} />
            </div>

            {/* Lista articoli */}
            <div style={{ overflowY:'auto', flex:1, minHeight:0 }}>
              {notInTemplate.map(item => (
                <div key={item.id} className="item-row" onClick={() => addComponent(item)}>
                  <span style={{ fontSize:20, flexShrink:0 }}>{ICONS[item.category]||'📦'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:14 }}>{item.name}</p>
                    <p style={{ color:'var(--text2)', fontSize:12 }}>{item.category} · {item.availableQty ?? item.totalQty} disp.</p>
                  </div>
                  <span style={{ color:'var(--accent)', fontSize:20, padding:'0 8px' }}>+</span>
                </div>
              ))}
            </div>

            {/* Salva */}
            <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)', flexShrink:0, background:'var(--bg2)' }}>
              <button onClick={save} className="btn btn-primary btn-full"
                disabled={saving || !form.name.trim() || components.length === 0}
                style={{ opacity: saving || !form.name.trim() || components.length === 0 ? 0.4 : 1 }}>
                {saving ? 'Salvataggio...' : editing ? 'Salva modifiche' : `Crea template con ${components.length} articoli`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
