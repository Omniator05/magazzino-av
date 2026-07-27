// Chiamato dal client subito dopo il self-signup "crea nuova squadra"
// (Signup.jsx) — best-effort: se l'email non parte, non deve mai far fallire
// la creazione dell'account/squadra, già andata a buon fine a quel punto.
import { requireTeamAdmin } from './_authAdmin.js'
import { sendEmail, welcomeEmailHtml } from './_resend.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let ctx
  try {
    ctx = await requireTeamAdmin(req)
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

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
