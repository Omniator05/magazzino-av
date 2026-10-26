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
const PIN_RE = /^\d{4}$/

// Codice personale a 4 cifre, alternativa rapida al QR (alla postazione si digita sulla tastiera).
// Unico dentro la squadra: due colleghi non possono avere lo stesso. Il tentativo di indovinarlo è
// limitato (vedi loginWithBadge): per entrare serve comunque essere già collegati come postazione.
// Codici troppo facili da indovinare, che non vengono mai assegnati: 0000, 7777, 1234, 4321, 2345,
// 1212, 1122, 6969…
function isWeakPin(pin) {
  const d = pin.split('').map(Number)
  if (d.every(x => x === d[0])) return true                                       // 0000, 1111…
  const step = d[1] - d[0]
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return true   // 1234, 4321…
  if (d[0] === d[2] && d[1] === d[3]) return true                                 // 1212, 6969…
  if (d[0] === d[1] && d[2] === d[3]) return true                                 // 1122, 3366…
  return false
}

async function newPin(db, teamId) {
  for (let i = 0; i < 60; i++) {
    const pin = String(crypto.randomInt(10000)).padStart(4, '0')
    if (isWeakPin(pin)) continue
    const taken = await db.collection('operatorBadges').where('teamId', '==', teamId).where('pin', '==', pin).limit(1).get()
    if (taken.empty) return pin
  }
  throw new Error('Nessun codice libero')
}

const MAX_PIN_FAILS = 10
const PIN_WINDOW_MS = 5 * 60 * 1000

async function getBadge(req, res, { db, teamId, uid, profile }) {
  if (profile?.isStation) return res.status(403).json({ error: 'La postazione non ha un badge' })
  const ref = db.collection('operatorBadges').doc(uid)
  const snap = await ref.get()
  if (!snap.exists || req.body?.regenerate === true) {
    const code = newCode()
    const pin = await newPin(db, teamId)
    await ref.set({ teamId, userId: uid, code, pin, createdAt: new Date().toISOString() })
    return res.status(200).json({ code, pin })
  }
  const data = snap.data()
  // Badge creati prima del codice a 4 cifre: lo ricevono la prima volta che vengono aperti.
  let pin = data.pin
  if (!pin || isWeakPin(pin)) { pin = await newPin(db, teamId); await ref.update({ pin }) }
  return res.status(200).json({ code: data.code, pin })
}

async function loginWithBadge(req, res, { db, teamId, uid, profile }) {
  // Solo le postazioni "accettano" badge: un normale utente non ha motivo di farlo.
  if (!profile?.isStation) return res.status(403).json({ error: 'Solo la postazione può usare un badge' })
  const pin = String(req.body?.pin || '').trim()
  const code = normalize(req.body?.code)
  if (!(PIN_RE.test(pin) || CODE_RE.test(code))) return res.status(404).json({ error: 'Badge non valido', code: 'invalid' })

  // I codici a 4 cifre si possono indovinare: dopo troppi errori di fila la postazione aspetta qualche minuto.
  const failRef = db.collection('teamSecrets').doc(`pinfail_${uid}`)
  if (PIN_RE.test(pin)) {
    const f = (await failRef.get()).data()
    if (f && Date.now() - f.since < PIN_WINDOW_MS && f.n >= MAX_PIN_FAILS) {
      return res.status(429).json({ error: 'Troppi tentativi', code: 'locked' })
    }
  }

  const found = PIN_RE.test(pin)
    ? await db.collection('operatorBadges').where('teamId', '==', teamId).where('pin', '==', pin).limit(1).get()
    : await db.collection('operatorBadges').where('code', '==', code).limit(1).get()
  if (found.empty) {
    if (PIN_RE.test(pin)) {
      const f = (await failRef.get()).data()
      const fresh = !f || Date.now() - f.since >= PIN_WINDOW_MS
      await failRef.set({ n: fresh ? 1 : f.n + 1, since: fresh ? Date.now() : f.since })
    }
    return res.status(404).json({ error: 'Badge non valido', code: 'invalid' })
  }
  const badge = found.docs[0].data()
  if (badge.teamId !== teamId) return res.status(404).json({ error: 'Badge non valido', code: 'invalid' })

  const personSnap = await db.collection('profiles').doc(badge.userId).get()
  const person = personSnap.data()
  if (!person || person.teamId !== teamId || person.approved === false || person.active === false || person.isStation) {
    return res.status(403).json({ error: 'Utente non attivo', code: 'inactive' })
  }
  if (PIN_RE.test(pin)) await failRef.delete().catch(() => {})
  // Il ruolo e il permesso sul magazzino servono alla postazione per mostrare il magazzino completo a chi può modificarlo.
  return res.status(200).json({ userId: badge.userId, name: person.name || person.username || '', isAdmin: person.role === 'admin', canManageInventory: !!person.canManageInventory })
}

// true se l'azione era "badge-*" e la risposta è già stata data.
export async function handleBadgeAction(req, res, ctx) {
  const action = req.body?.action
  if (action === 'badge-get') { await getBadge(req, res, ctx); return true }
  if (action === 'badge-login') { await loginWithBadge(req, res, ctx); return true }
  return false
}
