// "Sincronizza ora" manuale (SettingsIntegrations.jsx / Events.jsx) — stessa
// identica logica del cron sync-google-pull.js, ma per UNA sola squadra
// (quella dell'admin che chiama) invece che in giro su tutte. Serve perché
// su Vercel Hobby il cron automatico può girare al massimo una volta al
// giorno: senza questo bottone, una modifica fatta su Google resterebbe
// invisibile su Roadcase fino al giro notturno.
import { requireTeamAdmin, getAdmin } from './_authAdmin.js'
import { syncTeam } from './sync-google-pull.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso' })

  let db, teamId, team
  try {
    ;({ db, teamId, team } = await requireTeamAdmin(req))
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

  if (!team.googleCalendarId) return res.status(200).json({ skipped: 'not_connected' })

  try {
    const admin = getAdmin()
    const result = await syncTeam(db, admin, teamId, team)
    return res.status(200).json(result)
  } catch (e) {
    console.error('google-sync-now', e)
    return res.status(500).json({ error: 'Sincronizzazione fallita' })
  }
}
