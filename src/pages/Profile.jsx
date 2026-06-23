import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { auth } from '../firebase'
import { reauthenticateWithCredential, EmailAuthProvider, updatePassword as fbUpdatePassword } from 'firebase/auth'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'

const AVATARS = [
  // Espressioni — le più usate come avatar
  '😊','😎','😄','🤓','😏','🤠','🥳','😤',
  // Energia / personalità
  '💪','🔥','⚡','⭐','🏆','🎯','🚀','🌟',
  // Lavoro & settore AV
  '👷','🔧','🎚️','🔊','📦','🚛','🛠️','🎛️',
  // Due un po' giocosi + classici da avatar
  '🤖','🦄','🦁','🐻','🦊','☕','🎸','🎵',
]

const IconPencil = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
  </svg>
)

const IconCheck = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

export default function Profile() {
  const navigate = useNavigate()
  const { profile, user, updateProfileData } = useAuth()

  const [name, setName]           = useState(profile?.name || '')
  const [savingName, setSavingName] = useState(false)
  const [nameOk, setNameOk]       = useState(false)

  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const emojiDrag = useModalDrag(() => setShowEmojiPicker(false))
  useModalScrollLock(showEmojiPicker)

  const [currentPwd,  setCurrentPwd]  = useState('')
  const [newPwd,      setNewPwd]      = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [savingPwd,   setSavingPwd]   = useState(false)
  const [pwdError,    setPwdError]    = useState('')
  const [pwdOk,       setPwdOk]       = useState(false)

  const avatar  = profile?.avatar || null
  const initial = (profile?.name || profile?.username || '?').charAt(0).toUpperCase()
  const role    = profile?.role === 'admin' ? 'Amministratore' : 'Magazziniere'

  const saveName = async () => {
    if (!name.trim() || name.trim() === profile?.name) return
    setSavingName(true)
    try {
      await updateProfileData({ name: name.trim() })
      setNameOk(true)
      setTimeout(() => setNameOk(false), 2500)
    } finally { setSavingName(false) }
  }

  const selectEmoji = async (emoji) => {
    await updateProfileData({ avatar: emoji })
    setShowEmojiPicker(false)
  }

  const removeEmoji = async () => {
    await updateProfileData({ avatar: null })
    setShowEmojiPicker(false)
  }

  const changePassword = async () => {
    setPwdError('')
    if (!currentPwd)       { setPwdError('Inserisci la password attuale'); return }
    if (newPwd.length < 6) { setPwdError('La nuova password deve avere almeno 6 caratteri'); return }
    if (newPwd !== confirmPwd) { setPwdError('Le password non coincidono'); return }

    setSavingPwd(true)
    try {
      const email = profile?.internalEmail ||
        `${(profile?.username || '').toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')}@theservice.internal`
      const credential = EmailAuthProvider.credential(email, currentPwd)
      await reauthenticateWithCredential(user, credential)
      await fbUpdatePassword(user, newPwd)
      sessionStorage.setItem('__ap', newPwd)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      setPwdOk(true)
      setTimeout(() => setPwdOk(false), 3000)
    } catch(e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setPwdError('Password attuale non corretta')
      } else {
        setPwdError('Errore: riprova tra qualche istante')
      }
    } finally { setSavingPwd(false) }
  }

  return (
    <div className="page" style={{ paddingBottom: 110 }}>

      {/* Header */}
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'var(--card2)', color: 'var(--text2)', borderRadius: 10, padding: '8px 14px', fontSize: 14 }}>← Indietro</button>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Profilo</h1>
      </div>

      {/* Avatar centrato */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0 28px' }}>
        <button
          onClick={() => setShowEmojiPicker(true)}
          style={{
            position: 'relative', width: 96, height: 96, borderRadius: 28,
            background: 'linear-gradient(135deg,#3b4a66 0%,#222c42 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: avatar ? 50 : 40, color: 'white', fontWeight: 800,
            boxShadow: '0 8px 28px rgba(34,44,66,0.30)', border: 'none', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {avatar || initial}
          <span style={{
            position: 'absolute', bottom: -3, right: -3,
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--accent)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2.5px solid var(--bg)',
            boxShadow: '0 2px 8px rgba(230,57,70,0.4)',
          }}>
            <IconPencil />
          </span>
        </button>

        <p style={{ fontSize: 22, fontWeight: 800, marginTop: 16, color: 'var(--text)', letterSpacing: '-0.3px' }}>
          {profile?.name || profile?.username}
        </p>
        <span style={{
          marginTop: 5,
          background: profile?.role === 'admin' ? 'rgba(37,99,235,0.10)' : 'rgba(5,150,105,0.10)',
          color:      profile?.role === 'admin' ? '#2563eb' : '#059669',
          border:    `1px solid ${profile?.role === 'admin' ? 'rgba(37,99,235,0.22)' : 'rgba(5,150,105,0.22)'}`,
          borderRadius: 20, padding: '3px 14px', fontSize: 12, fontWeight: 700,
        }}>
          {role}
        </span>
      </div>

      {/* Sezione: Informazioni */}
      <Section label="Informazioni">
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Nome visualizzato</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Il tuo nome"
            onKeyDown={e => e.key === 'Enter' && saveName()}
          />
        </div>
        <button
          onClick={saveName}
          disabled={savingName || !name.trim() || name.trim() === profile?.name}
          className="btn btn-primary btn-full"
          style={{ opacity: (savingName || !name.trim() || name.trim() === profile?.name) ? 0.45 : 1 }}
        >
          {nameOk
            ? <><IconCheck /> Salvato!</>
            : savingName ? 'Salvataggio...' : 'Salva nome'}
        </button>
      </Section>

      {/* Sezione: Sicurezza */}
      <Section label="Sicurezza">
        <div className="form-group">
          <label>Password attuale</label>
          <input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="form-group">
          <label>Nuova password</label>
          <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Minimo 6 caratteri" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Conferma nuova password</label>
          <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Ripeti la password" />
        </div>
        {pwdError && (
          <p style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600, marginTop: 10, lineHeight: 1.4 }}>{pwdError}</p>
        )}
        <button
          onClick={changePassword}
          disabled={savingPwd || !currentPwd || !newPwd || !confirmPwd}
          className="btn btn-primary btn-full"
          style={{ marginTop: 14, opacity: (savingPwd || !currentPwd || !newPwd || !confirmPwd) ? 0.45 : 1 }}
        >
          {pwdOk
            ? <><IconCheck /> Password cambiata!</>
            : savingPwd ? 'Cambio in corso...' : 'Cambia password'}
        </button>
      </Section>

      {/* Emoji picker */}
      {showEmojiPicker && (
        <div className={`modal-overlay${emojiDrag.closing ? ' closing' : ''}`} onClick={emojiDrag.onOverlayClick}>
          <div className={`modal${emojiDrag.jiggling ? ' modal-jiggle' : ''}${emojiDrag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...emojiDrag.props}>
            <button className="close-btn" onClick={emojiDrag.close}>✕</button>
            <h2>Scegli avatar</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, marginBottom: avatar ? 14 : 0 }}>
              {AVATARS.map(em => (
                <button
                  key={em}
                  onClick={() => selectEmoji(em)}
                  style={{
                    fontSize: 26, padding: '6px 0', borderRadius: 10, cursor: 'pointer',
                    background: avatar === em ? 'rgba(230,57,70,0.10)' : 'var(--card2)',
                    border: avatar === em ? '2px solid var(--accent)' : '2px solid transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
            {avatar && (
              <button
                onClick={removeEmoji}
                style={{ width: '100%', marginTop: 4, padding: '10px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 13, fontWeight: 600 }}
              >
                Rimuovi — usa iniziale del nome
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ padding: '0 16px 20px' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>{label}</p>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px' }}>
        {children}
      </div>
    </div>
  )
}
