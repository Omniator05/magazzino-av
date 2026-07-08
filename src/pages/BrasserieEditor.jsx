import { useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import { collection, doc, onSnapshot, query, where, orderBy, setDoc, getDoc, serverTimestamp, increment, updateDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import ArtistSlotPicker from '../components/ArtistSlotPicker'
import { uploadNextGraphic, ALLOWED_IMAGE_TYPES, ACCEPT_IMAGE_ATTR } from '../utils/brasserieStorage'

// Il layer SPONSOR in Resolume ha sempre esattamente 2 colonne variabili
// (le altre sono sponsor fissi gestiti manualmente in Resolume, non da qui):
// colonna 17 = bancarella cibo, colonna 18 = DJ pre-serata (numerazione Resolume, 1-based)
const SPONSOR_SLOT_DEFS = [
  { slotId: 'sponsor-food', label: '🍔 Bancarella cibo' },
  { slotId: 'sponsor-dj', label: '🎧 DJ pre-serata' },
]
const normalizeSponsorSlots = (saved) => SPONSOR_SLOT_DEFS.map(def => {
  const existing = saved.find(s => s.slotId === def.slotId)
  return existing || { slotId: def.slotId, artistId: null, artistName: '', logoUrl: null }
})

export default function BrasserieEditor({ date, onBack }) {
  const { user, profile } = useAuth()
  const confirm = useConfirm()
  const eventName = profile?.organizerConfig?.eventName || 'Brasserie'
  const weekDocId = `${user.uid}_${date}`
  const [artists, setArtists] = useState([])
  const [artistiSlots, setArtistiSlots] = useState([])
  const [sponsorSlots, setSponsorSlots] = useState([])
  const [nextGraphic, setNextGraphic] = useState(null)
  const [status, setStatus] = useState('draft')
  const [meta, setMeta] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [publishState, setPublishState] = useState(null) // null | 'loading' | 'success' | 'error'
  const [uploadingNext, setUploadingNext] = useState(false)
  const [dragNext, setDragNext] = useState(false)
  const nextFileInputRef = useRef(null)
  const baselineRef = useRef('')

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const nextEventDateObj = new Date(date + 'T12:00:00')
  nextEventDateObj.setDate(nextEventDateObj.getDate() + 7)
  const nextEventLabel = nextEventDateObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  // Libreria artisti dell'organizzatore — sottoscrizione unica, riusata per l'autocomplete su tutti gli slot
  useEffect(() => {
    const q = query(collection(db, 'brasserieArtists'), where('organizerId', '==', user.uid), orderBy('nameLower'))
    return onSnapshot(q, snap => setArtists(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [user.uid])

  // Carica la config della settimana selezionata
  useEffect(() => {
    setLoading(true)
    setLoadError('')
    const ref = doc(db, 'brasserieWeeks', weekDocId)
    getDoc(ref).then(snap => {
      const d = snap.exists() ? snap.data() : null
      const savedArtisti = d?.layers?.artisti || []
      const artisti = savedArtisti.length > 0 ? savedArtisti : [{ slotId: `artisti-${Date.now()}`, artistId: null, artistName: '', logoUrl: null }]
      const sponsor = normalizeSponsorSlots(d?.layers?.sponsor || [])
      const next = d?.nextGraphic || null
      const st = d?.status || 'draft'
      setArtistiSlots(artisti)
      setSponsorSlots(sponsor)
      setNextGraphic(next)
      setStatus(st)
      setMeta({ createdAt: d?.createdAt || null, createdBy: d?.createdBy || null })
      baselineRef.current = JSON.stringify({ artisti, sponsor, next, st })
      setLoading(false)
    }).catch(e => {
      setLoadError(e?.code === 'permission-denied'
        ? 'Non hai i permessi per accedere a questa settimana. Riprova, oppure contatta chi gestisce il gestionale.'
        : 'Errore nel caricamento di questa settimana. Riprova.')
      setLoading(false)
    })
  }, [weekDocId, retryCount])

  const isDirty = !loading && JSON.stringify({ artisti: artistiSlots, sponsor: sponsorSlots, next: nextGraphic, st: status }) !== baselineRef.current

  const handleBack = async () => {
    if (isDirty && !(await confirm({ title: 'Modifiche non salvate', message: 'Hai modifiche non salvate per questa settimana. Uscire comunque? Le modifiche andranno perse.', confirmLabel: 'Esci comunque', danger: true }))) return
    onBack()
  }

  const addSlot = () => {
    setArtistiSlots(s => [...s, { slotId: `artisti-${Date.now()}`, artistId: null, artistName: '', logoUrl: null }])
  }
  const updateSlot = (layer, slotId, updated) => {
    const setter = layer === 'artisti' ? setArtistiSlots : setSponsorSlots
    setter(list => list.map(s => s.slotId === slotId ? updated : s))
  }
  const removeSlot = (slotId) => {
    setArtistiSlots(list => list.filter(s => s.slotId !== slotId))
  }

  const handleNextFiles = async (files) => {
    const file = files?.[0]
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return
    setUploadingNext(true)
    try {
      const { url, path } = await uploadNextGraphic(file, date)
      setNextGraphic({ url, path })
    } finally {
      setUploadingNext(false)
    }
  }

  const MIN_LOADING_MS = 1000

  const saveWeek = async (newStatus) => {
    setSaving(true)
    const startedAt = Date.now()
    if (newStatus === 'published') setPublishState('loading')
    try {
      const assignedIds = [...artistiSlots, ...sponsorSlots].map(s => s.artistId).filter(Boolean)
      const ref = doc(db, 'brasserieWeeks', weekDocId)
      await setDoc(ref, {
        date,
        organizerId: user.uid,
        layers: { artisti: artistiSlots, sponsor: sponsorSlots },
        nextGraphic: nextGraphic || null,
        status: newStatus,
        createdAt: meta.createdAt || serverTimestamp(),
        createdBy: meta.createdBy || user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      })
      setStatus(newStatus)
      setMeta(m => ({ createdAt: m.createdAt || serverTimestamp(), createdBy: m.createdBy || user.uid }))
      baselineRef.current = JSON.stringify({ artisti: artistiSlots, sponsor: sponsorSlots, next: nextGraphic, st: newStatus })
      await Promise.all([...new Set(assignedIds)].map(id =>
        updateDoc(doc(db, 'brasserieArtists', id), { usageCount: increment(1), lastUsedAt: serverTimestamp() }).catch(() => {})
      ))
      if (newStatus === 'published') {
        const remaining = MIN_LOADING_MS - (Date.now() - startedAt)
        if (remaining > 0) await new Promise(r => setTimeout(r, remaining))
        setPublishState('success')
        setTimeout(() => setPublishState(null), 1300)
      } else {
        setToast('Bozza salvata!')
        setTimeout(() => setToast(''), 3000)
      }
    } catch (e) {
      if (newStatus === 'published') {
        const remaining = MIN_LOADING_MS - (Date.now() - startedAt)
        if (remaining > 0) await new Promise(r => setTimeout(r, remaining))
        setPublishState('error')
        setTimeout(() => setPublishState(null), 1800)
      } else {
        setToast('Errore durante il salvataggio.')
        setTimeout(() => setToast(''), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page be-page">
      <style>{`
        @media (min-width: 700px) {
          .be-page .be-content { max-width: 640px; margin-left: auto; margin-right: auto; }
          .be-card { box-shadow: var(--shadow) !important; border-color: var(--border2) !important; border-radius: 18px !important; padding: 20px 22px !important; }
        }
        @keyframes bePop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes beSpin { to { transform: rotate(360deg); } }
        @keyframes beDraw { to { stroke-dashoffset: 0; } }
        .be-spinner { width: 40px; height: 40px; border-radius: 50%; border: 4px solid var(--border); border-top-color: var(--accent); animation: beSpin 0.7s linear infinite; }
        .be-pop { animation: bePop 0.25s cubic-bezier(0.34,1.56,0.64,1); }
        .be-check-path { stroke-dasharray: 40; stroke-dashoffset: 40; animation: beDraw 0.3s 0.1s ease forwards; }
      `}</style>

      {publishState && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,20,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card)', borderRadius: 20, padding: '30px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-lg)', minWidth: 160 }}>
            {publishState === 'loading' && <div className="be-spinner" />}
            {publishState === 'success' && (
              <svg className="be-pop" width="48" height="48" viewBox="0 0 52 52" fill="none">
                <circle cx="26" cy="26" r="24" stroke="var(--green)" strokeWidth="3" />
                <path className="be-check-path" d="M15 27l7 7 15-15" stroke="var(--green)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {publishState === 'error' && (
              <svg className="be-pop" width="48" height="48" viewBox="0 0 52 52" fill="none">
                <circle cx="26" cy="26" r="24" stroke="var(--red)" strokeWidth="3" />
                <path d="M18 18l16 16M34 18l-16 16" stroke="var(--red)" strokeWidth="3.5" strokeLinecap="round" />
              </svg>
            )}
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {publishState === 'loading' ? 'Pubblicazione in corso...' : publishState === 'success' ? 'Pubblicata!' : 'Errore, riprova'}
            </p>
          </div>
        </div>
      )}
      {toast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 20px', zIndex: 999, fontSize: 14, fontWeight: 600, color: 'var(--text)', boxShadow: 'var(--shadow)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      <div className="page-header">
        <button onClick={handleBack} className="btn-no-anim" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: 'var(--text2)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
          ← Calendario
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ textTransform: 'capitalize' }}>{dateLabel}</h1>
            <p>{eventName}</p>
          </div>
          <span className="badge" style={{
            background: status === 'published' ? 'rgba(105,240,174,0.15)' : 'rgba(245,166,35,0.15)',
            color: status === 'published' ? 'var(--green)' : 'var(--accent2)',
            flexShrink: 0, whiteSpace: 'nowrap', fontSize: 10,
          }}>
            {status === 'published' ? '● Pubblicata' : '○ Bozza'}
          </span>
        </div>
        {isDirty && <p style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 600, marginTop: 8 }}>Modifiche non salvate</p>}
      </div>

      <div className="be-content" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loadError && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600, marginBottom: 12 }}>{loadError}</p>
            <button onClick={() => setRetryCount(c => c + 1)} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: 13 }}>Riprova</button>
          </div>
        )}
        {!loading && !loadError && (
          <>
            {/* Layer ARTISTI */}
            <div className="be-card" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>🎧 Artisti della serata</h3>
                <button onClick={addSlot} className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: 12 }}>+ Aggiungi artista</button>
              </div>
              {artistiSlots.map((slot, i) => (
                <ArtistSlotPicker
                  key={slot.slotId}
                  slot={slot}
                  label={`Artista ${i + 1}`}
                  artists={artists}
                  onChange={updated => updateSlot('artisti', slot.slotId, updated)}
                  onRemove={artistiSlots.length > 1 ? () => removeSlot(slot.slotId) : undefined}
                />
              ))}
            </div>

            {/* Layer SPONSOR — sempre 2 slot fissi (cibo + DJ pre-serata), gli altri sponsor sono fissi in Resolume */}
            <div className="be-card" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
              <h3 style={{ margin: '0 0 12px' }}>🤝 Sponsor / pre-serata</h3>
              {sponsorSlots.map(slot => {
                const def = SPONSOR_SLOT_DEFS.find(d => d.slotId === slot.slotId)
                return (
                  <ArtistSlotPicker
                    key={slot.slotId}
                    slot={slot}
                    label={def?.label || slot.slotId}
                    artists={artists}
                    onChange={updated => updateSlot('sponsor', slot.slotId, updated)}
                  />
                )
              })}
            </div>

            {/* Layer NEXT */}
            <div className="be-card" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
              <h3 style={{ margin: '0 0 12px', textTransform: 'capitalize' }}>📣 Grafica "Next" — {nextEventLabel}</h3>
              {nextGraphic ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={nextGraphic.url} alt="Next" style={{ width: 72, height: 72, objectFit: 'contain', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, color: 'var(--text2)' }}>Grafica caricata</p>
                  </div>
                  <button onClick={() => nextFileInputRef.current?.click()} className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: 12 }}>Cambia</button>
                  <button onClick={() => setNextGraphic(null)} className="btn-no-anim" style={{ background: 'transparent', color: 'var(--red)', fontSize: 12, fontWeight: 700 }}>Rimuovi</button>
                  <input ref={nextFileInputRef} type="file" accept={ACCEPT_IMAGE_ATTR} style={{ display: 'none' }} onChange={e => handleNextFiles(e.target.files)} />
                </div>
              ) : (
                <div
                  onDragOver={e => { e.preventDefault(); setDragNext(true) }}
                  onDragLeave={() => setDragNext(false)}
                  onDrop={e => { e.preventDefault(); setDragNext(false); handleNextFiles(e.dataTransfer.files) }}
                  onClick={() => nextFileInputRef.current?.click()}
                  style={{
                    padding: '28px 16px', borderRadius: 12, textAlign: 'center', cursor: 'pointer',
                    background: dragNext ? 'rgba(79,195,247,0.14)' : 'rgba(79,195,247,0.06)',
                    border: `2px dashed ${dragNext ? 'var(--blue)' : 'rgba(79,195,247,0.35)'}`,
                  }}
                >
                  <input ref={nextFileInputRef} type="file" accept={ACCEPT_IMAGE_ATTR} style={{ display: 'none' }} onChange={e => handleNextFiles(e.target.files)} />
                  {uploadingNext ? (
                    <p style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>Caricamento in corso...</p>
                  ) : (
                    <>
                      <p style={{ fontSize: 32, marginBottom: 6 }}>📤</p>
                      <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--blue)' }}>Trascina qui la grafica "Next"</p>
                      <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>oppure tocca per selezionarlo</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Azioni */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => saveWeek('draft')} disabled={saving} className="btn btn-secondary">
                {saving ? 'Salvataggio...' : 'Salva bozza'}
              </button>
              <button onClick={() => saveWeek('published')} disabled={saving} className="btn btn-primary">
                {saving ? 'Salvataggio...' : 'Pubblica'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
