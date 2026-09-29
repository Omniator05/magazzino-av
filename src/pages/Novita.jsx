import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import BackHomeButton from '../components/BackHomeButton'
import { CHANGELOG } from '../data/changelog'
import { markWhatsNewSeen } from '../utils/whatsNew'
import { formatDate } from '../utils/formatDate'
import { Plus, Wrench, ChevronRight } from '../components/Icon'

// "Novità": gli aggiornamenti più importanti dell'app, dalla più recente.
// Il contenuto vive in src/data/changelog.js (una release nuova = una voce
// in cima). Raggiungibile da tutti i ruoli dal profilo.
//
// Redesign (chiesto dall'utente, "bruttissima"/"più interattiva"): una riga
// del tempo verticale al posto della semplice sequenza di card, release
// comprimibili (solo l'ultima aperta di default — con 2 release da 7+3 voci
// la vista piatta era già una parete di card) e chip per filtrare
// Novità/Correzioni. Struttura dati e markWhatsNewSeen invariati.
const KIND_STYLE = {
  new:  { Icon: Plus,   color: 'var(--accent)',  bg: 'rgba(230,57,70,0.10)' },
  fix:  { Icon: Wrench, color: 'var(--accent2)', bg: 'rgba(212,130,10,0.12)' },
}

export default function Novita() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'it'
  const [filter, setFilter] = useState('all')
  const [openReleases, setOpenReleases] = useState(() => new Set([CHANGELOG[0]?.id]))

  useEffect(() => { markWhatsNewSeen() }, [])

  const toggleRelease = (id) => {
    setOpenReleases(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Conteggi per i chip — sempre sul totale reale, non sul filtrato: un chip
  // non deve cambiare il proprio numero quando è lui stesso attivo.
  const counts = useMemo(() => {
    let all = 0, kNew = 0, kFix = 0
    for (const release of CHANGELOG) {
      for (const item of release.items) {
        all++
        if (item.kind === 'fix') kFix++; else kNew++
      }
    }
    return { all, new: kNew, fix: kFix }
  }, [])

  const releases = CHANGELOG
    .map(release => ({ ...release, items: release.items.filter(it => filter === 'all' || it.kind === filter) }))
    .filter(release => release.items.length > 0)

  return (
    <div className="page">
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <BackHomeButton to="/" />
        <h1 style={{ textAlign:'right' }}>{t('whatsNew.title')}</h1>
      </div>

      <p style={{ margin:'0 16px 16px', color:'var(--text2)', fontSize:14, lineHeight:1.5 }}>{t('whatsNew.subtitle')}</p>

      {/* Chip di filtro — scrollabili orizzontalmente, stesso pattern già
          usato in Inventory.jsx per i filtri rapidi. */}
      <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch', scrollbarWidth:'none', marginBottom:22 }}>
        <div style={{ display:'flex', gap:8, padding:'0 16px', width:'max-content', minWidth:'100%' }}>
          {[
            { key:'all', label:t('whatsNew.filterAll'), count:counts.all, color:'#fff', bg:'var(--text)' },
            { key:'new', label:t('whatsNew.kindNew'),    count:counts.new, color:'#fff', bg:'var(--accent)' },
            { key:'fix', label:t('whatsNew.kindFixPlural'), count:counts.fix, color:'#fff', bg:'var(--accent2)' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} style={{
              padding:'7px 14px', borderRadius:20, fontSize:13, fontWeight:700,
              background: filter === f.key ? f.bg : 'var(--card2)',
              color: filter === f.key ? f.color : 'var(--text2)',
              border: `1px solid ${filter === f.key ? f.bg : 'var(--border)'}`,
              display:'flex', alignItems:'center', gap:6,
            }}>
              {f.label}
              <span style={{
                background: filter === f.key ? 'rgba(255,255,255,0.22)' : 'var(--card3)',
                color: filter === f.key ? f.color : 'var(--text3)',
                borderRadius:10, padding:'1px 6px', fontSize:11, fontWeight:800,
              }}>{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {releases.length === 0 ? (
        <p style={{ margin:'0 16px', color:'var(--text3)', fontSize:14, textAlign:'center', padding:'24px 0' }}>
          {t('whatsNew.emptyFilter')}
        </p>
      ) : (
        <div style={{ position:'relative', margin:'0 16px 24px', paddingLeft:24 }}>
          {/* Riga del tempo — una sola linea continua dietro tutti i pallini
              di release, non una per sezione: evita di dover indovinare
              l'altezza di ciascun blocco per farla combaciare. */}
          <div style={{ position:'absolute', left:11, top:6, bottom:6, width:2, background:'var(--border)' }} />

          {releases.map((release, ri) => {
            const isOpen = openReleases.has(release.id)
            const isLatest = release.id === CHANGELOG[0]?.id
            return (
              <section key={release.id} style={{ position:'relative', marginBottom: ri === releases.length - 1 ? 0 : 22 }}>
                <div style={{
                  position:'absolute', left:-17, top:3, width:12, height:12, borderRadius:'50%',
                  background: isLatest ? 'var(--accent)' : 'var(--card)',
                  border: `2px solid ${isLatest ? 'var(--accent)' : 'var(--border2)'}`,
                  boxShadow: isLatest ? '0 0 0 4px rgba(230,57,70,0.14)' : 'none',
                }} />

                {/* Un div, non un <button> — evita gli stili hover/focus di
                    default del browser sul button nativo (segnalati come
                    "non vanno bene"), e con un solo onClick su tutta la riga
                    (titolo, conteggio, freccia) non c'è nessuna zona che
                    sfugga al tap, freccia inclusa. */}
                <div
                  onClick={() => toggleRelease(release.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRelease(release.id) } }}
                  role="button" tabIndex={0} aria-expanded={isOpen}
                  className="novita-release-toggle"
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, width:'100%', cursor:'pointer' }}
                >
                  <div style={{ minWidth:0 }}>
                    <p style={{ fontSize:12, fontWeight:800, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:4, display:'flex', alignItems:'center', gap:8 }}>
                      {formatDate(release.date + 'T12:00:00', { day:'numeric', month:'long', year:'numeric' }, i18n.language)}
                      {isLatest && <span style={{ background:'var(--accent)', color:'#fff', borderRadius:6, padding:'2px 7px', fontSize:10.5, letterSpacing:'0.4px' }}>{t('whatsNew.latest')}</span>}
                    </p>
                    <h2 style={{ fontSize:18, fontWeight:800, letterSpacing:'-0.3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace: isOpen ? 'normal' : 'nowrap' }}>
                      {release.title[lang]}
                    </h2>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, color:'var(--text3)' }}>
                    <span style={{ fontSize:12, fontWeight:700 }}>{release.items.length}</span>
                    <span style={{ display:'flex', transition:'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                      <ChevronRight size={16} />
                    </span>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:14 }}>
                    {release.items.map(item => {
                      const kind = KIND_STYLE[item.kind] || KIND_STYLE.new
                      const KindIcon = kind.Icon
                      return (
                        <div key={item.title.it} className="novita-item-card" style={{
                          background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px',
                        }}>
                          <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                            <div style={{
                              flexShrink:0, width:26, height:26, borderRadius:8, marginTop:1,
                              background:kind.bg, color:kind.color, display:'flex', alignItems:'center', justifyContent:'center',
                            }}>
                              <KindIcon size={13} />
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <h3 style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>{item.title[lang]}</h3>
                              <p style={{ fontSize:13.5, lineHeight:1.55, color:'var(--text2)' }}>{item.text[lang]}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      <style>{`
        .novita-item-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .novita-item-card:active { transform: scale(0.985); box-shadow: var(--shadow-sm); }
        @media (hover: hover) and (pointer: fine) {
          .novita-item-card:hover { border-color: var(--border2); box-shadow: var(--shadow-sm); }
        }
        .novita-release-toggle { -webkit-tap-highlight-color: transparent; }
        .novita-release-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 8px; }
      `}</style>
    </div>
  )
}
