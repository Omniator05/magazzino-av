// Cambio dell'email di accesso di un utente (admin della squadra): passa un account che entra con
// un'email finta (nome utente → "nome@theservice.internal") all'email VERA, così l'utente può
// anche reimpostare la password da solo ("Password dimenticata?").
//
// Come _badge.js e _station.js vive qui e non in un endpoint a sé (limite di 12 funzioni del piano
// Hobby di Vercel): viene chiamato da push.js DOPO la verifica del token Firebase.
import { getAdmin } from './_authAdmin.js'
import { sendEmail, loginChangedEmailHtml } from './_resend.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Un account di accesso "orfano" è un record di Firebase Auth senza più un profilo (utente eliminato dalla
// vecchia versione dell'app, che toglieva solo il profilo, o squadra eliminata): occupa l'email per sempre
// ("email già in uso") senza essere di nessuno. Non si tocca mai un account con profilo, né uno creato da meno
// di un'ora (potrebbe essere una registrazione in corso, a cui manca ancora il profilo).
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000
// 'none' = nessun account con quell'email · 'removed' = era orfano e l'ho tolto · 'in-use' = è di qualcuno
async function removeOrphanAuthAccount(db, email) {
  const auth = getAdmin().auth()
  let rec
  try { rec = await auth.getUserByEmail(email) } catch (e) {
    if (e.code === 'auth/user-not-found') return 'none'
    throw e
  }
  if ((await db.collection('profiles').doc(rec.uid).get()).exists) return 'in-use'
  const created = Date.parse(rec.metadata?.creationTime || '') || Date.now()
  if (Date.now() - created < ORPHAN_MIN_AGE_MS) return 'in-use'
  await auth.deleteUser(rec.uid)
  return 'removed'
}

