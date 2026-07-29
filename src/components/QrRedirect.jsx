import { useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { APP_BASE_URL } from '../utils/generateCode'

// Pagina pubblica su cui atterra chi scansiona un QR di magazzino con la
// fotocamera normale del telefono invece che con lo scanner dell'app: non
// c'è nulla di utile da mostrargli qui, quindi lo rimandiamo al sito che la
// squadra ha impostato in AdminUsers.jsx ("Sito web"), o al sito dell'app se
// non l'ha fatto. Va eseguito PRIMA di qualunque routing basato su
// login/ruolo — vedi il controllo in cima a PrivateRoutes in App.jsx.
export default function QrRedirect({ teamId }) {
  useEffect(() => {
    let cancelled = false
    async function go() {
      let dest = APP_BASE_URL
      if (teamId) {
        try {
          const snap = await getDoc(doc(db, 'teams', teamId))
          if (snap.exists() && snap.data().websiteUrl) dest = snap.data().websiteUrl
        } catch { /* qualunque errore: resta il fallback sul sito dell'app */ }
      }
      if (!cancelled) window.location.replace(dest)
    }
    go()
    return () => { cancelled = true }
  }, [teamId])

  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#07090f' }}>
      <div style={{ width:32, height:32, border:'3px solid rgba(255,255,255,0.18)', borderTop:'3px solid #e63946', borderRadius:'50%', animation:'qrSpin 0.8s linear infinite' }} />
      <style>{`@keyframes qrSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
