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
import { sendEmail, inviteEmailHtml, absenceNotificationEmailHtml, passwordResetEmailHtml, welcomeEmailHtml, joinRequestThanksEmailHtml, joinRequestAdminEmailHtml, joinApprovedEmailHtml, joinRejectedEmailHtml } from './_resend.js'
import { pushToAdmins } from './push.js'
import { signupStart, signupVerify, signupResend } from './_signup.js'

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

  const { toEmail, workerName, username, password, role } = req.body || {}
  const asAdmin = role === 'admin'
  if (!toEmail || !workerName || !username || !password) {
    return res.status(400).json({ error: 'Dati mancanti' })
  }

  const origin = req.headers.origin || `https://${req.headers.host}`
  try {
    await sendEmail({
      to: toEmail,
      subject: asAdmin ? `Sei stato aggiunto come admin su Roadcase — ${ctx.team.name}` : `Sei stato invitato su Roadcase — ${ctx.team.name}`,
      html: inviteEmailHtml({ workerName, teamName: ctx.team.name, username, password, loginUrl: `${origin}/login`, asAdmin }),
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
      // Referer = il sito stesso: se la chiave web di Firebase è limitata ai "referrer" (come di solito), la richiesta
      // dal server altrimenti verrebbe rifiutata e nessun nome utente funzionerebbe.
      const origin = req.headers.origin || `https://${req.headers.host}`
      const check = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Referer: `${origin}/`, Origin: origin },
        body: JSON.stringify({ email: authEmail, password, returnSecureToken: false }),
      })
      if (check.ok) return res.status(200).json({ token: await admin.auth().createCustomToken(d.id) })
      // Password sbagliata è normale (INVALID_PASSWORD / INVALID_LOGIN_CREDENTIALS); altri motivi sono un problema vero e si vedono nei log.
      const why = (await check.json().catch(() => ({})))?.error?.message || `http-${check.status}`
      if (!/INVALID_(PASSWORD|LOGIN_CREDENTIALS)|EMAIL_NOT_FOUND|USER_DISABLED/.test(why)) console.error('[send-email loginByUsername] Firebase ha rifiutato la verifica:', why)
    }
  } catch (e) {
    console.error('[send-email loginByUsername]', e.message)
  }
  return res.status(401).json({ error: 'invalid' })
}

