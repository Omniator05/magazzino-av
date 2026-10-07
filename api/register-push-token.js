// Salva/rimuove il token FCM del dispositivo chiamante nella collection
// `pushTokens` — un documento per token (dedup naturale: un dispositivo che
// si ri-registra sovrascrive sé stesso invece di accumulare doppioni).
import { requireTeamMember, getAdmin } from './_authAdmin.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso' })

  let db, teamId, uid
  try {
    ;({ db, teamId, uid } = await requireTeamMember(req))
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

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
