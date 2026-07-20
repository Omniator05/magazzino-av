import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { auth, db } from '../firebase'
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword
} from 'firebase/auth'
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore'
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
  const coldStartHandled = useRef(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async firebaseUser => {
      // Mostra l'overlay "flap" solo alla PRIMA apertura dell'app (avvio a freddo
      // con sessione già salvata). Il login manuale lo attiva da login().
      const isColdStart = !coldStartHandled.current
      coldStartHandled.current = true

      if (firebaseUser) {
        setUser(firebaseUser)
        if (isColdStart) {
          setLoginName(firebaseUser.displayName?.split(' ')[0] || '')
          setShowOverlay(true)
        }
        const snap = await getDoc(doc(db, 'profiles', firebaseUser.uid))
        if (snap.exists()) {
          const profileData = snap.data()
          setProfile(profileData)
          if (isColdStart && profileData.name) setLoginName(profileData.name.split(' ')[0])

          if (profileData.teamId) {
            const teamSnap = await getDoc(doc(db, 'teams', profileData.teamId))
            setTeam(teamSnap.exists() ? { id: teamSnap.id, ...teamSnap.data() } : null)
          } else {
            setTeam(null)
          }

          // Applica pendingPassword se presente (impostata dall'admin)
          if (profileData.pendingPassword) {
            try {
              const decoded = atob(profileData.pendingPassword)
              await updatePassword(firebaseUser, decoded)
              await updateDoc(doc(db, 'profiles', firebaseUser.uid), {
                pendingPassword: null,
                pendingPasswordSetAt: null,
              })
            } catch(e) {
              // Ignora errori silenziosamente (es. token scaduto)
            }
          }
        } else {
          setProfile(null)
          setTeam(null)
        }
      } else {
        setUser(null)
        setProfile(null)
        setTeam(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  // Applica la lingua salvata nel profilo (default italiano se non impostata)
  useEffect(() => {
    i18n.changeLanguage(profile?.language || 'it')
  }, [profile?.language])

  const login = async (usernameOrEmail, password) => {
    const input = usernameOrEmail.trim()
    let result

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
    setShowOverlay(true)
    return result
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
      teamId: profile?.teamId || null,
      team,
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
