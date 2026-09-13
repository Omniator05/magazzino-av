import { Warn } from './Icon'
import { fmtHours, capStatus, CAP_COLOR } from '../utils/workHours'

// Meter del limite ore, sola lettura: il tetto si imposta dalla scheda
// dell'utente (Impostazioni → Utenti), perché è un dato del suo contratto —
// qui lo si legge soltanto. Chi non ha un limite non mostra nulla, invece di
// riempire la pagina di inviti a impostarlo. Condiviso dalla pagina lista e
// da quella di dettaglio del singolo lavoratore.
export default function CapMeter({ worker, t }) {
  if (!worker.maxMonthlyHours) return null

  const status = capStatus(worker.total, worker.maxMonthlyHours)
  const pct = Math.min(100, (worker.total / worker.maxMonthlyHours) * 100)
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, background: 'var(--card2)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: CAP_COLOR[status], borderRadius: 3, transition: 'width 0.4s ease' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: CAP_COLOR[status], fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {fmtHours(worker.total)} / {worker.maxMonthlyHours}h
        </span>
      </div>
      {status === 'over' && (
        <p style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Warn size={11} /> {t('workHours.capExceededHint')}
        </p>
      )}
    </div>
  )
}
