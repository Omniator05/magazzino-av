import { auth } from '../firebase'

// Email di accesso degli utenti. Un account può entrare in due modi:
//  - con l'email vera (nuovi utenti e quelli già passati): è anche l'email di Firebase Auth;
//  - con il nome utente (vecchi account e la Postazione): Firebase ha un'email finta
//    "nome@theservice.internal" (campo `internalEmail` del profilo).
// (un profilo senza `internalEmail` è un account creato con l'email vera: admin dalla registrazione, chi si è unito alla squadra)
export const isLegacyLogin = profile => !!profile && !profile.isStation && /@theservice\.internal$/i.test(profile.internalEmail || '')
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const isRealEmail = v => EMAIL_RE.test(String(v || '').trim())

// Chiede al server (solo admin) di cambiare l'email di accesso di un utente.
// Ritorna { ok: true } oppure { ok: false, code } con code = email-in-use | invalid-email | no-account | station | error.
export async function setLoginEmail(targetUid, email) {
  try {
    const idToken = await auth.currentUser.getIdToken()
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'user-set-login-email', targetUid, email }),
    })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true } : { ok: false, code: data.code || 'error', error: data.error }
  } catch {
    return { ok: false, code: 'error' }
  }
}

// "Password dimenticata?": non richiede login, risponde sempre allo stesso modo.
export async function requestPasswordReset(email) {
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'forgotPassword', email }),
    })
    return res.ok
  } catch { return false }
}