// Richiesta d'accesso a una squadra esistente (Signup → "Unisciti a una squadra"). Chi chiede ha appena creato
// l'account e il profilo è ancora "in attesa" (approved: false): non è un membro, quindi niente requireTeamMember —
// si verifica il suo token e che il profilo sia davvero in attesa. Tutto lato server perché il client in attesa
// non può scrivere notifiche né mandare push alla squadra. Una sola volta per profilo (joinRequestNotifiedAt), così
// un doppio clic o un secondo tentativo non riempie di email gli admin. Ogni passo è indipendente e best-effort.
async function joinRequest(req, res) {
  const idToken = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!idToken) return res.status(401).json({ error: 'Token mancante' })
  const admin = getAdmin()
  let uid
  try { uid = (await admin.auth().verifyIdToken(idToken)).uid } catch { return res.status(401).json({ error: 'Token non valido' }) }

  const db = admin.firestore()
  const profileRef = db.collection('profiles').doc(uid)
  const profile = (await profileRef.get()).data()
  if (!profile || profile.approved !== false || !profile.teamId) return res.status(200).json({ sent: false, reason: 'not-pending' })
  if (profile.joinRequestNotifiedAt) return res.status(200).json({ sent: false, reason: 'already-sent' })
  const teamSnap = await db.collection('teams').doc(profile.teamId).get()
  if (!teamSnap.exists) return res.status(404).json({ error: 'Squadra non trovata' })
  const teamName = teamSnap.data().name || ''

  // Il segno va messo prima degli invii: se qualcosa fallisce a metà, meglio un avviso in meno che duplicati.
  await profileRef.update({ joinRequestNotifiedAt: admin.firestore.FieldValue.serverTimestamp() })

  const origin = req.headers.origin || `https://${req.headers.host}`
  const requesterName = profile.name || profile.email || ''
  const adminsSnap = await db.collection('profiles').where('teamId', '==', profile.teamId).where('role', '==', 'admin').get()
  const adminEmails = [...new Set(adminsSnap.docs
    .map(d => d.data())
    .filter(p => p.approved !== false && p.active !== false)
    .map(p => p.email).filter(Boolean))]

  const steps = [
    // Avviso in app (popup agli admin, vedi JoinRequestNotifications.jsx)
    db.collection('notifications').add({
      teamId: profile.teamId, type: 'join_request',
      requesterId: uid, requesterName, requesterEmail: profile.email || '',
      seenBy: [], createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
    pushToAdmins(profile.teamId, {
      title: 'Nuova richiesta di accesso',
      body: `${requesterName} · ${teamName}`,
      url: '/admin/settings/users',
    }),
    ...adminEmails.map(to => sendEmail({
      to,
      subject: `New access request — ${requesterName}`,
      html: joinRequestAdminEmailHtml({ requesterName, requesterEmail: profile.email, teamName, appUrl: origin }),
    })),
    ...(profile.email ? [sendEmail({
      to: profile.email,
      subject: 'Thanks for requesting access — Roadcase',
      html: joinRequestThanksEmailHtml({ name: requesterName, teamName, appUrl: origin }),
    })] : []),
  ]
  const results = await Promise.allSettled(steps)
  results.filter(r => r.status === 'rejected').forEach(r => console.error('[send-email joinRequest]', r.reason?.message || r.reason))
  return res.status(200).json({ sent: true })
}

// Esito di una richiesta d'accesso, a chi l'aveva fatta: lo chiama un admin dopo aver approvato (profilo già
// approved: true) o PRIMA di rifiutare (il profilo viene cancellato subito dopo, vedi utils/joinRequests.js).
// Si controlla che sia davvero un utente della sua squadra nello stato giusto e si manda una sola volta.
async function joinDecision(req, res) {
  let ctx
  try { ctx = await requireTeamAdmin(req) } catch (e) { return res.status(e.status || 500).json({ error: e.message }) }

  const { targetUid, decision } = req.body || {}
  if (!targetUid || !['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Dati mancanti' })

  const targetRef = ctx.db.collection('profiles').doc(targetUid)
  const target = (await targetRef.get()).data()
  if (!target || target.teamId !== ctx.teamId) return res.status(404).json({ error: 'Utente non trovato' })
  // Rifiuto: deve essere ancora in attesa. Approvazione: deve risultare già approvata.
  const stateOk = decision === 'rejected' ? target.approved === false : target.approved !== false
  if (!stateOk) return res.status(409).json({ error: 'Stato della richiesta non coerente' })
  // L'approvazione scrive solo a chi è passato dalla richiesta d'accesso (porta il segno di joinRequest), non a un
  // utente qualunque della squadra.
  if (decision === 'approved' && !target.joinRequestNotifiedAt) return res.status(200).json({ sent: false })
  const origin = req.headers.origin || `https://${req.headers.host}`
  const name = target.name || target.email
  let sent = false
  if (target.email && !target.joinDecisionEmailedAt) {
    await targetRef.update({ joinDecisionEmailedAt: getAdmin().firestore.FieldValue.serverTimestamp() })
    try {
      await sendEmail(decision === 'approved'
        ? { to: target.email, subject: `You're in — welcome to ${ctx.team.name}`, html: joinApprovedEmailHtml({ name, teamName: ctx.team.name, loginUrl: `${origin}/login` }) }
        : { to: target.email, subject: `About your request to join ${ctx.team.name}`, html: joinRejectedEmailHtml({ name, teamName: ctx.team.name }) })
      sent = true
    } catch (e) {
      console.error('[send-email joinDecision]', e.message)
    }
  }

  // Rifiuto: via anche l'account di accesso e il profilo, così la stessa email può riprovare da zero invece di
  // restare bloccata da un account orfano ("email già in uso"). Mai un admin, un super admin o se stessi.
  let removed = false
  if (decision === 'rejected' && targetUid !== ctx.uid && target.role !== 'admin' && !target.superAdmin) {
    try { await getAdmin().auth().deleteUser(targetUid) } catch (e) {
      if (e.code !== 'auth/user-not-found') console.error('[send-email joinDecision] deleteUser', e.message)
    }
    await targetRef.delete()
    removed = true
  }
  return res.status(200).json({ sent, removed })
}

const HANDLERS = { welcome: sendWelcome, invite: sendInvite, absence: sendAbsence, passwordReset: sendPasswordReset, forgotPassword: sendForgotPassword, loginByUsername, joinRequest, joinDecision, signupStart, signupVerify, signupResend }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const fn = HANDLERS[req.body?.type]
  if (!fn) return res.status(400).json({ error: 'Tipo email mancante o sconosciuto' })
  return fn(req, res)
}