async function setLoginEmail(req, res, { db, teamId, uid, profile }) {
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
  // Il profilo di un altro admin lo gestisce solo il creatore della squadra (vedi src/utils/teamOwner.js).
  if (target.role === 'admin' && targetUid !== uid && !profile?.superAdmin) {
    const team = (await db.collection('teams').doc(teamId).get()).data() || {}
    if (team.createdByUid && team.createdByUid !== uid && !(team.ownerIds || []).includes(uid)) return res.status(403).json({ error: 'Solo il creatore della squadra può cambiare l\'accesso di un admin' })
  }

  try {
    try {
      await getAdmin().auth().updateUser(targetUid, { email })
    } catch (e) {
      // Email tenuta da un account senza più profilo (utente eliminato in passato): lo libero e riprovo una volta
      if (e.code !== 'auth/email-already-exists' || await removeOrphanAuthAccount(db, email) !== 'removed') throw e
      await getAdmin().auth().updateUser(targetUid, { email })
    }
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

// Elimina un utente per intero (admin della squadra): account di accesso (Firebase Auth) + profilo + dati che
// dipendono da lui (badge della postazione, token delle notifiche). Così l'email e il nome utente tornano liberi
// e si possono riusare per un nuovo account. Le assegnazioni già fatte restano nel calendario (storico).
async function deleteUserAccount(req, res, { db, teamId, uid, profile }) {
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Solo un admin può eliminare un utente' })
  const targetUid = String(req.body?.targetUid || '')
  if (!targetUid) return res.status(400).json({ error: 'Utente mancante' })
  if (targetUid === uid) return res.status(400).json({ error: 'Non puoi eliminare il tuo stesso account', code: 'self' })

  const ref = db.collection('profiles').doc(targetUid)
  const target = (await ref.get()).data()
  if (!target || target.teamId !== teamId) return res.status(404).json({ error: 'Utente non trovato' })
  if (target.superAdmin) return res.status(403).json({ error: 'Questo account non si può eliminare', code: 'protected' })
  const team = (await db.collection('teams').doc(teamId).get()).data() || {}
  // Il creatore della squadra non si elimina; un altro admin lo toglie solo il creatore (come per la modifica)
  if (targetUid === team.createdByUid) return res.status(403).json({ error: 'Il creatore della squadra non si può eliminare', code: 'owner' })
  if (target.role === 'admin' && !profile?.superAdmin && team.createdByUid && team.createdByUid !== uid && !(team.ownerIds || []).includes(uid)) {
    return res.status(403).json({ error: 'Solo il creatore della squadra può eliminare un admin' })
  }

  try {
    await getAdmin().auth().deleteUser(targetUid)
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      console.error('[user-delete] auth', e.message)
      return res.status(502).json({ error: e.message })
    }
  }
  // Ripulisce prima i dati collegati, il profilo per ultimo: se qualcosa si ferma a metà, l'utente resta in elenco e si riprova.
  const tokens = await db.collection('pushTokens').where('userId', '==', targetUid).get()
  const batch = db.batch()
  tokens.docs.forEach(d => batch.delete(d.ref))
  batch.delete(db.collection('operatorBadges').doc(targetUid))
  batch.delete(ref)
  await batch.commit()
  return res.status(200).json({ ok: true })
}

// Prima di creare un account con questa email (o nome utente → email interna): se è tenuta da un account
// "orfano" (senza profilo) lo libera. Risponde `{ freed: true }` quando il tentativo si può ripetere.
async function reclaimEmail(req, res, { db, profile }) {
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Solo un admin' })
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email non valida', code: 'invalid-email' })
  try {
    const result = await removeOrphanAuthAccount(db, email)
    return res.status(200).json({ freed: result === 'removed' || result === 'none', inUse: result === 'in-use' })
  } catch (e) {
    console.error('[user-reclaim-email]', e.message)
    return res.status(502).json({ error: e.message })
  }
}

// Squadre create prima che esistesse il "creatore" (campo `createdByUid`, vedi src/utils/teamOwner.js): la prima
// volta che un admin apre l'app il creatore diventa l'admin con l'account più vecchio (mai un super admin).
// Idempotente e senza scelta di chi chiama: chiunque lo attivi, il risultato è lo stesso.
async function ensureOwner(req, res, { db, teamId: ownTeamId, profile }) {
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Solo un admin' })
  // Il super admin può farlo per la squadra in cui sta lavorando (modalità ghost); gli altri solo per la propria.
  const teamId = profile.superAdmin && req.body?.teamId ? String(req.body.teamId) : ownTeamId
  const ref = db.collection('teams').doc(teamId)
  try {
    const owner = await db.runTransaction(async tx => {
      const snap = await tx.get(ref)
      if (!snap.exists) return null
      if (snap.data().createdByUid) return snap.data().createdByUid
      const all = (await tx.get(db.collection('profiles').where('teamId', '==', teamId).where('role', '==', 'admin'))).docs
        .filter(p => p.data().approved !== false && p.data().active !== false)
      // Meglio un admin vero; solo se non c'è nessun altro, anche un super admin.
      const admins = (all.some(p => !p.data().superAdmin) ? all.filter(p => !p.data().superAdmin) : all)
        .sort((a, b) => String(a.data().createdAt || '9999').localeCompare(String(b.data().createdAt || '9999')))
      if (admins.length === 0) return null
      tx.update(ref, { createdByUid: admins[0].id })
      return admins[0].id
    })
    return res.status(200).json({ createdByUid: owner })
  } catch (e) {
    console.error('[user-ensure-owner]', e.message)
    return res.status(502).json({ error: e.message })
  }
}

// Nomina (o toglie) un altro admin come "creatore" della squadra (campo `ownerIds`): lo può fare solo un creatore.
// Il creatore originale (`createdByUid`) non si può togliere.
async function setOwner(req, res, { db, teamId, uid, profile }) {
  const ref = db.collection('teams').doc(teamId)
  const team = (await ref.get()).data() || {}
  const ownerIds = team.ownerIds || []
  const isOwnerNow = profile?.superAdmin || (profile?.role === 'admin' && (!team.createdByUid || team.createdByUid === uid || ownerIds.includes(uid)))
  if (!isOwnerNow) return res.status(403).json({ error: 'Solo il creatore della squadra può nominare altri creatori' })
  if (!team.createdByUid) return res.status(409).json({ error: 'La squadra non ha ancora un creatore', code: 'no-creator' })

  const targetUid = String(req.body?.targetUid || '')
  const makeOwner = req.body?.owner === true
  const target = targetUid ? (await db.collection('profiles').doc(targetUid).get()).data() : null
  if (!target || target.teamId !== teamId || target.role !== 'admin') return res.status(404).json({ error: 'Admin non trovato' })
  if (targetUid === team.createdByUid) return res.status(400).json({ error: 'Il creatore originale non si può togliere', code: 'original' })

  const next = makeOwner ? [...new Set([...ownerIds, targetUid])] : ownerIds.filter(id => id !== targetUid)
  await ref.update({ ownerIds: next })
  return res.status(200).json({ ownerIds: next })
}

// true se l'azione era "user-*" e la risposta è già stata data.
export async function handleUserAction(req, res, ctx) {
  if (req.body?.action === 'user-set-owner') { await setOwner(req, res, ctx); return true }
  if (req.body?.action === 'user-ensure-owner') { await ensureOwner(req, res, ctx); return true }
  if (req.body?.action === 'user-set-login-email') { await setLoginEmail(req, res, ctx); return true }
  if (req.body?.action === 'user-delete') { await deleteUserAccount(req, res, ctx); return true }
  if (req.body?.action === 'user-reclaim-email') { await reclaimEmail(req, res, ctx); return true }
  return false
}
