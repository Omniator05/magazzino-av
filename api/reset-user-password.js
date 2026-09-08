// Reset "per davvero" della password di un utente da parte dell'admin — via
// Admin SDK, che può impostare una nuova password su un account Firebase
// Auth senza conoscere quella attuale e senza bisogno che l'utente target
// sia mai riuscito ad autenticarsi altrove. Sostituisce il vecchio
// meccanismo client-side ("pendingPassword" applicata al prossimo login
// riuscito), che non serviva a niente per un utente già bloccato fuori.
import { requireTeamAdmin, getAdmin } from './_authAdmin.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let ctx
  try {
    ctx = await requireTeamAdmin(req)
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

  const { targetUid, newPassword } = req.body || {}
  if (!targetUid || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Dati mancanti o password troppo corta' })
  }

  // L'utente target deve appartenere alla stessa squadra di chi chiama —
  // altrimenti un admin potrebbe resettare la password di un account di
  // un'altra azienda semplicemente indovinandone lo uid.
  const targetSnap = await ctx.db.collection('profiles').doc(targetUid).get()
  const targetProfile = targetSnap.data()
  if (!targetProfile || targetProfile.teamId !== ctx.teamId) {
    return res.status(404).json({ error: 'Utente non trovato' })
  }

  try {
    await getAdmin().auth().updateUser(targetUid, { password: newPassword })
    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}
