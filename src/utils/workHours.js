// Helper condivisi tra la pagina lista (SettingsWorkHours.jsx) e la pagina
// di dettaglio del singolo lavoratore (SettingsWorkHoursWorker.jsx) — invece
// di duplicarli nei due file.

export const timeStr = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
export const computeHours = (startISO, endISO) => Math.max(0, Math.round(((new Date(endISO) - new Date(startISO)) / 3600000) * 100) / 100)
export const fmtHours = (h) => (h == null ? '—' : `${h.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}h`)

// "YYYY-MM" dai componenti LOCALI della data, mai da toISOString(): a est di
// Greenwich il primo del mese alle 00:00 locali è ancora il mese precedente
// in UTC, e il filtro finiva sul mese sbagliato.
export const monthKeyOf = (year, month) => `${year}-${String(month + 1).padStart(2, '0')}`
export const monthKey = (d = new Date()) => monthKeyOf(d.getFullYear(), d.getMonth())
// Stessa logica locale-non-UTC di monthKey, per non elencare a vita le
// assenze già del tutto passate.
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Stato del limite ore (contratto) — stessa scala good/warning/critical già
// usata nel resto dell'app (var(--green)/var(--accent2)/var(--red)), non
// colori nuovi inventati per l'occasione.
export function capStatus(total, max) {
  if (!max) return null
  const ratio = total / max
  if (ratio >= 1) return 'over'
  if (ratio >= 0.85) return 'near'
  return 'ok'
}
export const CAP_COLOR = { ok: 'var(--green)', near: 'var(--accent2)', over: 'var(--red)' }
