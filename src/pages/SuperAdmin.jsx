import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { db, auth } from '../firebase'
import { collection, getDocs, query, where, getCountFromServer } from 'firebase/firestore'
import { reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { User, Calendar, Box, Check, Trash } from '../components/Icon'
import LogoutButton from '../components/LogoutButton'
import { formatDate } from '../utils/formatDate'
import { deleteTeamCascade } from '../utils/superAdminDelete'

const ROLE_BADGE = {
  'admin':                  { bg:'rgba(37,99,235,0.10)',  color:'#2563eb', border:'rgba(37,99,235,0.22)' },
  'worker':                 { bg:'rgba(5,150,105,0.10)',  color:'#059669', border:'rgba(5,150,105,0.22)' },
  'organizzatore-brasserie':{ bg:'rgba(147,51,234,0.10)', color:'#9333ea', border:'rgba(147,51,234,0.22)' },
  'organizzatore-evento':   { bg:'rgba(147,51,234,0.10)', color:'#9333ea', border:'rgba(147,51,234,0.22)' },
}

// Pannello "amministratore ghost": visibile SOLO ai profili con superAdmin
// (flag impostabile esclusivamente da console/script, mai dall'app — vedi
// firestore.rules). Panoramica di tutte le aziende + possibilità di "entrare"
// in una squadra (stesso accesso di un suo admin) per sistemare impostazioni
// o dati in caso di problemi — vedi enterGhostTeam in AuthContext.
export default function SuperAdmin() {
  const { t, i18n } = useTranslation()
  const { profile, ghostTeamId, enterGhostTeam } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const isSuper = profile?.superAdmin === true

  const [teams, setTeams]       = useState([])
  const [profiles, setProfiles] = useState([])
  const [counts, setCounts]     = useState({})
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [toast, setToast]       = useState('')
  const [search, setSearch]     = useState('')

  // Eliminazione azienda: conferma standard + reinserimento password
  // dell'account super admin, così non si cancella nulla per un tap di troppo.
  const [deleteTarget, setDeleteTarget]   = useState(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError]     = useState('')
  const [deleting, setDeleting]           = useState(false)
  useModalScrollLock(!!deleteTarget)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // Se si arriva qui già "dentro" un'azienda (es. dal bottoncino in Dashboard,
  // per sfogliare/cambiare), NON si deve rimbalzare subito indietro — si vuole
  // proprio vedere la lista. L'unico caso da intercettare è quando ghostTeamId
  // CAMBIA mentre si è già su questa pagina: l'auto-ingresso di AuthContext
  // (una sola azienda nel sistema, subito dopo il login) che risolve dopo il
  // mount. Il click su "Entra" naviga già da sé, vedi handleEnter.
  const initialGhostTeamId = useRef(ghostTeamId)
  useEffect(() => {
    if (ghostTeamId && ghostTeamId !== initialGhostTeamId.current) {
      navigate('/', { replace: true })
    }
  }, [ghostTeamId, navigate])

  useEffect(() => {
    if (profile && !isSuper) navigate('/', { replace: true })
  }, [profile, isSuper, navigate])

  const handleEnter = async (team) => {
    const ok = await confirm({
      title: t('superAdmin.enterTitle', { name: team.name }),
      message: t('superAdmin.enterMessage'),
      confirmLabel: t('superAdmin.enterConfirm'),
    })
    if (!ok) return
    enterGhostTeam(team.id)
    navigate('/', { replace: true })
  }

  const closeDeleteModal = () => {
    setDeleteTarget(null)
    setDeletePassword('')
    setDeleteError('')
  }
  const deleteDrag = useModalDrag(closeDeleteModal, undefined, undefined, !!deleteTarget)

  const handleDeleteClick = async (team) => {
    const ok = await confirm({
      title: t('superAdmin.deleteConfirmTitle', { name: team.name }),
      message: t('superAdmin.deleteConfirmMessage'),
      confirmLabel: t('superAdmin.deleteConfirmLabel'),
      danger: true,
    })
    if (!ok) return
    setDeleteError('')
    setDeletePassword('')
    setDeleteTarget(team)
  }

  const confirmDelete = async () => {
    if (!deletePassword) { setDeleteError(t('superAdmin.errorPasswordRequired')); return }
    setDeleting(true); setDeleteError('')
    try {
      const cred = EmailAuthProvider.credential(auth.currentUser.email, deletePassword)
      await reauthenticateWithCredential(auth.currentUser, cred)
      await deleteTeamCascade(deleteTarget.id)
      setTeams(prev => prev.filter(tm => tm.id !== deleteTarget.id))
      showToast(t('superAdmin.deletedToast', { name: deleteTarget.name }))
      closeDeleteModal()
    } catch (e) {
      setDeleteError(
        (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential')
          ? t('superAdmin.errorWrongPassword')
          : t('superAdmin.errorDeleteGeneric')
      )
    } finally { setDeleting(false) }
  }

  useEffect(() => {
    if (!isSuper) return
    ;(async () => {
      try {
        const [teamsSnap, profilesSnap] = await Promise.all([
          getDocs(collection(db, 'teams')),
          getDocs(collection(db, 'profiles')),
        ])
        const teamList = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        setTeams(teamList)
        setProfiles(profilesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
        // Conteggi aggregati lato server: niente download dei documenti
        const entries = await Promise.all(teamList.map(async tm => {
          const [ev, it] = await Promise.all([
            getCountFromServer(query(collection(db, 'events'), where('teamId', '==', tm.id))),
            getCountFromServer(query(collection(db, 'items'),  where('teamId', '==', tm.id))),
          ])
          return [tm.id, { events: ev.data().count, items: it.data().count }]
        }))
        setCounts(Object.fromEntries(entries))
      } catch (e) {
        console.error('SuperAdmin load error:', e)
      } finally { setLoading(false) }
    })()
  }, [isSuper])

  if (!isSuper) return null

  const membersOf = (teamId) => profiles.filter(p => p.teamId === teamId)
  const filteredTeams = search.trim()
    ? teams.filter(tm => tm.name?.toLowerCase().includes(search.trim().toLowerCase()))
    : teams

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
          <div>
            <h1>{t('superAdmin.title')}</h1>
            <p>{t('superAdmin.subtitle', { count: teams.length })}</p>
          </div>
          <LogoutButton name={profile?.name} style={{
            flexShrink:0, background:'var(--card2)', border:'1px solid var(--border)',
            color:'var(--text)', borderRadius:12, padding:'9px 16px', fontSize:13, fontWeight:700, cursor:'pointer',
          }} />
        </div>
      </div>

      {teams.length > 1 && (
        <div className="search-bar" style={{ position:'relative' }}>
          <svg className="search-icon" viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('superAdmin.searchPlaceholder')} />
        </div>
      )}

      <div style={{ padding:'16px' }}>
        {loading ? (
          <p style={{ textAlign:'center', color:'var(--text2)', padding:'40px 0' }}>{t('superAdmin.loading')}</p>
        ) : filteredTeams.length === 0 ? (
          <div className="empty-state">
            <h3>{search ? t('superAdmin.noResults') : t('superAdmin.noTeams')}</h3>
          </div>
        ) : (
          filteredTeams.map(team => {
            const members  = membersOf(team.id)
            const pending  = members.filter(m => m.approved === false).length
            const isOpen   = expanded === team.id
            const created  = team.createdAt?.toDate?.()
            return (
              <div key={team.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, marginBottom:12, overflow:'hidden' }}>
                {/* Riga principale — tap per espandere */}
                <div onClick={() => setExpanded(isOpen ? null : team.id)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', cursor:'pointer' }}>
                  <div style={{ width:48, height:48, borderRadius:12, flexShrink:0, overflow:'hidden', background:'var(--card2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <img src={team.logoUrl || '/logo-default.svg'} alt="" style={{ width: team.logoUrl ? '100%' : '70%', height: team.logoUrl ? '100%' : '70%', objectFit:'contain', opacity: team.logoUrl ? 1 : 0.5 }} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:800, fontSize:15.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{team.name}</p>
                    <p style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>
                      {created ? t('superAdmin.createdOn', { date: formatDate(created, { day:'numeric', month:'short', year:'numeric' }, i18n.language) }) : t('superAdmin.noCreatedDate')}
                    </p>
                  </div>
                  {pending > 0 && (
                    <span style={{ background:'rgba(245,166,35,0.12)', color:'var(--accent2)', border:'1px solid rgba(245,166,35,0.35)', borderRadius:10, padding:'3px 10px', fontSize:11.5, fontWeight:700, flexShrink:0 }}>
                      {t('superAdmin.pendingBadge', { count: pending })}
                    </span>
                  )}
                  <span style={{ color:'var(--text3)', transform: isOpen ? 'rotate(180deg)' : 'none', transition:'transform 0.25s ease', flexShrink:0, display:'flex' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </span>
                </div>

                {/* Statistiche + azione */}
                <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:8, padding:'0 16px 14px' }}>
                  <Stat icon={<User size={13} />}     label={t('superAdmin.members', { count: members.length })} />
                  <Stat icon={<Calendar size={13} />} label={t('superAdmin.events',  { count: counts[team.id]?.events ?? '…' })} />
                  <Stat icon={<Box size={13} />}      label={t('superAdmin.items',   { count: counts[team.id]?.items ?? '…' })} />
                  <button onClick={() => handleDeleteClick(team)} aria-label={t('superAdmin.deleteButton')} className="btn-no-anim" style={{
                    marginLeft:'auto', flexShrink:0, width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center',
                    background:'var(--card2)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:9,
                  }}>
                    <Trash size={13} />
                  </button>
                  <button onClick={() => handleEnter(team)} className="btn-no-anim" style={{
                    flexShrink:0, background:'rgba(230,57,70,0.10)', color:'var(--accent)',
                    border:'1px solid rgba(230,57,70,0.25)', borderRadius:9, padding:'6px 12px',
                    fontSize:12, fontWeight:700,
                  }}>
                    {t('superAdmin.enterButton')}
                  </button>
                </div>

                {/* Dettaglio membri */}
                {isOpen && (
                  <div style={{ borderTop:'1px solid var(--border)', padding:'6px 16px 12px' }}>
                    {members.length === 0 ? (
                      <p style={{ color:'var(--text2)', fontSize:13, padding:'10px 0' }}>{t('superAdmin.noMembers')}</p>
                    ) : (
                      members.map(m => {
                        const rb = ROLE_BADGE[m.role] || ROLE_BADGE.worker
                        return (
                          <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                            <span style={{ flex:1, minWidth:0, fontSize:13.5, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {m.name || m.username}
                              {m.superAdmin && ' ✦'}
                            </span>
                            {m.approved === false && (
                              <span style={{ color:'var(--accent2)', fontSize:11, fontWeight:700, flexShrink:0 }}>{t('superAdmin.statusPending')}</span>
                            )}
                            {m.active === false && (
                              <span style={{ color:'var(--red)', fontSize:11, fontWeight:700, flexShrink:0 }}>{t('superAdmin.statusInactive')}</span>
                            )}
                            <span style={{ background:rb.bg, color:rb.color, border:`1px solid ${rb.border}`, borderRadius:8, padding:'2px 9px', fontSize:11, fontWeight:700, flexShrink:0 }}>
                              {m.role}
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {toast && (
        <div style={{ position:'fixed', bottom:'calc(env(safe-area-inset-bottom) + 20px)', left:16, right:16, background:'#111827', color:'white', padding:'12px 16px', borderRadius:12, fontSize:13.5, fontWeight:600, textAlign:'center', boxShadow:'0 8px 24px rgba(0,0,0,0.3)', zIndex:300 }}>
          {toast}
        </div>
      )}

      {/* Modal eliminazione — richiede la password del super admin */}
      {deleteTarget && (
        <div className={`modal-overlay${deleteDrag.closing ? ' closing' : ''}`} onClick={deleteDrag.onOverlayClick}>
          <div className={`modal${deleteDrag.jiggling ? ' modal-jiggle' : ''}${deleteDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...deleteDrag.props}>
            <button className="close-btn" onClick={deleteDrag.close}>✕</button>
            <h2>{t('superAdmin.deletePasswordTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>
              {t('superAdmin.deletePasswordDesc', { name: deleteTarget.name })}
            </p>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>{t('superAdmin.yourPasswordLabel')}</label>
              <input
                type="password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmDelete()}
                placeholder="••••••••"
                autoFocus
              />
            </div>
            {deleteError && (
              <p style={{ color:'var(--red)', fontSize:13, fontWeight:600, marginTop:10, lineHeight:1.4 }}>{deleteError}</p>
            )}
            <button
              onClick={confirmDelete}
              disabled={deleting || !deletePassword}
              className="btn btn-full"
              style={{ marginTop:16, background:'var(--red)', color:'white', opacity:(deleting || !deletePassword) ? 0.5 : 1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}
            >
              <Trash size={15} /> {deleting ? t('superAdmin.deleting') : t('superAdmin.deletePermanently')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:'var(--card2)', border:'1px solid var(--border)', borderRadius:9, padding:'4px 10px', fontSize:12, fontWeight:600, color:'var(--text2)' }}>
      {icon} {label}
    </span>
  )
}
