import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import LogoutButton from '../components/LogoutButton'
import { uploadEventContentFile, deleteEventContentFile, SOFT_SIZE_WARNING_BYTES } from '../utils/eventOrganizerStorage'

const CATEGORIES = [
  { key: 'video', label: 'Video', accept: 'video/*' },
  { key: 'pptx', label: 'Presentazione (PPTX)', accept: '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { key: 'tappo', label: 'Sfondo di riserva', accept: 'image/*' },
]

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

const newItemId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export default function EventOrganizerHome() {
  const { profile } = useAuth()
  const confirm = useConfirm()
  const eventId = profile?.assignedEventId
  const [event, setEvent] = useState(null)
  const [items, setItems] = useState([])
  const [progress, setProgress] = useState({}) // { [category]: 0-100 | null }
  const [error, setError] = useState('')

  useEffect(() => {
    if (!eventId) return
    return onSnapshot(doc(db, 'events', eventId), snap => setEvent(snap.exists() ? { id: snap.id, ...snap.data() } : null))
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    return onSnapshot(doc(db, 'eventOrganizerContent', eventId), snap => setItems(snap.exists() ? (snap.data().items || []) : []))
  }, [eventId])

  const saveItems = async (newItems) => {
    await setDoc(doc(db, 'eventOrganizerContent', eventId), {
      eventId, teamId: profile.teamId, items: newItems, updatedAt: new Date().toISOString(),
    }, { merge: true })
  }

  const handleFileChosen = async (category, file) => {
    if (!file) return
    setError('')

    if (file.size > SOFT_SIZE_WARNING_BYTES) {
      const proceed = await confirm({
        title: 'File molto grande',
        message: `${file.name} pesa ${formatBytes(file.size)}. Va bene, ma tienilo a mente: file più grandi richiedono più tempo per il caricamento (e per lo scarico da parte nostra). Vuoi procedere comunque?`,
        confirmLabel: 'Carica comunque',
      })
      if (!proceed) return
    }

    setProgress(p => ({ ...p, [category]: 0 }))
    try {
      const { promise } = uploadEventContentFile(eventId, category, file, pct => setProgress(p => ({ ...p, [category]: pct })))
      const { url, path, fileName } = await promise
      const newItem = { id: newItemId(), category, label: fileName, fileName, storagePath: path, url, uploadedAt: new Date().toISOString() }
      await saveItems([...items, newItem])
    } catch (e) {
      setError('Caricamento non riuscito. Controlla la connessione e riprova.')
    } finally {
      setProgress(p => ({ ...p, [category]: null }))
    }
  }

  const handleDelete = async (item) => {
    if (!(await confirm({
      title: 'Rimuovi file',
      message: `Rimuovere "${item.fileName}"?`,
      confirmLabel: 'Rimuovi',
      danger: true,
    }))) return
    await deleteEventContentFile(item.storagePath)
    await saveItems(items.filter(i => i.id !== item.id))
  }

  if (!eventId) {
    return (
      <div className="page" style={{ padding: '24px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 20 }}>Contenuti evento</h1>
          <LogoutButton name={profile?.name} className="btn btn-secondary" style={{ padding: '9px 16px', fontSize: 13 }} />
        </div>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>Non sei ancora collegato a nessun evento. Contatta l'amministratore.</p>
      </div>
    )
  }

  return (
    <div className="page" style={{ padding: 'calc(env(safe-area-inset-top) + 24px) 16px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event?.name || 'Caricamento…'}</h1>
          {event && (
            <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>
              {new Date(event.date + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
              {event.location ? ` · ${event.location}` : ''}
            </p>
          )}
        </div>
        <LogoutButton name={profile?.name} className="btn btn-secondary" style={{ padding: '9px 16px', fontSize: 13, flexShrink: 0 }} />
      </div>

      <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
        Carica qui i contenuti per il tuo evento. Li scaricheremo noi prima della serata — niente WeTransfer o email.
      </p>

      {error && (
        <div style={{ background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)', color: 'var(--red)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {CATEGORIES.map(cat => {
        const catItems = items.filter(i => i.category === cat.key)
        const pct = progress[cat.key]
        return (
          <div key={cat.key} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', marginBottom: 14 }}>
            <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{cat.label}</p>

            {catItems.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>{item.fileName}</span>
                <button onClick={() => handleDelete(item)} className="btn-no-anim" style={{ background: 'transparent', color: 'var(--red)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Rimuovi</button>
              </div>
            ))}

            {pct != null ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ background: 'var(--bg3)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--blue)', transition: 'width 0.2s' }} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>Caricamento… {pct}%</p>
              </div>
            ) : (
              <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '9px 16px', fontSize: 13, cursor: 'pointer' }}>
                + Carica file
                <input
                  type="file"
                  accept={cat.accept}
                  onChange={e => { handleFileChosen(cat.key, e.target.files?.[0]); e.target.value = '' }}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}
