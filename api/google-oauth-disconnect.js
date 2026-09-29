// Scollega Google Calendar: revoca il refresh token presso Google (best
// practice — altrimenti l'app resterebbe autorizzata sull'account Google
// anche senza più un uso reale) e ripulisce teamSecrets + i campi non
// sensibili sul team. Serve un endpoint dedicato perché il client non può
// leggere/scrivere teamSecrets direttamente (vedi firestore.rules).
import { requireTeamAdmin, getAdmin } from './_authAdmin.js'
import { decrypt } from './_crypto.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso' })

  let db, teamId
  try {
    ;({ db, teamId } = await requireTeamAdmin(req))
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

  try {
    const secretRef = db.collection('teamSecrets').doc(teamId)
    const secretSnap = await secretRef.get()
    const enc = secretSnap.data()?.googleRefreshTokenEnc
    if (enc) {
      try {
        const refreshToken = decrypt(enc)
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' })
      } catch (e) {
        // Se la revoca fallisce (es. era già stata revocata a mano su Google)
        // si prosegue comunque a ripulire lo stato locale — non deve
        // impedire all'admin di "scollegare" dal punto di vista dell'app.
        console.error('google-oauth-disconnect: revoke', e)
      }
    }
    await secretRef.delete()
    const admin = getAdmin()
    await db.collection('teams').doc(teamId).update({
      googleCalendarId: null,
      googleCalendarConnectedEmail: null,
      googleSyncToken: admin.firestore.FieldValue.delete(),
    })
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('google-oauth-disconnect', e)
    return res.status(500).json({ error: 'Scollegamento fallito' })
  }
}
