// Invia una notifica push a tutti i dispositivi della squadra che l'hanno
// attivata (vedi register-push-token.js), tranne chi ha appena generato
// l'evento che la innesca — altrimenti chi fa la modifica riceve un push su
// se stesso ogni volta. Pulisce anche i token morti (app disinstallata/
// permesso revocato) così non si ritenta all'infinito su quelli.
import { requireTeamMember, getAdmin } from './_authAdmin.js'

const DEAD_TOKEN_CODES = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso' })

  let db, teamId, uid
  try {
    ;({ db, teamId, uid } = await requireTeamMember(req))
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

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
