import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { db } from '../firebase'
import { collection, onSnapshot, doc, addDoc, updateDoc, query, orderBy, where, serverTimestamp } from 'firebase/firestore'
import { Check, Edit, Warn, Truck } from '../components/Icon'
import BackHomeButton from '../components/BackHomeButton'

const COLOR_PALETTE = ['#e63946', '#2563eb', '#16a085', '#9b59e0', '#ea580c', '#059669', '#4285F4', '#d4820a']
const EMPTY_FORM = { name: '', color: COLOR_PALETTE[0], emoji: '', plate: '' }

export default function Vehicles() {
  const { user, profile } = useAuth()
  const confirm = useConfirm()
  const [vehicles, setVehicles] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const createDrag = useModalDrag(() => setShowCreate(false))
  const detailDrag  = useModalDrag(() => setShowDetail(null))
  useModalScrollLock(showCreate || !!showDetail)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!profile?.teamId) return
    const q = query(collection(db, 'vehicles'), where('teamId', '==', profile.teamId), orderBy('name'))
    return onSnapshot(q, snap => setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [profile?.teamId])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const createVehicle = async () => {
    if (!form.name.trim()) { setError('Inserisci un nome per il furgone.'); return }
    setLoading(true); setError('')
    try {
      await addDoc(collection(db, 'vehicles'), {
        name: form.name.trim(),
        color: form.color || null,
        emoji: form.emoji.trim() || null,
        plate: form.plate.trim() || null,
        teamId: profile.teamId,
        active: true,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      })
      setForm(EMPTY_FORM)
      setShowCreate(false)
      showToast('✓ Furgone aggiunto')
    } finally { setLoading(false) }
  }

  const saveEdit = async () => {
    if (!editForm.name.trim()) return
    await updateDoc(doc(db, 'vehicles', showDetail.id), {
      name: editForm.name.trim(),
      color: editForm.color || null,
      emoji: editForm.emoji.trim() || null,
      plate: editForm.plate.trim() || null,
    })
    setShowDetail(d => ({ ...d, ...editForm }))
    setEditMode(false)
    showToast('✓ Furgone aggiornato')
  }

  const toggleActive = async () => {
    const isActive = showDetail.active !== false
    if (!(await confirm({
      title: isActive ? 'Disattiva furgone' : 'Riattiva furgone',
      message: `Vuoi ${isActive ? 'disattivare' : 'riattivare'} "${showDetail.name}"? ${isActive ? 'Resterà visibile sugli eventi che lo referenziano già, ma non sarà più assegnabile a nuovi oggetti.' : ''}`,
      confirmLabel: isActive ? 'Disattiva' : 'Riattiva',
      danger: isActive,
    }))) return
    await updateDoc(doc(db, 'vehicles', showDetail.id), { active: !isActive })
    setShowDetail(d => ({ ...d, active: !isActive }))
    showToast(isActive ? '✓ Furgone disattivato' : '✓ Furgone riattivato')
  }

  const active   = vehicles.filter(v => v.active !== false)
  const inactive = vehicles.filter(v => v.active === false)

  const ColorPicker = ({ value, onChange }) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {COLOR_PALETTE.map(c => (
        <button key={c} onClick={() => onChange(c)} type="button"
          style={{
            width: 30, height: 30, borderRadius: '50%', background: c, flexShrink: 0,
            border: value === c ? '3px solid var(--text)' : '2px solid transparent',
          }} />
      ))}
    </div>
  )

  const VehicleRow = ({ v }) => (
    <div className="item-row" onClick={() => {
      setShowDetail(v); setEditMode(false)
      setEditForm({ name: v.name, color: v.color || COLOR_PALETTE[0], emoji: v.emoji || '', plate: v.plate || '' })
    }} style={{ cursor: 'pointer' }}>
      <div className="item-icon" style={{
        background: v.active !== false ? `${v.color || 'var(--blue)'}22` : 'rgba(144,144,176,0.1)',
        color: v.active !== false ? (v.color || 'var(--blue)') : 'var(--text2)',
        fontSize: 20,
      }}>
        {v.emoji || <Truck size={20} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 15, color: v.active !== false ? 'var(--text)' : 'var(--text2)' }}>{v.name}</p>
        {v.plate && <p style={{ color: 'var(--text2)', fontSize: 13 }}>{v.plate}</p>}
      </div>
      {v.active === false && (
        <span className="badge" style={{ background: 'rgba(144,144,176,0.15)', color: 'var(--text2)' }}>Disattivato</span>
      )}
      <span style={{ color: 'var(--text2)', fontSize: 18 }}>›</span>
    </div>
  )

  return (
    <div className="page users-page">
      {toast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 20px', zIndex: 999, fontSize: 14, fontWeight: 600, color: 'var(--text)', boxShadow: 'var(--shadow)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <BackHomeButton />
            <h1>Furgoni</h1>
          </div>
          <button onClick={() => { setShowCreate(true); setError(''); setForm(EMPTY_FORM) }} className="btn btn-primary" style={{ padding: '10px 16px', fontSize: 14 }}>+ Nuovo</button>
        </div>
        <p style={{ marginTop:4 }}>{vehicles.length} mezzi totali</p>
      </div>

      <div style={{ padding: '16px 0 0' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', margin: '0 16px 16px', overflow: 'hidden' }}>
          {active.length === 0
            ? <div className="empty-state" style={{ padding: '30px' }}>
                <p style={{ color: 'var(--text3)', marginBottom: 4 }}><Truck size={34} /></p>
                <h3>Nessun furgone</h3>
                <p>Aggiungi il primo mezzo con il tasto + in alto</p>
              </div>
            : active.map(v => <VehicleRow key={v.id} v={v} />)
          }
        </div>

        {inactive.length > 0 && (
          <>
            <p style={{ padding: '0 16px 10px', color: 'var(--text2)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Disattivati</p>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', margin: '0 16px 16px', overflow: 'hidden' }}>
              {inactive.map(v => <VehicleRow key={v.id} v={v} />)}
            </div>
          </>
        )}
      </div>

      {/* Modal crea furgone */}
      {showCreate && (
        <div className={`modal-overlay${createDrag.closing ? ' closing' : ''}`} onClick={createDrag.onOverlayClick}>
          <div className={`modal${createDrag.jiggling ? ' modal-jiggle' : ''}${createDrag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...createDrag.props}>
            <button className="close-btn" onClick={createDrag.close}>✕</button>
            <h2>Nuovo furgone</h2>

            {error && (
              <div style={{ background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)', color: 'var(--red)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label>Nome *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="es. Furgone 1 - Iveco" />
            </div>
            <div className="form-group">
              <label>Emoji <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 12 }}>(opzionale)</span></label>
              <input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} placeholder="🚐" maxLength={4} />
            </div>
            <div className="form-group">
              <label>Targa <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 12 }}>(opzionale)</span></label>
              <input value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} placeholder="es. AB123CD" />
            </div>
            <div className="form-group" style={{ marginBottom: 6 }}>
              <label>Colore</label>
              <ColorPicker value={form.color} onChange={c => setForm({ ...form, color: c })} />
            </div>

            <button onClick={createVehicle} className="btn btn-primary btn-full" style={{ marginTop: 12 }} disabled={loading}>
              {loading ? 'Creazione in corso...' : <><Check size={16} /> Crea furgone</>}
            </button>
          </div>
        </div>
      )}

      {/* Modal dettaglio/modifica furgone */}
      {showDetail && (
        <div className={`modal-overlay${detailDrag.closing ? ' closing' : ''}`} onClick={detailDrag.onOverlayClick}>
          <div className={`modal${detailDrag.jiggling ? ' modal-jiggle' : ''}${detailDrag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...detailDrag.props}>
            <button className="close-btn" onClick={detailDrag.close}>✕</button>

            {!editMode ? (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 20, margin: '0 auto 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
                    background: `${showDetail.color || 'var(--blue)'}22`,
                  }}>
                    {showDetail.emoji || <Truck size={28} />}
                  </div>
                  <h2 style={{ margin: 0, fontSize: 22 }}>{showDetail.name}</h2>
                  {showDetail.plate && <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>{showDetail.plate}</p>}
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                    <span className="badge" style={{
                      background: showDetail.active !== false ? 'rgba(105,240,174,0.15)' : 'rgba(144,144,176,0.15)',
                      color: showDetail.active !== false ? 'var(--green)' : 'var(--text2)', fontSize: 13, padding: '5px 14px'
                    }}>
                      {showDetail.active !== false ? '● Attivo' : '○ Disattivato'}
                    </span>
                  </div>
                </div>

                <button onClick={() => setEditMode(true)} className="btn btn-secondary btn-full"
                  style={{ marginBottom: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <Edit size={16} /> Modifica
                </button>
                <button onClick={toggleActive} style={{
                  width: '100%',
                  background: showDetail.active !== false ? 'rgba(245,166,35,0.12)' : 'rgba(105,240,174,0.1)',
                  color: showDetail.active !== false ? 'var(--accent2)' : 'var(--green)',
                  borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: 13,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}>
                  {showDetail.active !== false ? <><Warn size={15} /> Disattiva furgone</> : <><Check size={15} /> Riattiva furgone</>}
                </button>
              </>
            ) : (
              <>
                <h2 style={{ margin: '0 0 20px', fontSize: 22, textAlign: 'center' }}>Modifica furgone</h2>
                <div className="form-group">
                  <label>Nome *</label>
                  <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Emoji</label>
                  <input value={editForm.emoji} onChange={e => setEditForm({ ...editForm, emoji: e.target.value })} maxLength={4} />
                </div>
                <div className="form-group">
                  <label>Targa</label>
                  <input value={editForm.plate} onChange={e => setEditForm({ ...editForm, plate: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 6 }}>
                  <label>Colore</label>
                  <ColorPicker value={editForm.color} onChange={c => setEditForm({ ...editForm, color: c })} />
                </div>
                <button onClick={saveEdit} className="btn btn-primary btn-full" style={{ marginTop: 12 }} disabled={!editForm.name.trim()}>
                  Salva modifiche
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
