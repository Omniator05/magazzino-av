// Collegamento della "Postazione magazzino" con un LINK (e il suo QR) invece di nome utente e password.
//
// Perché: il nome utente di un account è unico in tutto il sistema, non per azienda, quindi "postazione"
// poteva averlo una sola azienda. Qui la postazione non ha né nome utente né password: ogni azienda ha un
// link con una chiave casuale lunga, stampato e tenuto vicino al PC di magazzino. Aprirlo (o scansionarlo
// col lettore) collega il PC a QUELLA squadra e a nessun'altra: la chiave sta in `teamSecrets` (chiusa a
// tutti i client dalle regole Firestore) e rimanda a un solo account, quello della postazione della squadra.
//
// Vive qui e non in un endpoint a sé (limite di 12 funzioni del piano Hobby di Vercel): lo chiama push.js.
//   station-connect       pubblica (la chiave è la credenziale): { token, dryRun? } → nome squadra | token di accesso
//   station-link-get      admin: il link attuale (se c'è)
//   station-link-create   admin: crea l'account postazione se manca e un link nuovo (annulla il vecchio)
//   station-link-revoke   admin: annulla il link e fa uscire il PC collegato
import crypto from 'node:crypto'
import { getAdmin, requireTeamAdmin } from './_authAdmin.js'

const TOKEN_RE = /^[0-9a-f]{32}$/
const linkDocId = teamId => `stationlink_${teamId}`

// Stessa regola di src/utils/billing.js (isBillingValid): la postazione è dei piani a pagamento.
function isBillingValid(team) {
  const s = team?.billingStatus
  if (s === 'exempt' || s === 'active') return true
  if (s === 'trialing' && team.trialEndsAt) {
    const end = team.trialEndsAt.toDate ? team.trialEndsAt.toDate() : new Date(team.trialEndsAt)
    return end.getTime() > Date.now()
  }
  return false
}

async function findStation(db, teamId) {
  const snap = await db.collection('profiles').where('teamId', '==', teamId).where('isStation', '==', true).limit(1).get()
  return snap.empty ? null : { uid: snap.docs[0].id, data: snap.docs[0].data() }
}

async function connect(req, res) {
  const token = String(req.body?.token || '').trim().toLowerCase()
  if (!TOKEN_RE.test(token)) return res.status(404).json({ error: 'Link non valido', code: 'invalid' })
  try {
    const admin = getAdmin()
    const db = admin.firestore()
    const found = await db.collection('teamSecrets').where('stationToken', '==', token).limit(1).get()
    if (found.empty) return res.status(404).json({ error: 'Link non valido', code: 'invalid' })
    const link = found.docs[0].data()
    const [teamSnap, stationSnap] = await Promise.all([
      db.collection('teams').doc(link.teamId).get(),
      db.collection('profiles').doc(link.stationUid).get(),
    ])
    const station = stationSnap.data()
    if (!teamSnap.exists || !station || station.teamId !== link.teamId || station.active === false) {
      return res.status(404).json({ error: 'Link non valido', code: 'invalid' })
    }
    if (!isBillingValid(teamSnap.data())) return res.status(402).json({ error: 'La postazione richiede un piano a pagamento', code: 'paid-only' })
    if (req.body?.dryRun) return res.status(200).json({ teamName: teamSnap.data().name || '' })
    return res.status(200).json({ customToken: await admin.auth().createCustomToken(link.stationUid) })
  } catch (e) {
    console.error('[station-connect]', e.message)
    return res.status(502).json({ error: 'Errore del server', code: 'error' })
  }
}

async function getLink(req, res) {
  let ctx
  try { ctx = await requireTeamAdmin(req) } catch (e) { return res.status(e.status || 500).json({ error: e.message }) }
  const snap = await ctx.db.collection('teamSecrets').doc(linkDocId(ctx.teamId)).get()
  return res.status(200).json({ token: snap.exists ? snap.data().stationToken || null : null })
}

async function createLink(req, res) {
  let ctx
  try { ctx = await requireTeamAdmin(req) } catch (e) { return res.status(e.status || 500).json({ error: e.message }) }
  const { db, team, teamId } = ctx
  if (!isBillingValid(team)) return res.status(402).json({ error: 'La postazione richiede un piano a pagamento', code: 'paid-only' })
  const admin = getAdmin()

  // L'account della postazione c'è già (anche uno vecchio, con nome utente): si riusa, senza toccarlo.
  let station = await findStation(db, teamId)
  if (!station) {
    const created = await admin.auth().createUser({ displayName: 'Postazione magazzino' })
    try {
      await db.collection('profiles').doc(created.uid).set({
        name: 'Postazione magazzino',
        username: null, internalEmail: null, email: null,
        // Come le altre postazioni: un magazziniere con l'etichetta isStation (stesse regole e pagine).
        role: 'worker', isStation: true, loginByLink: true,
        teamId, approved: true, active: true,
        createdAt: new Date().toISOString(),
      })
    } catch (e) {
      await admin.auth().deleteUser(created.uid).catch(() => {})
      throw e
    }
    station = { uid: created.uid }
  }

  const token = crypto.randomBytes(16).toString('hex')
  await db.collection('teamSecrets').doc(linkDocId(teamId)).set({
    teamId, stationUid: station.uid, stationToken: token, createdAt: new Date().toISOString(),
  })
  // Un link nuovo annulla il vecchio: chi era collegato col vecchio deve ricollegarsi col nuovo.
  await admin.auth().revokeRefreshTokens(station.uid).catch(() => {})
  return res.status(200).json({ token })
}

async function revokeLink(req, res) {
  let ctx
  try { ctx = await requireTeamAdmin(req) } catch (e) { return res.status(e.status || 500).json({ error: e.message }) }
  const { db, teamId } = ctx
  const ref = db.collection('teamSecrets').doc(linkDocId(teamId))
  const snap = await ref.get()
  if (snap.exists) {
    await getAdmin().auth().revokeRefreshTokens(snap.data().stationUid).catch(() => {})
    await ref.delete()
  }
  return res.status(200).json({ ok: true })
}

// true se l'azione era "station-*" e la risposta è già stata data.
export async function handleStationAction(req, res) {
  const a = req.body?.action
  if (a === 'station-connect') { await connect(req, res); return true }
  if (a === 'station-link-get') { await getLink(req, res); return true }
  if (a === 'station-link-create') { await createLink(req, res); return true }
  if (a === 'station-link-revoke') { await revokeLink(req, res); return true }
  return false
}
