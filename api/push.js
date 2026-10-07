// Registrazione token + invio notifiche push in un solo endpoint
// (`action: 'register'|'unregister'|'send'` nel body) — stesso motivo di
// google-oauth.js: il piano Hobby di Vercel permette al massimo 12
// Serverless Functions per deployment, due file separati lo sforavano.
import { requireTeamMember, getAdmin } from './_authAdmin.js'

const DEAD_TOKEN_CODES = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']

// Salva/rimuove il token FCM del dispositivo chiamante — un documento per
// token (dedup naturale: un dispositivo che si ri-registra sovrascrive sé
// stesso invece di accumulare doppioni).
async function registerToken(req, res, db, teamId, uid) {
  const { token, action } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Token mancante' })

  const admin = getAdmin()
  const tokenRef = db.collection('pushTokens').doc(token)
  if (action === 'unregister') {
    await tokenRef.delete()
  } else {
    await tokenRef.set({
      teamId, userId: uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  res.status(200).json({ ok: true })
}

// Invia a tutti i dispositivi della squadra che l'hanno attivata, tranne chi
// ha appena generato l'evento che la innesca (altrimenti chi fa la modifica
// riceve un push su se stesso). Pulisce anche i token morti (app
// disinstallata/permesso revocato) così non si ritenta all'infinito su quelli.
async function sendPush(req, res, db, teamId, uid) {
  const { title, body, url } = req.body || {}
  if (!title || !body) return res.status(400).json({ error: 'title e body richiesti' })

  const admin = getAdmin()
  const tokensSnap = await db.collection('pushTokens').where('teamId', '==', teamId).get()
  const tokens = tokensSnap.docs.filter(d => d.data().userId !== uid).map(d => d.id)
  if (tokens.length === 0) return res.status(200).json({ sent: 0 })

  const resp = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: { icon: '/pwa-192x192.png', badge: '/pwa-192x192.png' },
      fcmOptions: url ? { link: url } : undefined,
    },
  })

  const deletions = []
  resp.responses.forEach((r, i) => {
    if (!r.success && DEAD_TOKEN_CODES.includes(r.error?.code)) {
      deletions.push(db.collection('pushTokens').doc(tokens[i]).delete())
    }
  })
  await Promise.all(deletions)

  res.status(200).json({ sent: resp.successCount })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso' })

  let db, teamId, uid
  try {
    ;({ db, teamId, uid } = await requireTeamMember(req))
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

  const { action } = req.body || {}
  if (action === 'register' || action === 'unregister') return registerToken(req, res, db, teamId, uid)
  if (action === 'send') return sendPush(req, res, db, teamId, uid)
  return res.status(400).json({ error: 'Azione non valida' })
}
