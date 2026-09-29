// Riceve il redirect di Google dopo che l'admin ha dato il consenso — un
// semplice GET del browser, nessun header di autenticazione: l'unica prova
// che questa richiesta corrisponde davvero a un collegamento avviato da un
// admin è la firma dello "state" (vedi google-oauth.js/_crypto.js).
import { getAdmin } from './_authAdmin.js'
import { verifyState, encrypt } from './_crypto.js'
import { exchangeCodeForTokens, getGoogleUserEmail } from './_googleAuth.js'

export default async function handler(req, res) {
  const { code, state, error: googleError } = req.query
  const origin = req.headers.origin || `https://${req.headers.host}`
  const settingsUrl = `${origin}/admin/settings/integrations`

  // L'admin ha annullato il consenso su Google, o Google ha rifiutato per un
  // altro motivo — torna alle impostazioni con un esito negativo, niente di
  // più da fare qui.
  if (googleError) return res.redirect(302, `${settingsUrl}?google=error`)

  const payload = verifyState(state)
  if (!payload?.teamId) return res.redirect(302, `${settingsUrl}?google=error`)

  try {
    const redirectUri = `${origin}/api/google-oauth-callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri)
    if (!tokens.refresh_token) {
      // Non dovrebbe capitare con access_type=offline+prompt=consent, ma se
      // Google non lo manda non c'è modo di fare la sync server-side —
      // meglio dirlo chiaramente che salvare una connessione che smetterà
      // di funzionare al primo rinnovo.
      return res.redirect(302, `${settingsUrl}?google=no_refresh_token`)
    }

    const email = await getGoogleUserEmail(tokens.access_token)

    const admin = getAdmin()
    const db = admin.firestore()
    await db.collection('teamSecrets').doc(payload.teamId).set({
      googleRefreshTokenEnc: encrypt(tokens.refresh_token),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    await db.collection('teams').doc(payload.teamId).update({
      googleCalendarId: 'primary',
      googleCalendarConnectedEmail: email,
      googleSyncToken: admin.firestore.FieldValue.delete(), // riparte da una sync completa col nuovo collegamento
    })

    return res.redirect(302, `${settingsUrl}?google=connected`)
  } catch (e) {
    console.error('google-oauth-callback', e)
    return res.redirect(302, `${settingsUrl}?google=error`)
  }
}
