// Creazione di una nuova squadra con verifica dell'email. Tre azioni PUBBLICHE (chi si registra non ha ancora
// un account da cui autenticarsi), dietro l'endpoint /api/send-email (stesso motivo degli altri moduli "_":
// il piano Hobby di Vercel limita le funzioni, il prefisso "_" le esclude dal conteggio):
//
//   signupStart   — valida i dati, crea l'account di accesso (non ancora verificato), salva la richiesta in attesa
//                   e manda l'email con il link. La SQUADRA NON ESISTE ancora: nasce solo alla conferma.
//   signupVerify  — dal link: crea squadra e profilo admin, segna l'email verificata e restituisce un token di
//                   accesso, così chi ha cliccato entra già collegato (da qualunque dispositivo).
//   signupResend  — rimanda il link a chi ha una richiesta in attesa (sempre la stessa risposta: non rivela
//                   quali indirizzi hanno una richiesta).
//
// La richiesta in attesa sta in `teamSecrets` (chiusa a tutti i client: la leggono solo le API) con id derivato
// dall'impronta del token — il token vero esiste solo nell'email. Il link vale 24 ore ed è monouso, con una
// tolleranza di 10 minuti perché i programmi di scansione dei link nelle email non brucino il collegamento.
import crypto from 'node:crypto'
import { getAdmin } from './_authAdmin.js'
import { sendEmail, verifyEmailHtml } from './_resend.js'

const DAY = 24 * 60 * 60 * 1000
const TTL_MS = DAY
const REUSE_GRACE_MS = 10 * 60 * 1000
const THROTTLE_MS = 60 * 1000
const TRIAL_MS = 30 * DAY
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex')
const newToken = () => crypto.randomBytes(32).toString('base64url')
const pendingId = token => `signup_${sha(token).slice(0, 40)}`
const throttleId = email => `signupthrottle_${sha(email).slice(0, 40)}`
const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
const originOf = req => req.headers.origin || `https://${req.headers.host}`

