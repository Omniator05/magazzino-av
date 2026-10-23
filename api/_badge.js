// Badge QR personale per lavorare a proprio nome alla "Postazione magazzino" (un PC
// fisso con lettore USB, account con isStation): ogni utente ha un codice segreto
// "RCB-…" che mostra sul proprio telefono come QR; alla postazione lo scansiona e da
// lì in poi le azioni (carico, rientro, rotto…) portano il suo nome.
//
// Come i link ospite (vedi _guest.js) vive qui e non in un endpoint a sé: il piano
// Hobby di Vercel ammette 12 Serverless Functions e il progetto è già a 12. Viene
// chiamato da push.js DOPO la verifica del token Firebase di chi chiama.
//
// Sicurezza: i codici stanno in `operatorBadges`, collection che le regole Firestore
// escludono per tutti i client — solo questo file (Admin SDK) la legge e la scrive,
// quindi il codice di un collega non si può leggere dall'app. Chi lo scansiona deve
// essere una postazione della stessa squadra. Un badge è come una tessera: chi lo
// fotografa può usarlo, quindi si può rigenerare in ogni momento (il vecchio smette
// di funzionare) e un utente disattivato non entra più.
import crypto from 'node:crypto'

// Senza 0/O/1/I: si leggono bene anche se si stampano e si digitano a mano.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LEN = 24
const newCode = () => 'RCB-' + Array.from({ length: CODE_LEN }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')
const normalize = raw => String(raw || '').trim().replace(/'/g, '-').toUpperCase()
const CODE_RE = /^RCB-[A-Z0-9]{20,40}$/

async function getBadge(req, res, { db, teamId, uid, profile }) {
  if (profile?.isStation) return res.status(403).json({ error: 'La postazione non ha un badge' })
  const ref = db.collection('operatorBadges').doc(uid)
  const snap = await ref.get()
  if (!snap.exists || req.body?.regenerate === true) {
    const code = newCode()
    await ref.set({ teamId, userId: uid, code, createdAt: new Date().toISOString() })
    return res.status(200).json({ code })
  }
  return res.status(200).json({ code: snap.data().code })
}

async function loginWithBadge(req, res, { db, teamId, profile }) {
  // Solo le postazioni "accettano" badge: un normale utente non ha motivo di farlo.
  if (!profile?.isStation) return res.status(403).json({ error: 'Solo la postazione può usare un badge' })
  const code = normalize(req.body?.code)
  if (!CODE_RE.test(code)) return res.status(404).json({ error: 'Badge non valido', code: 'invalid' })

  const found = await db.collection('operatorBadges').where('code', '==', code).limit(1).get()
  if (found.empty) return res.status(404).json({ error: 'Badge non valido', code: 'invalid' })
  const badge = found.docs[0].data()
  if (badge.teamId !== teamId) return res.status(404).json({ error: 'Badge non valido', code: 'invalid' })

  const personSnap = await db.collection('profiles').doc(badge.userId).get()
  const person = personSnap.data()
  if (!person || person.teamId !== teamId || person.approved === false || person.active === false || person.isStation) {
    return res.status(403).json({ error: 'Utente non attivo', code: 'inactive' })
  }
  return res.status(200).json({ userId: badge.userId, name: person.name || person.username || '' })
}

// true se l'azione era "badge-*" e la risposta è già stata data.
export async function handleBadgeAction(req, res, ctx) {
  const action = req.body?.action
  if (action === 'badge-get') { await getBadge(req, res, ctx); return true }
  if (action === 'badge-login') { await loginWithBadge(req, res, ctx); return true }
  return false
}
