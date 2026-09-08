import BackHomeButton from './BackHomeButton'

// Guscio condiviso da Privacy Policy / Termini / Cookie Policy — pagine
// pubbliche (raggiungibili da loggati e non, vedi le route top-level in
// App.jsx accanto a /login e /signup) pensate per la lettura: tema chiaro
// "in-app" (leggibilità di un testo lungo) invece dello sfondo scuro da
// marketing di Landing/Auth, larghezza colonna limitata per non avere righe
// troppo lunghe da seguire.
export default function LegalPageLayout({ title, updatedAt, children }) {
  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg)' }}>
      <div style={{
        position:'sticky', top:0, zIndex:10, background:'var(--bg)',
        borderBottom:'1px solid var(--border)', padding:'calc(env(safe-area-inset-top) + 10px) 16px 10px',
      }}>
        <div style={{ maxWidth:640, margin:'0 auto', display:'flex', alignItems:'center', gap:8 }}>
          <BackHomeButton to="/" />
          <p style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{title}</p>
        </div>
      </div>

      <div style={{ maxWidth:640, margin:'0 auto', padding:'28px 20px 80px' }}>
        <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.4px', color:'var(--text)', marginBottom:6 }}>{title}</h1>
        <p style={{ fontSize:12.5, color:'var(--text3)', marginBottom:30 }}>Ultimo aggiornamento: {updatedAt}</p>
        {children}
      </div>
    </div>
  )
}

export function LegalH2({ children }) {
  return <h2 style={{ fontSize:17.5, fontWeight:800, color:'var(--text)', margin:'30px 0 10px', letterSpacing:'-0.2px' }}>{children}</h2>
}

export function LegalP({ children }) {
  return <p style={{ fontSize:14.5, lineHeight:1.7, color:'var(--text2)', margin:'0 0 14px' }}>{children}</p>
}

export function LegalList({ items }) {
  return (
    <ul style={{ margin:'0 0 14px', paddingLeft:20, display:'flex', flexDirection:'column', gap:7 }}>
      {items.map((it, i) => <li key={i} style={{ fontSize:14.5, lineHeight:1.6, color:'var(--text2)' }}>{it}</li>)}
    </ul>
  )
}

// Riquadro per evidenziare un punto chiave (es. contatti, sintesi) senza
// interrompere il flusso di lettura con un altro h2.
export function LegalCallout({ children }) {
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'16px 18px', margin:'0 0 18px' }}>
      {children}
    </div>
  )
}
