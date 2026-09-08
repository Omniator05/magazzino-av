// Invia una vera email di reset password (link ufficiale generato da
// Firebase Auth) alla email REALE dell'utente — non alla sua internalEmail
// finta (@theservice.internal), che non è una casella di posta esistente.
// Il link viene generato via Admin SDK (funziona anche per un account
// bloccato fuori, non serve una sessione attiva) e spedito con Resend,
// stesso pattern delle altre email transazionali di questo progetto.
import { requireTeamAdmin, getAdmin } from './_authAdmin.js'
import { sendEmail, passwordResetEmailHtml } from './_resend.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let ctx
  try {
    ctx = await requireTeamAdmin(req)
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

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
    const resetLink = await getAdmin().auth().generatePasswordResetLink(authEmail, {
      url: `${origin}/login`,
    })
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
