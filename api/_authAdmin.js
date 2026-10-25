// Helper condiviso da tutte le API server-side che devono verificare "chi
// chiama è admin della propria squadra" (Stripe, invio email...) — stessa
// identica inizializzazione firebase-admin già usata in sync-google-calendar.js
// (un solo service account, una sola inizializzazione per funzione serverless).
import admin from 'firebase-admin'

export function getAdmin() {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  }
  return admin
}

// Verifica il token Firebase dell'utente che chiama e conferma che sia admin
// della propria squadra. Lancia un errore con `.status` se qualcosa non va,
// così il chiamante può rispondere con lo status HTTP corretto.
export async function requireTeamAdmin(req) {
  const idToken = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!idToken) { const e = new Error('Token mancante'); e.status = 401; throw e }

  const fbAdmin = getAdmin()
  let decoded
  try {
    decoded = await fbAdmin.auth().verifyIdToken(idToken)
  } catch {
    const e = new Error('Token non valido'); e.status = 401; throw e
  }

  const db = fbAdmin.firestore()
  const profileSnap = await db.collection('profiles').doc(decoded.uid).get()
  const profile = profileSnap.data()
  if (!profile || profile.role !== 'admin') {
    const e = new Error('Azione riservata agli admin'); e.status = 403; throw e
  }

  const teamRef = db.collection('teams').doc(profile.teamId)
  const teamSnap = await teamRef.get()
  if (!teamSnap.exists) { const e = new Error('Squadra non trovata'); e.status = 404; throw e }

  return { db, teamRef, team: teamSnap.data(), teamId: profile.teamId, uid: decoded.uid, profile }
}

// Come requireTeamAdmin, ma solo per il creatore della squadra (abbonamento e pagamenti). Le squadre senza
// `createdByUid` (create prima che esistesse) non hanno un creatore: lì vale ogni admin, come sempre.
export async function requireTeamOwner(req) {
  const ctx = await requireTeamAdmin(req)
  // Il super admin vale sempre come il creatore.
  if (!ctx.profile.superAdmin && ctx.team.createdByUid && ctx.team.createdByUid !== ctx.uid && !(ctx.team.ownerIds || []).includes(ctx.uid)) {
    const e = new Error('Solo il creatore della squadra può gestire l\'abbonamento'); e.status = 403; throw e
  }
  return ctx
}

// Come requireTeamAdmin ma per endpoint che qualunque membro approvato della
// squadra può chiamare (es. un worker che segnala un'assenza) — non solo
// l'admin. Stessa verifica del token, ruolo non filtrato.
export async function requireTeamMember(req) {
  const idToken = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!idToken) { const e = new Error('Token mancante'); e.status = 401; throw e }

  const fbAdmin = getAdmin()
  let decoded
  try {
    decoded = await fbAdmin.auth().verifyIdToken(idToken)
  } catch {
    const e = new Error('Token non valido'); e.status = 401; throw e
  }

  const db = fbAdmin.firestore()
  const profileSnap = await db.collection('profiles').doc(decoded.uid).get()
  const profile = profileSnap.data()
  if (!profile || profile.approved === false || profile.active === false) {
    const e = new Error('Accesso non consentito'); e.status = 403; throw e
  }

  const teamRef = db.collection('teams').doc(profile.teamId)
  const teamSnap = await teamRef.get()
  if (!teamSnap.exists) { const e = new Error('Squadra non trovata'); e.status = 404; throw e }

  return { db, teamRef, team: teamSnap.data(), teamId: profile.teamId, profile, uid: decoded.uid }
}
