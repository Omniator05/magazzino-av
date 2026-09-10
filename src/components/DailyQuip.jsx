import { pickDailyQuip } from '../utils/dailyQuip'

// Riga leggera sotto un empty-state — corsivo, colore smorzato, piccola:
// deve sembrare una chicca trovata per caso sotto il placeholder, non
// un'altra riga di interfaccia che chiede attenzione.
export default function DailyQuip({ quips }) {
  const quip = pickDailyQuip(quips)
  if (!quip) return null
  return (
    <p style={{
      textAlign: 'center', color: 'var(--text3)', fontSize: 12.5, fontStyle: 'italic',
      lineHeight: 1.5, maxWidth: 280, margin: '14px auto 0', padding: '0 24px',
    }}>
      {quip}
    </p>
  )
}
