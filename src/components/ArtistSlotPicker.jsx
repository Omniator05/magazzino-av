import { useState, useRef } from 'react'
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { uploadArtistLogo, ALLOWED_IMAGE_TYPES, ACCEPT_IMAGE_ATTR } from '../utils/brasserieStorage'
import { Trash } from './Icon'

function deriveNameFromFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '')
  const cleaned = base.replace(/[_-]+/g, ' ').trim()
  return cleaned.replace(/\b\w/g, c => c.toUpperCase()) || 'Nuovo artista'
}

/**
 * Riga di uno slot (layer ARTISTI / SPONSOR): cerca un artista già in libreria
 * (autocomplete su `artists`, con suggerimento dei più usati a campo vuoto)
 * oppure permette di caricarne uno nuovo (drag & drop), chiedendo sempre un nome
 * prima di salvarlo (utile quando il file è solo uno screenshot tipo "IMG_1234").
 */
export default function ArtistSlotPicker({ slot, label, artists, onChange, onRemove }) {
  const { user, teamId } = useAuth()
  const confirm = useConfirm()
  const [query, setQuery] = useState(slot.artistName || '')
  const [editing, setEditing] = useState(!slot.artistId)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [pendingFile, setPendingFile] = useState(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState(null)
  const [pendingName, setPendingName] = useState('')
  const [focused, setFocused] = useState(false)
  const fileInputRef = useRef(null)

  const trimmed = query.trim()
  const filtered = trimmed
    ? artists.filter(a => a.nameLower.includes(trimmed.toLowerCase())).slice(0, 6)
    : []
  const mostUsed = !trimmed
    ? [...artists].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)).slice(0, 5)
    : []
  const exactMatch = artists.find(a => a.nameLower === trimmed.toLowerCase())

  const pickArtist = (artist) => {
    onChange({ ...slot, artistId: artist.id, artistName: artist.name, logoUrl: artist.logoUrl })
    setQuery(artist.name)
    setEditing(false)
  }

  const clearSlot = () => {
    onChange({ ...slot, artistId: null, artistName: '', logoUrl: null })
    setQuery('')
    setEditing(true)
  }

  const stageFile = (files) => {
    const file = files?.[0]
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { setError('Formato non supportato. Usa PNG, JPEG, WEBP o GIF.'); return }
    setError('')
    if (trimmed) {
      // Nome già scritto in ricerca: procedi subito con il caricamento
      uploadAndSave(file, trimmed)
    } else {
      // Nessun nome: chiedi conferma prima di caricare (evita nomi tipo "IMG_1234")
      setPendingFile(file)
      setPendingPreviewUrl(URL.createObjectURL(file))
      setPendingName(deriveNameFromFilename(file.name))
    }
  }

  const uploadAndSave = async (file, name) => {
    setUploading(true); setError('')
    try {
      const { url, path } = await uploadArtistLogo(file, name)
      const ref = await addDoc(collection(db, 'brasserieArtists'), {
        name,
        nameLower: name.toLowerCase(),
        logoUrl: url,
        storagePath: path,
        organizerId: user.uid,
        teamId,
        usageCount: 0,
        lastUsedAt: null,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      })
      onChange({ ...slot, artistId: ref.id, artistName: name, logoUrl: url })
      setQuery(name)
      setEditing(false)
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
      setPendingFile(null)
      setPendingPreviewUrl(null)
      setPendingName('')
    } catch (e) {
      setError('Errore durante il caricamento. Riprova.')
    } finally {
      setUploading(false)
    }
  }

  const confirmPendingUpload = () => {
    if (!pendingName.trim() || !pendingFile) return
    uploadAndSave(pendingFile, pendingName.trim())
  }

  const cancelPending = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    setPendingFile(null)
    setPendingPreviewUrl(null)
    setPendingName('')
  }

  // Rimuove un artista dalla libreria (es. caricato per errore): NON elimina il file
  // dallo Storage, perché le settimane già salvate puntano allo stesso URL (non una
  // copia) — cancellarlo romperebbe le grafiche di eventi passati o già pubblicati
  const removeArtist = async (artist, e) => {
    e.stopPropagation()
    if (!(await confirm({ title: 'Elimina artista', message: `Eliminare "${artist.name}" dalla libreria? Non comparirà più nei suggerimenti o nella ricerca.`, confirmLabel: 'Elimina', danger: true }))) return
    await deleteDoc(doc(db, 'brasserieArtists', artist.id))
  }

  return (
    <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: editing ? 8 : 0 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</span>
        {onRemove && (
          <button onClick={onRemove} className="btn-no-anim" style={{ background:'transparent', color:'var(--red)', fontSize:12, fontWeight:700 }}>Rimuovi artista</button>
        )}
      </div>

      {!editing && slot.artistId ? (
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {slot.logoUrl && (
            <img src={slot.logoUrl} alt={slot.artistName} style={{ width:44, height:44, objectFit:'contain', background:'#fff', borderRadius:8, border:'1px solid var(--border)' }} />
          )}
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontWeight:700, fontSize:15, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{slot.artistName}</p>
          </div>
          <button onClick={() => setEditing(true)} className="btn btn-secondary" style={{ padding:'7px 12px', fontSize:12, flexShrink:0 }}>Cambia</button>
          <button onClick={clearSlot} className="btn-no-anim" style={{ background:'transparent', color:'var(--red)', fontSize:12, fontWeight:700, flexShrink:0 }}>Svuota</button>
        </div>
      ) : pendingFile ? (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
            <img src={pendingPreviewUrl} alt="" style={{ width:44, height:44, objectFit:'contain', background:'#fff', borderRadius:8, border:'1px solid var(--border)', flexShrink:0 }} />
            <p style={{ fontSize:12, color:'var(--text2)', lineHeight:1.4 }}>Dai un nome a questo artista prima di salvarlo, così lo ritrovi facilmente in futuro.</p>
          </div>
          <input
            value={pendingName}
            onChange={e => setPendingName(e.target.value)}
            placeholder="Nome artista..."
            autoFocus
            style={{ marginBottom:8 }}
            onKeyDown={e => { if (e.key === 'Enter') confirmPendingUpload() }}
          />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={cancelPending} className="btn btn-secondary" style={{ flex:1 }} disabled={uploading}>Annulla</button>
            <button onClick={confirmPendingUpload} className="btn btn-primary" style={{ flex:1 }} disabled={uploading || !pendingName.trim()}>
              {uploading ? 'Caricamento...' : 'Salva'}
            </button>
          </div>
          {error && <p style={{ fontSize:12, color:'var(--red)', marginTop:6 }}>{error}</p>}
        </div>
      ) : (
        <div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca artista esistente o scrivi un nuovo nome..."
            style={{ marginBottom: 8 }}
            autoFocus={editing && !!slot.artistId}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
          />

          {trimmed && filtered.length > 0 && (
            <div style={{ marginBottom:8 }}>
              {filtered.map(a => (
                <div key={a.id} style={{ display:'flex', gap:6, marginBottom:5 }}>
                  <button
                    onClick={() => pickArtist(a)}
                    style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:10, background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', textAlign:'left' }}
                  >
                    <img src={a.logoUrl} alt={a.name} style={{ width:28, height:28, objectFit:'contain', background:'#fff', borderRadius:5, flexShrink:0 }} />
                    <span style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.name}</span>
                  </button>
                  <button
                    onClick={e => removeArtist(a, e)}
                    className="btn-no-anim"
                    style={{ flexShrink:0, width:36, background:'rgba(255,82,82,0.08)', border:'1px solid rgba(255,82,82,0.2)', color:'var(--red)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!trimmed && focused && mostUsed.length > 0 && (
            <div style={{ marginBottom:8 }}>
              <p style={{ fontSize:10, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }}>Più usati</p>
              {mostUsed.map(a => (
                <div key={a.id} style={{ display:'flex', gap:6, marginBottom:5 }}>
                  <button
                    onClick={() => pickArtist(a)}
                    style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:10, background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', textAlign:'left' }}
                  >
                    <img src={a.logoUrl} alt={a.name} style={{ width:28, height:28, objectFit:'contain', background:'#fff', borderRadius:5, flexShrink:0 }} />
                    <span style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.name}</span>
                  </button>
                  <button
                    onClick={e => removeArtist(a, e)}
                    className="btn-no-anim"
                    style={{ flexShrink:0, width:36, background:'rgba(255,82,82,0.08)', border:'1px solid rgba(255,82,82,0.2)', color:'var(--red)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!exactMatch && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); stageFile(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding:'16px 12px', borderRadius:10, textAlign:'center', cursor:'pointer',
                background: dragOver ? 'rgba(79,195,247,0.14)' : 'rgba(79,195,247,0.06)',
                border: `2px dashed ${dragOver ? 'var(--blue)' : 'rgba(79,195,247,0.35)'}`,
              }}
            >
              <input ref={fileInputRef} type="file" accept={ACCEPT_IMAGE_ATTR} style={{ display:'none' }}
                onChange={e => stageFile(e.target.files)} />
              {trimmed ? (
                <>
                  <p style={{ fontSize:13, fontWeight:700, color:'var(--blue)' }}>Nessun artista trovato per "{trimmed}"</p>
                  <p style={{ fontSize:12, color:'var(--text2)', marginTop:3 }}>Trascina qui il logo, o tocca per selezionarlo</p>
                </>
              ) : (
                <>
                  <p style={{ fontSize:32, marginBottom:6 }}>📤</p>
                  <p style={{ fontSize:13, fontWeight:700, color:'var(--blue)' }}>Trascina qui il logo di un nuovo artista</p>
                  <p style={{ fontSize:12, color:'var(--text2)', marginTop:3 }}>oppure tocca per selezionarlo</p>
                </>
              )}
            </div>
          )}

          {error && <p style={{ fontSize:12, color:'var(--red)', marginTop:6 }}>{error}</p>}
        </div>
      )}
    </div>
  )
}
