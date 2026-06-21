/**
 * Skeleton loaders con effetto shimmer (keyframe `shimmer` definito in index.css).
 * Bar = blocco generico; EventCardSkeleton = placeholder di una card evento.
 */
export function Bar({ w = '100%', h = 12, r = 7, style }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, #e9e9e6 25%, #f3f3f0 50%, #e9e9e6 75%)',
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
