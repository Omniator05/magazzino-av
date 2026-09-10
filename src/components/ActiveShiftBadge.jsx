import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { isModuleEnabled } from '../utils/modules'
import { Clock } from './Icon'

// Promemoria persistente "hai un turno di lavoro in corso" — pensato per chi
// timbra l'inizio e poi si distrae altrove nell'app, dimenticando di
// timbrare la fine. Montato una volta sola in App.jsx (rami worker e admin,
// stesso schema di AbsenceNotifications/GhostBanner), così segue chi ha un
// turno aperto su qualunque pagina — TRANNE le liste di carico (dove
// sarebbe una distrazione durante il lavoro vero e proprio) e la pagina Ore
// di lavoro stessa (dove il timer è già ben visibile, ripeterlo sarebbe
// ridondante).
export default function ActiveShiftBadge() {
  const { user, team, teamId } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [openEntry, setOpenEntry] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!teamId || !user || !isModuleEnabled(team, 'workHours')) { setOpenEntry(null); return }
    const q = query(collection(db, 'timeEntries'), where('teamId', '==', teamId), where('workerId', '==', user.uid), orderBy('date', 'desc'))
    return onSnapshot(q, snap => {
      const open = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(e => !e.clockOut)
      setOpenEntry(open || null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, user?.uid, team?.modules?.workHours])

  useEffect(() => {
    if (!openEntry) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [!!openEntry])

  // "/events/:id" è la lista di carico sia per un worker (vera pagina di
  // scansione) sia per l'admin quando termina in "/scan" — stesso pattern
  // di onScannerRoute in App.jsx, esteso al caso worker che App.jsx non
  // copre (per il worker la pagina di scansione non ha suffisso "/scan").
  const onLoadListRoute = pathname.endsWith('/scan') || pathname.startsWith('/events/')
  const onWorkHoursRoute = pathname === '/work-hours'

  if (!openEntry || onLoadListRoute || onWorkHoursRoute) return null

  const elapsed = Math.max(0, now - new Date(openEntry.clockIn).getTime())
  const hh = String(Math.floor(elapsed / 3600000)).padStart(2, '0')
  const mm = String(Math.floor(elapsed / 60000) % 60).padStart(2, '0')
  const ss = String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')

  return (
    <>
      {/* Il centraggio (position:fixed + translateX(-50%)) vive sul
          contenitore, MAI sul bottone: btn-no-anim azzera `transform` in
          hover per spegnere il bounce globale — se quel transform fosse
          anche quello di centraggio, annullarlo faceva scattare il bottone
          a destra al passaggio del mouse, rendendolo impossibile da premere. */}
      <div className="active-shift-badge-wrap">
        <button
          onClick={() => navigate('/work-hours')}
          className="btn-no-anim active-shift-badge"
          aria-label="Turno di lavoro in corso — vai a Ore di lavoro"
        >
          <span className="active-shift-dot" />
          <Clock size={13} />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{hh}:{mm}:{ss}</span>
        </button>
      </div>
      <style>{`
        .active-shift-badge-wrap {
          position: fixed; top: calc(env(safe-area-inset-top) + 10px); left: 50%;
          transform: translateX(-50%); z-index: 150;
        }
        .active-shift-badge {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 14px 7px 11px; border-radius: 99px;
          background: var(--accent); color: #fff; font-size: 12.5px; font-weight: 700;
          box-shadow: 0 4px 16px rgba(216,56,63,0.4);
          border: none;
        }
        .active-shift-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #fff; flex-shrink: 0;
          animation: activeShiftPulse 1.8s ease-in-out infinite;
        }
        @keyframes activeShiftPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.75); }
        }
        @media (prefers-reduced-motion: reduce) {
          .active-shift-dot { animation: none; }
        }
      `}</style>
    </>
  )
}