// `deps` serve ai test (admin e invio email finti); in produzione si usano quelli veri.
export function createSignupHandlers(deps = {}) {
  const getAdminSdk = deps.getAdmin || getAdmin
  const send = deps.sendEmail || sendEmail
  const now = deps.now || (() => Date.now())

  // Un solo invio al minuto per indirizzo. Ritorna true se si può procedere.
  async function allowOnce(db, email) {
    const ref = db.collection('teamSecrets').doc(throttleId(email))
    const last = (await ref.get()).data()?.at || 0
    if (now() - last < THROTTLE_MS) return false
    await ref.set({ at: now() })
    return true
  }

  async function issueLink({ db, req, uid, email, name, companyName, nameLower, consentAcceptedAt }) {
    // Una sola richiesta in attesa per account: le precedenti (link vecchi) non valgono più.
    const old = await db.collection('teamSecrets').where('kind', '==', 'signup').where('uid', '==', uid).get()
    await Promise.all(old.docs.filter(d => !d.data().usedAt).map(d => d.ref.delete()))
    const token = newToken()
    await db.collection('teamSecrets').doc(pendingId(token)).set({
      kind: 'signup', uid, email, name, companyName, nameLower, consentAcceptedAt,
      createdAt: now(), expiresAt: now() + TTL_MS,
    })
    try {
      await send({
        to: email,
        // Il codice breve rende ogni invio un messaggio a sé: con lo stesso oggetto Gmail li raggruppa e nasconde
        // come "testo ripetuto" (…) la parte con il pulsante.
        subject: `Confirm your email to create ${companyName} on Roadcase (${sha(token).slice(0, 4).toUpperCase()})`,
        html: verifyEmailHtml({ name, teamName: companyName, verifyUrl: `${originOf(req)}/verify?token=${token}` }),
      })
    } catch (e) {
      await db.collection('teamSecrets').doc(pendingId(token)).delete().catch(() => {})
      throw e
    }
  }

  async function signupStart(req, res) {
    const b = req.body || {}
    const companyName = clean(b.companyName, 80)
    const name = clean(b.name, 80)
    const email = clean(b.email, 200).toLowerCase()
    const password = String(b.password ?? '')
    if (!companyName) return res.status(400).json({ error: 'invalid', field: 'company' })
    if (!name) return res.status(400).json({ error: 'invalid', field: 'name' })
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid', field: 'email' })
    if (password.length < 6 || password.length > 128) return res.status(400).json({ error: 'invalid', field: 'password' })
    if (b.consent !== true) return res.status(400).json({ error: 'invalid', field: 'consent' })

    const admin = getAdminSdk()
    const db = admin.firestore()
    if (!(await allowOnce(db, email))) return res.status(429).json({ error: 'rate-limit' })

    const nameLower = companyName.toLowerCase()
    const dup = await db.collection('teams').where('nameLower', '==', nameLower).limit(1).get()
    if (!dup.empty) return res.status(409).json({ error: 'company-exists' })

    // L'account di accesso: nuovo, oppure quello di una registrazione mai completata (senza profilo) — in quel caso
    // si riparte da lì con la nuova password, perché per completare serve comunque l'accesso a questa casella email.
    // Un account che ha già un profilo è di qualcuno: non si tocca.
    let uid
    try {
      const existing = await admin.auth().getUserByEmail(email).catch(e => (e.code === 'auth/user-not-found' ? null : Promise.reject(e)))
      if (existing) {
        if ((await db.collection('profiles').doc(existing.uid).get()).exists) return res.status(409).json({ error: 'email-in-use' })
        await admin.auth().updateUser(existing.uid, { password, displayName: name })
        uid = existing.uid
      } else {
        uid = (await admin.auth().createUser({ email, password, displayName: name, emailVerified: false })).uid
      }
    } catch (e) {
      if (e.code === 'auth/email-already-exists') return res.status(409).json({ error: 'email-in-use' })
      if (e.code === 'auth/invalid-password') return res.status(400).json({ error: 'invalid', field: 'password' })
      if (e.code === 'auth/invalid-email') return res.status(400).json({ error: 'invalid', field: 'email' })
      console.error('[signupStart] account', e.message)
      return res.status(500).json({ error: 'failed' })
    }

    try {
      await issueLink({ db, req, uid, email, name, companyName, nameLower, consentAcceptedAt: new Date(now()).toISOString() })
    } catch (e) {
      console.error('[signupStart] email', e.message)
      return res.status(502).json({ error: 'email-failed' })
    }
    return res.status(200).json({ ok: true })
  }

  async function signupVerify(req, res) {
    const token = String(req.body?.token ?? '')
    if (token.length < 20 || token.length > 120) return res.status(400).json({ error: 'invalid' })

    const admin = getAdminSdk()
    const db = admin.firestore()
    const ref = db.collection('teamSecrets').doc(pendingId(token))
    const d = (await ref.get()).data()
    if (!d || d.kind !== 'signup') return res.status(410).json({ error: 'invalid' })
    if (now() > d.expiresAt) return res.status(410).json({ error: 'expired', email: d.email })

    // Già confermato: entro la tolleranza si rilascia di nuovo l'accesso (la scansione automatica del link non
    // deve costare la registrazione), oltre il link è consumato.
    if (d.usedAt) {
      if (now() - d.usedAt > REUSE_GRACE_MS || !d.teamId) return res.status(410).json({ error: 'used' })
      return res.status(200).json({ token: await admin.auth().createCustomToken(d.uid), uid: d.uid, email: d.email, teamName: d.companyName, name: d.name })
    }

    // Nel frattempo qualcun altro può aver preso lo stesso nome azienda.
    const dup = await db.collection('teams').where('nameLower', '==', d.nameLower).limit(1).get()
    if (!dup.empty) { await ref.delete().catch(() => {}); return res.status(409).json({ error: 'company-exists' }) }

    let teamRef
    try {
      teamRef = await db.collection('teams').add({
        name: d.companyName, nameLower: d.nameLower,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: d.uid,
        // Prova gratuita di 30 giorni, come in registrazione diretta (vedi firestore.rules → hasValidBilling).
        billingStatus: 'trialing',
        trialEndsAt: admin.firestore.Timestamp.fromMillis(now() + TRIAL_MS),
      })
      await db.collection('profiles').doc(d.uid).set({
        name: d.name, email: d.email, role: 'admin', teamId: teamRef.id, approved: true, active: true,
        createdAt: new Date(now()).toISOString(),
        consentAcceptedAt: d.consentAcceptedAt, consentVersion: 'v1',
      })
      await admin.auth().updateUser(d.uid, { emailVerified: true })
      await ref.update({ usedAt: now(), teamId: teamRef.id })
    } catch (e) {
      // Niente squadra a metà: meglio riprovare il link da capo.
      if (teamRef) await teamRef.delete().catch(() => {})
      console.error('[signupVerify]', e.message)
      return res.status(500).json({ error: 'failed' })
    }
    return res.status(200).json({ token: await admin.auth().createCustomToken(d.uid), uid: d.uid, email: d.email, teamName: d.companyName, name: d.name })
  }

  async function signupResend(req, res) {
    const email = clean(req.body?.email, 200).toLowerCase()
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid', field: 'email' })
    const done = () => res.status(200).json({ ok: true })
    try {
      const db = getAdminSdk().firestore()
      if (!(await allowOnce(db, email))) return res.status(429).json({ error: 'rate-limit' })
      const snap = await db.collection('teamSecrets').where('kind', '==', 'signup').where('email', '==', email).get()
      const open = snap.docs.map(x => x.data()).filter(x => !x.usedAt).sort((a, b) => b.createdAt - a.createdAt)[0]
      if (!open) return done()
      await issueLink({ db, req, uid: open.uid, email, name: open.name, companyName: open.companyName, nameLower: open.nameLower, consentAcceptedAt: open.consentAcceptedAt })
    } catch (e) {
      console.error('[signupResend]', e.message)
    }
    return done()
  }

  return { signupStart, signupVerify, signupResend }
}

export const { signupStart, signupVerify, signupResend } = createSignupHandlers()
