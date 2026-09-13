import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { db } from '../firebase'
import { collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, query, orderBy, where, serverTimestamp } from 'firebase/firestore'
import { Check, Edit, Trash, Truck } from '../components/Icon'
import BackHomeButton from '../components/BackHomeButton'
import Toast from '../components/Toast'
import SaveButton from '../components/SaveButton'
import FabButton from '../components/FabButton'

const COLOR_PALETTE = ['#e63946', '#2563eb', '#16a085', '#9b59e0', '#ea580c', '#059669', '#4285F4', '#d4820a']
// Campo emoji vuoto per davvero: niente valore preimpostato che sembri
// "bloccato" lì. Se resta vuoto, l'icona mostra l'iniziale del nome (vedi
// vehicleIcon sotto) — stesso pattern già usato per l'avatar utente altrove
// nell'app — non l'emoji generica di un furgone.
const EMPTY_FORM = { name: '', color: COLOR_PALETTE[0], emoji: '', plate: '' }
// Icona di un furgone: emoji/testo personalizzato se impostato, altrimenti
// l'iniziale del nome (maiuscola), altrimenti l'icona furgone generica come
// ultima risorsa (nome vuoto non dovrebbe capitare, è obbligatorio a salvare).
const vehicleIcon = (v, size = 20) => v.emoji || v.name?.trim()?.charAt(0)?.toUpperCase() || <Truck size={size} />

