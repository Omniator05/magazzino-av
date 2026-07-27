// Chiamato dal client subito dopo aver creato un nuovo utente (AdminUsers.jsx,
// Welcome.jsx "primo magazziniere") — best-effort: se l'email non parte, non
// deve mai far fallire la creazione dell'account, che è già andata a buon fine.
import { requireTeamAdmin } from './_authAdmin.js'
import { sendEmail, inviteEmailHtml } from './_resend.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let ctx
  try {
    ctx = await requireTeamAdmin(req)
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

  const { toEmail, workerName, username, password } = req.body || {}
  if (!toEmail || !workerName || !username || !password) {
    return res.status(400).json({ error: 'Dati mancanti' })
  }

  const origin = req.headers.origin || `https://${req.headers.host}`
  try {
    await sendEmail({
      to: toEmail,
      subject: `Sei stato invitato su Roadcase — ${ctx.team.name}`,
      html: inviteEmailHtml({
        workerName,
        teamName: ctx.team.name,
        username,
        password,
        loginUrl: `${origin}/login`,
      }),
    })
    res.status(200).json({ sent: true })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}
