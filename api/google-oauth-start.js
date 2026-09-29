// Punto di partenza del collegamento Google Calendar: chiamato (autenticato,
// come admin) da SettingsIntegrations.jsx PRIMA di reindirizzare il browser
// a Google — genera uno "state" firmato che porta il teamId in modo
// verificabile fino a google-oauth-callback.js, che riceve solo un semplice
// redirect GET senza nessun header di autenticazione.
import { requireTeamAdmin } from './_authAdmin.js'
import { signState } from './_crypto.js'

const GOOGLE_CLIENT_ID = '1074850505571-dhuar70q8ce3hgr8ovgijibdlm8tephs.apps.googleusercontent.com'
// Solo calendar.events: l'ambito userinfo.email era usato solo per mostrare
// "collegato come x@gmail.com" in Impostazioni (vedi getGoogleUserEmail in
// _googleAuth.js) — non è mai stato aggiunto alla consent screen su Google
// Cloud Console (non si trovava nel picker degli ambiti), quindi richiederlo
// qui avrebbe fatto fallire l'intera autorizzazione. getGoogleUserEmail
// resta comunque innocuo senza: torna null e quella riga semplicemente non
// compare, la sync del calendario non dipende da questo scope.
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso' })

  let teamId
  try {
    ;({ teamId } = await requireTeamAdmin(req))
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

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
