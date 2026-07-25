import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { auth, db } from '../firebase'
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword
} from 'firebase/auth'
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore'
import i18n from '../i18n'

const AuthContext = createContext(null)

// Converte username → email interna fittizia usata da Firebase Auth
export function usernameToEmail(username) {
  return `${username.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')}@theservice.internal`
}

export function AuthProvider({ children }) {
  const [user, setUser]             = useState(null)
  const [profile, setProfile]       = useState(null)
  const [team, setTeam]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [loginName, setLoginName]   = useState('')   // nome da mostrare nell'overlay
  const [showOverlay, setShowOverlay] = useState(false)
  // Signup in corso: tra la creazione dell'utente Auth e la scrittura del
  // profilo su Firestore c'è una finestra in cui "utente sì, profilo no" —
  // senza questo flag App mostrerebbe PendingApproval("unknown") per errore.
  const [signupInProgress, setSignupInProgress] = useState(false)
  // Rivelazione "cerchio che cresce" mostrata alla fine del percorso guidato
  // di benvenuto — vedi OnboardingReveal.jsx. Vive qui (non in Welcome.jsx)
  // perché il componente che la disegna deve restare montato ANCHE dopo che
  // Welcome viene smontato dal cambio di rotta verso la Dashboard.
  const [onboardingReveal, setOnboardingReveal] = useState(false)
  // Modalità "ghost" del super admin: gestisce un'altra azienda come se fosse
  // il suo team. Persistita in sessionStorage per sopravvivere ai refresh.
  const [ghostTeamId, setGhostTeamId] = useState(() => sessionStorage.getItem('__ghostTeam') || null)
  // Evita che l'auto-ingresso (sotto) riprenda subito dopo che il super admin
  // ha esplicitamente premuto "Esci" dalla modalità ghost per tornare a
  // scegliere — altrimenti con una sola azienda in tutto il sistema il
  // bottone "Esci" non porterebbe mai da nessuna parte.
  const hasExitedGhostRef = useRef(false)
  const coldStartHandled = useRef(false)

  useEffect(() => {
    let unsubProfile = null
    const unsubAuth = onAuthStateChanged(auth, firebaseUser => {
      // Mostra l'overlay "flap" solo alla PRIMA apertura dell'app (avvio a freddo
      // con sessione già salvata). Il login manuale lo attiva da login().
      const isColdStart = !coldStartHandled.current
      coldStartHandled.current = true

      if (unsubProfile) { unsubProfile(); unsubProfile = null }

      if (firebaseUser) {
        setUser(firebaseUser)
        if (isColdStart) {
          setLoginName(firebaseUser.displayName?.split(' ')[0] || '')
          setShowOverlay(true)
        }
        // Listener realtime sul profilo (non getDoc una tantum): durante il
        // signup il profilo viene scritto DOPO che l'auth è già cambiata —
        // col listener lo si aggancia appena appare invece di restare
        // bloccati su "profilo mancante". In più le modifiche al profilo
        // (es. approvazione da parte dell'admin) arrivano live.
        unsubProfile = onSnapshot(doc(db, 'profiles', firebaseUser.uid), snap => {
          if (snap.exists()) {
            const profileData = snap.data()
            setProfile(profileData)
            if (profileData.name) setLoginName(profileData.name.split(' ')[0])

            // Applica pendingPassword se presente (impostata dall'admin)
            if (profileData.pendingPassword) {
              const decoded = (() => { try { return atob(profileData.pendingPassword) } catch { return null } })()
              if (decoded) {
                updatePassword(firebaseUser, decoded)
                  .then(() => updateDoc(doc(db, 'profiles', firebaseUser.uid), {
                    pendingPassword: null,
                    pendingPasswordSetAt: null,
                  }))
                  .catch(() => {}) // Ignora errori silenziosamente (es. token scaduto)
              }
            }
          } else {
            setProfile(null)
          }
          setLoading(false)
        }, () => {
          setProfile(null)
          setLoading(false)
        })
      } else {
        setUser(null)
        setProfile(null)
        setTeam(null)
        setGhostTeamId(null)
        hasExitedGhostRef.current = false
        sessionStorage.removeItem('__ghostTeam')
        setLoading(false)
      }
    })
    return () => { if (unsubProfile) unsubProfile(); unsubAuth() }
  }, [])

  // Team id effettivo: quello della modalità ghost (solo per super admin)
  // oppure quello del proprio profilo.
  const effectiveTeamId = (profile?.superAdmin && ghostTeamId) ? ghostTeamId : (profile?.teamId || null)

  // Il team si carica (e ricarica) in base al teamId effettivo — così la
  // modalità ghost cambia azienda senza toccare il resto del flusso.
  useEffect(() => {
    if (!effectiveTeamId) { setTeam(null); return }
    let cancelled = false
    getDoc(doc(db, 'teams', effectiveTeamId))
      .then(snap => { if (!cancelled) setTeam(snap.exists() ? { id: snap.id, ...snap.data() } : null) })
      .catch(() => { if (!cancelled) setTeam(null) })
    return () => { cancelled = true }
  }, [effectiveTeamId])

  const enterGhostTeam = (id) => {
    if (!profile?.superAdmin) return
    sessionStorage.setItem('__ghostTeam', id)
    setGhostTeamId(id)
  }
  const exitGhostTeam = () => {
    hasExitedGhostRef.current = true
    sessionStorage.removeItem('__ghostTeam')
    setGhostTeamId(null)
  }

  // Un super admin non deve mai passare dalla propria dashboard personale
  // prima di raggiungere l'azienda che vuole gestire: se in tutto il sistema
  // esiste una sola azienda, ci si entra in automatico (nessuna scelta reale
  // da fare); con più aziende resta a null e SuperAdmin mostra la lista.
  useEffect(() => {
    if (!profile?.superAdmin || ghostTeamId || hasExitedGhostRef.current) return
    let cancelled = false
    getDocs(collection(db, 'teams')).then(snap => {
      if (cancelled || snap.size !== 1) return
      const onlyId = snap.docs[0].id
      sessionStorage.setItem('__ghostTeam', onlyId)
      setGhostTeamId(onlyId)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [profile?.superAdmin, ghostTeamId])

  // Applica la lingua salvata nel profilo (default italiano se non impostata)
  useEffect(() => {
    i18n.changeLanguage(profile?.language || 'it')
  }, [profile?.language])

  const login = async (usernameOrEmail, password) => {
    const input = usernameOrEmail.trim()
    let result

    // Overlay su PRIMA del sign-in: così copre la pagina di login col suo
    // fade-in, e quando l'auth va a buon fine la Dashboard monta già nascosta
    // dietro l'overlay opaco (niente flash della Dashboard). Se il login
    // fallisce lo togliamo nel catch.
    setShowOverlay(true)
    try {
      if (input.includes('@')) {
        // Input è un'email — può essere l'email reale (admin) o l'internalEmail
        try {
          result = await signInWithEmailAndPassword(auth, input, password)
        } catch(e) {
          // Prova cercando l'email reale salvata nel profilo (worker con email opzionale)
          const q = query(collection(db, 'profiles'), where('email', '==', input.toLowerCase()))
          const snap = await getDocs(q)
          if (!snap.empty) {
            const p = snap.docs[0].data()
            result = await signInWithEmailAndPassword(auth, p.internalEmail, password)
          } else {
            throw e
          }
        }
      } else {
        // Input è username — genera email interna e prova
        const emailGuess = usernameToEmail(input)
        try {
          result = await signInWithEmailAndPassword(auth, emailGuess, password)
        } catch(e) {
          // Fallback: cerca per username esatto in Firestore (gestisce edge case)
          const q = query(collection(db, 'profiles'), where('username', '==', input.toLowerCase()))
          const snap = await getDocs(q)
          if (!snap.empty) {
            const p = snap.docs[0].data()
            result = await signInWithEmailAndPassword(auth, p.internalEmail, password)
          } else {
            throw e
          }
        }
      }

      sessionStorage.setItem('__ap', password)
      // Ricava il nome da mostrare nell'overlay (prima parte del display name o username)
      const displayName = result.user.displayName || input.split('@')[0]
      setLoginName(displayName.split(' ')[0])
      return result
    } catch (e) {
      setShowOverlay(false)
      throw e
    }
  }

  const logout = () => {
    sessionStorage.removeItem('__ap')
    return signOut(auth)
  }

  const updateProfileData = async (data) => {
    if (!user) return
    await updateDoc(doc(db, 'profiles', user.uid), data)
    setProfile(prev => ({ ...prev, ...data }))
  }

  // Il team non ha un listener realtime (solo getDoc al login) — dopo una
  // scrittura (es. nuovo logo) aggiorna lo stato locale così si vede subito.
  const updateTeamData = async (data) => {
    if (!team?.id) return
    await updateDoc(doc(db, 'teams', team.id), data)
    setTeam(prev => ({ ...prev, ...data }))
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading, login, logout, updateProfileData, updateTeamData,
      teamId: effectiveTeamId,
      team,
      ghostTeamId: profile?.superAdmin ? ghostTeamId : null,
      enterGhostTeam, exitGhostTeam,
      signupInProgress, setSignupInProgress,
      onboardingReveal, setOnboardingReveal,
      isApproved: profile?.approved !== false,
      isActive:   profile?.active !== false,
      isAdmin:  profile?.role === 'admin',
      isWorker: profile?.role === 'worker',
      isBrasserieOrganizer: profile?.role === 'organizzatore-brasserie',
      showOverlay, setShowOverlay, loginName,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