export default function Vehicles() {
  const { t } = useTranslation()
  const { user, teamId } = useAuth()
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
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'vehicles'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // Ritorna true solo se ha davvero scritto — SaveButton mostra la spunta e
  // chiude/esce dalla modifica solo in quel caso, mai sul nome vuoto.
  const createVehicle = async () => {
    if (!form.name.trim()) { setError(t('vehicles.errorNameRequired')); return false }
    setError('')
    await addDoc(collection(db, 'vehicles'), {
      name: form.name.trim(),
      color: form.color || null,
      emoji: form.emoji.trim() || null,
      plate: form.plate.trim() || null,
      teamId,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    })
    setForm(EMPTY_FORM)
    return true
  }

  const saveEdit = async () => {
    if (!editForm.name.trim()) return false
    await updateDoc(doc(db, 'vehicles', showDetail.id), {
      name: editForm.name.trim(),
      color: editForm.color || null,
      emoji: editForm.emoji.trim() || null,
      plate: editForm.plate.trim() || null,
    })
    setShowDetail(d => ({ ...d, ...editForm }))
    return true
  }

  // Un furgone non ha uno stato "in pausa" che abbia senso come un utente —
  // o esiste o è stato tolto dalla flotta, non c'è via di mezzo. Eliminarlo
  // non lascia riferimenti rotti: EventItemRow (EventDetail.jsx) già gestisce
  // un vehicleId che non trova più corrispondenza, semplicemente non mostra
  // più il badge del furgone su quell'oggetto.
  // Ritorna true solo se ha davvero cancellato (SaveButton mostra spinner
  // poi spunta solo in quel caso) — se la conferma viene rifiutata si ferma
  // qui, il bottone torna semplicemente cliccabile senza nessuna animazione.
  const deleteVehicle = async () => {
    if (!(await confirm({
      title: t('vehicles.confirmDeleteTitle'),
      message: t('vehicles.confirmDeleteMessage', { name: showDetail.name }),
      confirmLabel: t('vehicles.confirmDeleteLabel'),
      danger: true,
    }))) return false
    await deleteDoc(doc(db, 'vehicles', showDetail.id))
    return true
  }

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
        fontSize: 20, fontWeight: 800,
      }}>
        {vehicleIcon(v)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 15, color: v.active !== false ? 'var(--text)' : 'var(--text2)' }}>{v.name}</p>
        {v.plate && <p style={{ color: 'var(--text2)', fontSize: 13 }}>{v.plate}</p>}
      </div>
      {/* Solo per eventuali furgoni già disattivati da prima di questo
          cambio (non se ne creano più) — restano visibili nell'elenco
          invece di sparire senza una via per eliminarli anche loro. */}
      {v.active === false && (
        <span className="badge" style={{ background: 'rgba(144,144,176,0.15)', color: 'var(--text2)' }}>{t('vehicles.deactivated')}</span>
      )}
      <span style={{ color: 'var(--text2)', fontSize: 18 }}>›</span>
    </div>
  )

  return (
    <div className="page users-page">
      <Toast message={toast} />

      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <BackHomeButton to="/admin/settings" />
          <h1>{t('vehicles.title')}</h1>
        </div>
        <p style={{ marginTop:4, textAlign:'right' }}>{t('vehicles.totalCount', { count: vehicles.length })}</p>
      </div>

      <div style={{ padding: '16px 0 0' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', margin: '0 16px 16px', overflow: 'hidden' }}>
          {vehicles.length === 0
            ? <div className="empty-state" style={{ padding: '30px' }}>
                <p style={{ color: 'var(--text3)', marginBottom: 4 }}><Truck size={34} /></p>
                <h3>{t('vehicles.emptyTitle')}</h3>
                <p>{t('vehicles.emptyDesc')}</p>
              </div>
            : vehicles.map(v => <VehicleRow key={v.id} v={v} />)
          }
        </div>
      </div>

      <FabButton onClick={() => { setShowCreate(true); setError(''); setForm(EMPTY_FORM) }} ariaLabel={t('vehicles.newButton')} />

      {/* Modal crea furgone */}
      {showCreate && (
        <div className={`modal-overlay${createDrag.closing ? ' closing' : ''}`} onClick={createDrag.onOverlayClick}>
          <div className={`modal${createDrag.jiggling ? ' modal-jiggle' : ''}${createDrag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...createDrag.props}>
            <button className="close-btn" onClick={createDrag.close}>✕</button>
            <h2>{t('vehicles.newTitle')}</h2>

            {error && (
              <div style={{ background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)', color: 'var(--red)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label>{t('vehicles.nameLabel')}</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('vehicles.namePlaceholder')} />
            </div>
            <div className="form-group">
              <label>{t('vehicles.emojiLabel')} <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 12 }}>{t('common.optional')}</span></label>
              <input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} placeholder="🚐" maxLength={4} />
            </div>
            <div className="form-group">
              <label>{t('vehicles.plateLabel')} <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 12 }}>{t('common.optional')}</span></label>
              <input value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} placeholder={t('vehicles.plateplaceholder')} />
            </div>
            <div className="form-group" style={{ marginBottom: 6 }}>
              <label>{t('vehicles.colorLabel')}</label>
              <ColorPicker value={form.color} onChange={c => setForm({ ...form, color: c })} />
            </div>

            <SaveButton onSave={createVehicle} onDone={createDrag.close} onError={createDrag.triggerJiggle} className="btn btn-primary btn-full" style={{ marginTop: 12 }}>
              <Check size={16} /> {t('vehicles.createVehicle')}
            </SaveButton>
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
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800,
                    background: `${showDetail.color || 'var(--blue)'}22`, color: showDetail.color || 'var(--blue)',
                  }}>
                    {vehicleIcon(showDetail, 28)}
                  </div>
                  <h2 style={{ margin: 0, fontSize: 22 }}>{showDetail.name}</h2>
                  {showDetail.plate && <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>{showDetail.plate}</p>}
                </div>

                <button onClick={() => setEditMode(true)} className="btn btn-secondary btn-full"
                  style={{ marginBottom: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <Edit size={16} /> {t('vehicles.edit')}
                </button>
                {/* SaveButton anche qui, non solo per i salvataggi: stesso
                    spinner mentre si aspetta Firebase e stessa spunta verde
                    alla riuscita, poi il modal si chiude con la sua
                    dissolvenza (detailDrag.close) invece di sparire di
                    scatto — .btn-red è una classe, non uno style inline,
                    così non copre il verde del successo. */}
                <SaveButton
                  onSave={deleteVehicle}
                  onDone={() => { showToast(t('vehicles.toastDeleted', { name: showDetail.name })); detailDrag.close() }}
                  onError={detailDrag.triggerJiggle}
                  className="btn btn-red btn-full"
                  style={{ fontSize: 13, padding: 12 }}
                >
                  <Trash size={15} /> {t('vehicles.deleteVehicle')}
                </SaveButton>
              </>
            ) : (
              <>
                <h2 style={{ margin: '0 0 20px', fontSize: 22, textAlign: 'center' }}>{t('vehicles.editTitle')}</h2>
                <div className="form-group">
                  <label>{t('vehicles.nameLabel')}</label>
                  <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>{t('vehicles.emojiLabel')}</label>
                  <input value={editForm.emoji} onChange={e => setEditForm({ ...editForm, emoji: e.target.value })} maxLength={4} />
                </div>
                <div className="form-group">
                  <label>{t('vehicles.plateLabel')}</label>
                  <input value={editForm.plate} onChange={e => setEditForm({ ...editForm, plate: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 6 }}>
                  <label>{t('vehicles.colorLabel')}</label>
                  <ColorPicker value={editForm.color} onChange={c => setEditForm({ ...editForm, color: c })} />
                </div>
                <SaveButton onSave={saveEdit} onDone={() => setEditMode(false)} onError={detailDrag.triggerJiggle} className="btn btn-primary btn-full" style={{ marginTop: 12 }} disabled={!editForm.name.trim()}>
                  {t('vehicles.saveChanges')}
                </SaveButton>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
