// Chiamato dal client subito dopo che un worker segnala una nuova assenza
// (Calendar.jsx → addAbsence) — best-effort, esattamente come
// send-invite-email.js: l'avviso in-app (collection notifications) è già
// salvato prima di questa chiamata, quindi un fallimento qui non deve mai
// far sembrare che la segnalazione dell'assenza non sia andata a buon fine.
import { requireTeamMember } from './_authAdmin.js'
import { sendEmail, absenceNotificationEmailHtml } from './_resend.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let ctx
  try {
    ctx = await requireTeamMember(req)
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

  const { workerName, startDate, endDate, reason } = req.body || {}
  if (!workerName || !startDate) {
    return res.status(400).json({ error: 'Dati mancanti' })
  }

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
