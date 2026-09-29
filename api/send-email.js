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
  const authEmail = targetProfile.internalEmail || targetProfile.email

  const origin = req.headers.origin || `https://${req.headers.host}`
  try {
    const resetLink = await getAdmin().auth().generatePasswordResetLink(authEmail, { url: `${origin}/login` })
    await sendEmail({
      to: targetProfile.email,
      subject: 'Reimposta la tua password — Roadcase',
      html: passwordResetEmailHtml({ workerName: targetProfile.name, resetUrl: resetLink, appUrl: origin }),
    })
    res.status(200).json({ sent: true })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}

const HANDLERS = { welcome: sendWelcome, invite: sendInvite, absence: sendAbsence, passwordReset: sendPasswordReset }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const fn = HANDLERS[req.body?.type]
  if (!fn) return res.status(400).json({ error: 'Tipo email mancante o sconosciuto' })
  return fn(req, res)
}
