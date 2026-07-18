import { useNavigate } from 'react-router-dom'

// Bottone per tornare alla home, sulle pagine raggiunte dagli "Strumenti"
// della Dashboard (Scanner, Task, Furgoni, Template) — non hanno un percorso
// di navigazione gerarchico ovvio da cui tornare indietro. Stesso stile del
// "← Indietro" già usato in Archive.jsx, per coerenza.
export default function BackHomeButton() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/')}
      style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'6px 12px', fontSize:13, flexShrink:0 }}
    >
      ← Indietro
    </button>
  )
}
