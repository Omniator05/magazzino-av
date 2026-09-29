// Helper condiviso per il flusso OAuth "a codice di autorizzazione" con
// Google (refresh token, non l'access token effimero di Google Identity
// Services usato lato client) — riusato da google-oauth-callback.js
// (scambio iniziale del code), push-event-to-google.js e sync-google-pull.js
// (rinnovo dell'access token da un refresh token già salvato).
//
// Nessuna cache dell'access token lato server: le funzioni serverless sono
// stateless fra un'invocazione e l'altra, quindi si richiede un access token
// fresco ad ogni chiamata — un giro HTTP in più, economico, ma evita di dover
// gestire scadenze/cache condivisa fra invocazioni diverse.
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

// Stesso ID pubblico usato lato client in src/config/googleCalendar.js — non
// è un segreto (può stare nel bundle frontend), quindi non serve un'env var
// dedicata: un solo posto da tenere aggiornato se mai cambiasse.
const GOOGLE_CLIENT_ID = '1074850505571-dhuar70q8ce3hgr8ovgijibdlm8tephs.apps.googleusercontent.com'

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} non configurata`)
  return v
}

// Primo scambio: il "code" ottenuto dal redirect di Google dopo il consenso
// dell'admin → {access_token, refresh_token, expires_in, ...}. refresh_token
// arriva SOLO se la richiesta di autorizzazione aveva access_type=offline
// (vedi SettingsIntegrations.jsx) e, per un account che aveva già dato il
// consenso in passato, solo se aveva anche prompt=consent.
export async function exchangeCodeForTokens(code, redirectUri) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Scambio code fallito: ${data.error_description || data.error || res.status}`)
  return data
}

// Rinnovo: refresh_token salvato → un access_token fresco (dura ~1h).
export async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(`Rinnovo token fallito: ${data.error_description || data.error || res.status}`)
    err.code = data.error // 'invalid_grant' → il refresh token è stato revocato, serve riconnettere
    throw err
  }
  return data.access_token
}

// Email dell'account Google collegato — solo per mostrarla in Impostazioni
// (SettingsIntegrations.jsx), così l'admin vede subito con quale account ha
// collegato il calendario. Non essenziale al funzionamento della sync.
export async function getGoogleUserEmail(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.email || null
  } catch {
    return null
  }
}
