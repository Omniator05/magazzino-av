import { useIsMobile } from '../hooks/useIsMobile'

/**
 * Skeleton loaders con effetto shimmer (keyframe `shimmer` definito in index.css).
 * Bar = blocco generico; EventCardSkeleton = placeholder di una card evento.
 */
export function Bar({ w = '100%', h = 12, r = 7, style }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, var(--c-fill) 25%, var(--c-fill2) 50%, var(--c-fill) 75%)',
      backgroundSize: '200% auto',
      animation: 'shimmer 1.4s linear infinite',
      ...style,
    }} />
  )
}

export function EventCardSkeleton() {
  return (
    <div style={{
      margin: '0 16px 10px', background: 'var(--dash-card)',
      border: '1.5px solid var(--dash-card-border)', borderRadius: 20,
      display: 'flex', alignItems: 'center', padding: '10px 12px 10px 10px', gap: 12,
    }}>
      <Bar w={52} h={52} r={13} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Bar w="55%" h={15} style={{ marginBottom: 9 }} />
        <Bar w="34%" h={11} />
      </div>
    </div>
  )
}

export function EventListSkeleton({ count = 6 }) {
  return (
    <div style={{ paddingTop: 2 }}>
      {/* etichetta sezione finta */}
      <Bar w={90} h={11} r={6} style={{ margin: '6px 16px 14px' }} />
      {Array.from({ length: count }).map((_, i) => <EventCardSkeleton key={i} />)}
    </div>
  )
}

// ── Scheletri di pagina (dashboard, eventi, magazzino) ──────────────────────────────────────────────────────────
// Mostrati mentre il codice della pagina o i suoi dati arrivano, così la pagina non compare vuota e poi "salta".
const skCard = { background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 16 }

// Colonna principale della dashboard: etichetta di sezione + tre card evento.
export function DashEventsSkeleton() {
  return (
    <div aria-hidden="true">
      <Bar w={110} h={11} r={6} style={{ margin: '0 0 14px' }} />
      {[0, 1, 2].map(i => (
        <div key={i} style={{ ...skCard, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', marginBottom: 12 }}>
          <Bar w={50} h={50} r={13} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Bar w="58%" h={15} style={{ marginBottom: 9 }} />
            <Bar w="36%" h={11} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Righe del magazzino dentro la stessa scheda bianca della lista vera.
export function InventoryListSkeleton({ count = 9 }) {
  return (
    <div aria-hidden="true" style={{ ...skCard, margin: '12px 16px 0', overflow: 'hidden' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid var(--c-line)' : 'none' }}>
          <Bar w={42} h={42} r={11} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Bar w={`${46 + (i * 13) % 30}%`} h={14} style={{ marginBottom: 8 }} />
            <Bar w={`${22 + (i * 7) % 18}%`} h={10} />
          </div>
          <Bar w={34} h={18} r={9} />
        </div>
      ))}
    </div>
  )
}

// Pagina intera per il caricamento del codice (Suspense in App.jsx): intestazione, barra di ricerca e lista, come la
// pagina vera. kind: 'dashboard' | 'events' | 'inventory'.
export function RouteSkeleton({ kind }) {
  const isMobile = useIsMobile()
  const onRed = { background: 'rgba(255,255,255,0.3)', animation: 'none' }
  const search = <Bar w="auto" h={40} r={12} style={{ margin: '14px 16px 0' }} />
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento" style={{ background: 'var(--surface)', minHeight: '100dvh', paddingBottom: 140 }}>
      {kind === 'dashboard' ? (
        <>
          <div className="page-header rc-page-header" style={{ background: 'linear-gradient(135deg, #d43341 0%, #bd2735 100%)', borderBottom: 'none', ...(isMobile ? { padding: '56px 20px 28px' } : {}) }}>
            <Bar w={90} h={11} style={onRed} />
            <Bar w={190} h={26} r={8} style={{ ...onRed, margin: '10px 0 10px' }} />
            <Bar w={130} h={11} style={onRed} />
          </div>
          <div style={isMobile ? { padding: '26px 18px 0' } : { padding: '24px 32px 0' }}>
            {!isMobile && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 28 }}>
                {[0, 1, 2, 3].map(i => <div key={i} style={{ ...skCard, borderRadius: 18, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}><Bar w={46} h={46} r={14} /><div><Bar w={36} h={26} r={6} style={{ marginBottom: 8 }} /><Bar w={80} h={11} /></div></div>)}
              </div>
            )}
            <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: 24 } : { display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(340px, 1fr)', gap: 36 }}>
              <div style={{ order: isMobile ? 2 : 1 }}><DashEventsSkeleton /></div>
              <div style={{ order: isMobile ? 1 : 2, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, alignContent: 'start' }}>
                {[0, 1, 2, 3].map(i => <div key={i} style={{ ...skCard, borderRadius: 18, padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 12 }}><Bar w={42} h={42} r={14} /><Bar w="45%" h={13} /></div>)}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="page-header rc-page-header">
            <Bar w={130} h={26} r={8} style={{ marginBottom: 10 }} />
            <Bar w={90} h={11} />
          </div>
          {search}
          {kind === 'inventory' && (
            <div style={{ display: 'flex', gap: 8, padding: '14px 16px 0', overflow: 'hidden' }}>
              {[70, 90, 80, 100, 74].map((w, i) => <Bar key={i} w={w} h={32} r={16} style={{ flexShrink: 0 }} />)}
            </div>
          )}
          {kind === 'inventory' ? <InventoryListSkeleton /> : <div style={{ paddingTop: 12 }}><EventListSkeleton count={6} /></div>}
        </>
      )}
    </div>
  )
}
