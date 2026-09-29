// Avvio e scollegamento del collegamento Google Calendar in un solo
// endpoint (`action: 'start'|'disconnect'` nel body) — prima due funzioni
// separate: con l'aggiunta della sync Google il progetto ha superato le 12
// funzioni permesse dal piano Hobby di Vercel. google-oauth-callback.js
// resta invece un file a sé: il suo URL (/api/google-oauth-callback) è
// registrato per davvero come redirect URI nella console Google Cloud —
// spostarlo costringerebbe a rifare quella configurazione lì.
import { requireTeamAdmin, getAdmin } from './_authAdmin.js'
import { signState, decrypt } from './_crypto.js'

const GOOGLE_CLIENT_ID = '1074850505571-dhuar70q8ce3hgr8ovgijibdlm8tephs.apps.googleusercontent.com'
// Solo calendar.events: l'ambito userinfo.email era usato solo per mostrare
// "collegato come x@gmail.com" in Impostazioni (vedi getGoogleUserEmail in
// _googleAuth.js) — non è mai stato aggiunto alla consent screen su Google
// Cloud Console (non si trovava nel picker degli ambiti), quindi richiederlo
// qui avrebbe fatto fallire l'intera autorizzazione. getGoogleUserEmail
// resta comunque innocuo senza: torna null e quella riga semplicemente non
// compare, la sync del calendario non dipende da questo scope.
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

// Chiamato (autenticato, come admin) da SettingsIntegrations.jsx PRIMA di
// reindirizzare il browser a Google — genera uno "state" firmato che porta
// il teamId in modo verificabile fino a google-oauth-callback.js, che
// riceve solo un semplice redirect GET senza nessun header di
// autenticazione.
async function start(req, res, teamId) {
  const origin = req.headers.origin || `https://${req.headers.host}`
  const redirectUri = `${origin}/api/google-oauth-callback`
  const state = signState({ teamId })

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // indispensabile per ricevere un refresh_token
    prompt: 'consent',      // indispensabile per riceverlo ANCHE se l'account aveva già autorizzato in passato
    state,
  })

  res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
}

// Scollega: revoca il refresh token presso Google (best practice — altrimenti
// l'app resterebbe autorizzata sull'account Google anche senza più un uso
// reale) e ripulisce teamSecrets + i campi non sensibili sul team.
async function disconnect(req, res, teamId, db) {
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
        console.error('google-oauth disconnect: revoke', e)
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
    console.error('google-oauth disconnect', e)
    return res.status(500).json({ error: 'Scollegamento fallito' })
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso' })

  let db, teamId
  try {
    ;({ db, teamId } = await requireTeamAdmin(req))
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

  const action = req.body?.action
  if (action === 'disconnect') return disconnect(req, res, teamId, db)
  return start(req, res, teamId)
}
