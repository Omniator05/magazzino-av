// Un documento team senza billingStatus impostato viene trattato come
// "trialing" scaduto (fail-closed): non deve succedere per squadre create
// dopo l'introduzione di questa feature (Signup.jsx lo imposta sempre) o per
// quelle esistenti prima (migrate-billing-grandfather.js le rende exempt) —
// se capita comunque è un bug da notare, non un accesso da lasciar passare.
export function isBillingValid(team) {
  if (!team) return true // team non ancora caricato: non bloccare a vuoto
  const status = team.billingStatus
  if (status === 'exempt' || status === 'active') return true
  if (status === 'trialing') {
    const days = trialDaysLeft(team)
    return days !== null && days > 0
  }
  return false
}

// Giorni interi rimasti alla fine della prova (può essere negativo se già
// scaduta). Torna null se il team non ha una data di scadenza prova.
export function trialDaysLeft(team) {
  if (!team?.trialEndsAt) return null
  const end = team.trialEndsAt.toDate ? team.trialEndsAt.toDate() : new Date(team.trialEndsAt)
  return Math.ceil((end.getTime() - Date.now()) / 86400000)
}
