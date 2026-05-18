// Mini calendario stile opzione C
// dateStr: 'YYYY-MM-DD', dateEndStr: opzionale, location: opzionale, today: 'YYYY-MM-DD'
export default function DateBadge({ dateStr, dateEndStr, location, today }) {
  const d = new Date(dateStr + 'T12:00:00')
  const isToday = dateStr === today
  const isPast  = dateStr < today

  const monthBg = isToday ? '#dc2626' : isPast ? '#ea580c' : '#7c3aed'

  const month = d.toLocaleDateString('it-IT', { month:'short' }).toUpperCase()
  const day   = d.getDate()
  const long  = d.toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'long', year:'numeric' })

  const dEnd = dateEndStr && dateEndStr !== dateStr
    ? new Date(dateEndStr + 'T12:00:00').toLocaleDateString('it-IT', { day:'numeric', month:'short' })
    : null

  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', width:40, flexShrink:0, textAlign:'center', boxShadow:'var(--shadow-sm)' }}>
        <div style={{ background:monthBg, padding:'2px 0', fontSize:9, fontWeight:700, color:'white', textTransform:'uppercase', letterSpacing:'0.5px' }}>
          {month}
        </div>
        <div style={{ fontSize:18, fontWeight:700, color:'var(--text)', lineHeight:1.4 }}>
          {day}
        </div>
      </div>
      <div>
        <div style={{ fontSize:13, color:'var(--text2)' }}>
          {long}{dEnd ? ` → ${dEnd}` : ''}
        </div>
        {location && (
          <div style={{ fontSize:13, color:'var(--text2)', marginTop:1 }}>
            📍 {location}
          </div>
        )}
      </div>
    </div>
  )
}
