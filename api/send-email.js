// Un solo endpoint per tutte le email transazionali (invito, benvenuto,
// notifica assenza, reset password) — prima erano 4 funzioni serverless
// separate (send-invite-email.js, send-welcome-email.js,
// send-absence-notification.js, send-password-reset-email.js): con Google
// Calendar il progetto ha superato le 12 funzioni permesse dal piano Hobby
// di Vercel, e queste 4 erano il gruppo più facile da accorpare senza
// perdere nulla (stessa identica logica di ciascuna, solo dietro un
// `type` invece che quattro URL diversi). Ogni ramo resta autonomo e
// best-effort esattamente come prima — il chiamante ignora sempre l'errore
// (vedi i `catch {}` lato client), quindi un tipo che fallisce non deve mai
// impedire agli altri di funzionare.
import { requireTeamAdmin, requireTeamMember, getAdmin } from './_authAdmin.js'
import crypto from 'node:crypto'
import { sendEmail, inviteEmailHtml, absenceNotificationEmailHtml, passwordResetEmailHtml, welcomeEmailHtml } from './_resend.js'

async function sendWelcome(req, res) {
  let ctx
  try { ctx = await requireTeamAdmin(req) } catch (e) { return res.status(e.status || 500).json({ error: e.message }) }

  const { toEmail, adminName } = req.body || {}
  if (!toEmail || !adminName) return res.status(400).json({ error: 'Dati mancanti' })

  const origin = req.headers.origin || `https://${req.headers.host}`
  try {
    await sendEmail({
      to: toEmail,
      subject: 'Benvenuto su Roadcase!',
      html: welcomeEmailHtml({ adminName, teamName: ctx.team.name, appUrl: origin }),
    })
    res.status(200).json({ sent: true })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}

async function sendInvite(req, res) {
  let ctx
  try { ctx = await requireTeamAdmin(req) } catch (e) { return res.status(e.status || 500).json({ error: e.message }) }

  const { toEmail, workerName, username, password } = req.body || {}
  if (!toEmail || !workerName || !username || !password) {
    return res.status(400).json({ error: 'Dati mancanti' })
  }

  const origin = req.headers.origin || `https://${req.headers.host}`
  try {
    await sendEmail({
      to: toEmail,
      subject: `Sei stato invitato su Roadcase — ${ctx.team.name}`,
      html: inviteEmailHtml({ workerName, teamName: ctx.team.name, username, password, loginUrl: `${origin}/login` }),
    })
    res.status(200).json({ sent: true })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}

async function sendAbsence(req, res) {
  let ctx
  try { ctx = await requireTeamMember(req) } catch (e) { return res.status(e.status || 500).json({ error: e.message }) }

  const { workerName, startDate, endDate, reason } = req.body || {}
  if (!workerName || !startDate) return res.status(400).json({ error: 'Dati mancanti' })

  // Tutti gli admin della squadra con un'email vera sul profilo — i worker
  // creati da Impostazioni non ne hanno sempre una, gli admin (venuti dalla
  // registrazione) sì.
  const adminsSnap = await ctx.db.collection('profiles')
    .where('teamId', '==', ctx.teamId).where('role', '==', 'admin').get()
  const adminEmails = [...new Set(adminsSnap.docs.map(d => d.data().email).filter(Boolean))]
  if (adminEmails.length === 0) return res.status(200).json({ sent: false, reason: 'no-admin-email' })

  const origin = req.headers.origin || `https://${req.headers.host}`
  try {
    await Promise.all(adminEmails.map(toEmail => sendEmail({
      to: toEmail,
      subject: `Nuova assenza segnalata — ${workerName}`,
      html: absenceNotificationEmailHtml({ workerName, startDate, endDate, reason, appUrl: origin }),
    })))
    res.status(200).json({ sent: true })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}

async function sendPasswordReset(req, res) {
  let ctx
  try { ctx = await requireTeamAdmin(req) } catch (e) { return res.status(e.status || 500).json({ error: e.message }) }

  const { targetUid } = req.body || {}
  if (!targetUid) return res.status(400).json({ error: 'Dati mancanti' })

  const targetSnap = await ctx.db.collection('profiles').doc(targetUid).get()
  const targetProfile = targetSnap.data()
  if (!targetProfile || targetProfile.teamId !== ctx.teamId) {
    return res.status(404).json({ error: 'Utente non trovato' })
  }
  if (!targetProfile.email) {
    return res.status(400).json({ error: 'Questo utente non ha un\'email reale salvata' })
  }
  // L'email dell'account Firebase Auth: per i worker/organizzatori creati da
  // username è l'internalEmail finta; per un admin (che si registra con la
  // propria email vera) coincide con `email` stessa.
  // Meglio chiederla direttamente a Firebase Auth (l'id del profilo è l'uid dell'account): i campi del
  // profilo possono non coincidere con l'email reale dell'account (cambi manuali, vecchi utenti), e
  // con l'email sbagliata Firebase non riesce a creare il link ("Unable to create the email action link").
  let authEmail = targetProfile.internalEmail || targetProfile.email
  try {
    const authUser = await getAdmin().auth().getUser(targetUid)
    if (authUser?.email) authEmail = authUser.email
  } catch (e) {
    if (e.code === 'auth/user-not-found') return res.status(404).json({ error: 'Questo utente non ha un account di accesso' })
    console.error('[send-email passwordReset] getUser', e.message)
  }

  const origin = req.headers.origin || `https://${req.headers.host}`
  try {
    // Il dominio da cui si lavora deve essere tra i "Domini autorizzati" di Firebase Authentication;
    // se non lo è (es. un'anteprima Vercel), si genera comunque il link, senza ritorno automatico al login.
    let resetLink
    try {
      resetLink = await getAdmin().auth().generatePasswordResetLink(authEmail, { url: `${origin}/login` })
    } catch (err) {
      if (!/allowlist|unauthorized-continue-uri/i.test(`${err.code || ''} ${err.message || ''}`)) throw err
      console.warn('[send-email passwordReset] dominio non autorizzato in Firebase:', origin)
      resetLink = await getAdmin().auth().generatePasswordResetLink(authEmail)
    }
    await sendEmail({
      to: targetProfile.email,
      subject: 'Reimposta la tua password — Roadcase',
      html: passwordResetEmailHtml({ workerName: targetProfile.name, resetUrl: resetLink, appUrl: origin }),
    })
    res.status(200).json({ sent: true })
  } catch (e) {
    // Nei log di Vercel si vede il motivo vero (chiave Resend, dominio non verificato, utente senza account…).
    console.error('[send-email passwordReset]', e.message)
    res.status(502).json({ error: e.message })
  }
}

// "Password dimenticata?" dalla pagina di accesso: nessun login, quindi risponde SEMPRE allo stesso modo
// (l'email esista o no) per non rivelare chi è registrato. Trova l'account dall'email vera: o è
// l'email stessa dell'account Firebase, o è quella salvata nel profilo (utenti con nome utente).
// Un solo invio al minuto per indirizzo (si appoggia a teamSecrets, chiusa a tutti i client).
async function sendForgotPassword(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email non valida' })
  const done = () => res.status(200).json({ ok: true })

  try {
    const admin = getAdmin()
    const db = admin.firestore()
    const throttle = db.collection('teamSecrets').doc(`pwreset_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 40)}`)
    const last = (await throttle.get()).data()?.at || 0
    if (Date.now() - last < 60000) return done()
    await throttle.set({ at: Date.now() })

    let uid = null
    let authEmail = null
    try { const u = await admin.auth().getUserByEmail(email); uid = u.uid; authEmail = u.email } catch { /* non è un account diretto */ }
    if (!authEmail) {
      const found = await db.collection('profiles').where('email', '==', email).limit(1).get()
      if (!found.empty) {
        uid = found.docs[0].id
        try { authEmail = (await admin.auth().getUser(uid)).email } catch { /* profilo senza account */ }
      }
    }
    if (!authEmail) return done()

    const name = uid ? ((await db.collection('profiles').doc(uid).get()).data()?.name || '') : ''
    const origin = req.headers.origin || `https://${req.headers.host}`
    let resetLink
    try {
      resetLink = await admin.auth().generatePasswordResetLink(authEmail, { url: `${origin}/login` })
    } catch (err) {
      if (!/allowlist|unauthorized-continue-uri/i.test(`${err.code || ''} ${err.message || ''}`)) throw err
      resetLink = await admin.auth().generatePasswordResetLink(authEmail)
    }
    await sendEmail({
      to: email,
      subject: 'Reimposta la tua password — Roadcase',
      html: passwordResetEmailHtml({ workerName: name || email, resetUrl: resetLink, appUrl: origin }),
    })
  } catch (e) {
    console.error('[send-email forgotPassword]', e.message)
  }
  return done()
}

// Accesso con il NOME UTENTE per chi è passato all'email (l'account Firebase ha ora un'email vera, quindi
// "nome → email finta" non basta più). Il server trova il profilo dal nome utente, verifica la password
// con Firebase e, se è giusta, restituisce un token di accesso: l'email dell'utente non esce mai dal
// server. Ogni risposta negativa è identica (nessun indizio su quali nomi esistono).
// La chiave web di Firebase è pubblica per natura (sta anche nel bundle dell'app).
const WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyA4pKUuEMrHDdjEdaI75bOE2xiWc_M_U3o'
async function loginByUsername(req, res) {
  const username = String(req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!username || !password || username.length > 80) return res.status(400).json({ error: 'Dati mancanti' })
  try {
    const admin = getAdmin()
    const found = await admin.firestore().collection('profiles').where('username', '==', username).limit(5).get()
    for (const d of found.docs) {
      let authEmail
      try { authEmail = (await admin.auth().getUser(d.id)).email } catch { continue }
      if (!authEmail) continue
      const check = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password, returnSecureToken: false }),
      })
      if (check.ok) return res.status(200).json({ token: await admin.auth().createCustomToken(d.id) })
    }
  } catch (e) {
    console.error('[send-email loginByUsername]', e.message)
  }
  return res.status(401).json({ error: 'invalid' })
}

const HANDLERS = { welcome: sendWelcome, invite: sendInvite, absence: sendAbsence, passwordReset: sendPasswordReset, forgotPassword: sendForgotPassword, loginByUsername }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const fn = HANDLERS[req.body?.type]
  if (!fn) return res.status(400).json({ error: 'Tipo email mancante o sconosciuto' })
  return fn(req, res)
}
