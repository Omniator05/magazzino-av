// Cambio dell'email di accesso di un utente (admin della squadra): passa un account che entra con
// un'email finta (nome utente → "nome@theservice.internal") all'email VERA, così l'utente può
// anche reimpostare la password da solo ("Password dimenticata?").
//
// Come _badge.js e _guest.js vive qui e non in un endpoint a sé (limite di 12 funzioni del piano
// Hobby di Vercel): viene chiamato da push.js DOPO la verifica del token Firebase.
import { getAdmin } from './_authAdmin.js'
import { sendEmail, loginChangedEmailHtml } from './_resend.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function setLoginEmail(req, res, { db, teamId, profile }) {
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Solo un admin può cambiare l\'email di accesso' })
  const email = String(req.body?.email || '').trim().toLowerCase()
  const targetUid = String(req.body?.targetUid || '')
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email non valida', code: 'invalid-email' })
  if (!targetUid) return res.status(400).json({ error: 'Utente mancante' })

  const ref = db.collection('profiles').doc(targetUid)
  const snap = await ref.get()
  const target = snap.data()
  if (!target || target.teamId !== teamId) return res.status(404).json({ error: 'Utente non trovato' })
  // La postazione è un dispositivo (nome utente, niente email): resta com'è.
  if (target.isStation) return res.status(400).json({ error: 'La postazione entra con il nome utente', code: 'station' })

  try {
    await getAdmin().auth().updateUser(targetUid, { email })
  } catch (e) {
    if (e.code === 'auth/email-already-exists') return res.status(409).json({ error: 'Questa email è già usata da un altro account', code: 'email-in-use' })
    if (e.code === 'auth/user-not-found') return res.status(404).json({ error: 'Questo utente non ha un account di accesso', code: 'no-account' })
    if (e.code === 'auth/invalid-email') return res.status(400).json({ error: 'Email non valida', code: 'invalid-email' })
    console.error('[user-set-login-email]', e.message)
    return res.status(502).json({ error: e.message })
  }

  // `internalEmail` è l'email con cui l'account esiste in Firebase Auth: da ora è quella vera.
  await ref.update({ email, internalEmail: email, loginByEmail: true })

  // Avviso all'utente (senza password): da ora entra con l'email. Best-effort.
  try {
    const origin = req.headers.origin || `https://${req.headers.host}`
    const team = (await db.collection('teams').doc(teamId).get()).data() || {}
    await sendEmail({
      to: email,
      subject: 'Il tuo accesso a Roadcase è cambiato',
      html: loginChangedEmailHtml({ workerName: target.name || '', teamName: team.name || '', email, loginUrl: `${origin}/login` }),
    })
  } catch (e) { console.warn('[user-set-login-email] avviso non inviato:', e.message) }

  return res.status(200).json({ ok: true })
}

// true se l'azione era "user-*" e la risposta è già stata data.
export async function handleUserAction(req, res, ctx) {
  if (req.body?.action === 'user-set-login-email') { await setLoginEmail(req, res, ctx); return true }
  return false
}
