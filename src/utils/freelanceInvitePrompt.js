// "Non mostrare più" della domanda "Freelance inserito, aggiungi l'email?" (GuestInvitePrompt): preferenza
// di questo dispositivo, come il tema. Letta e scritta in sicurezza: con la memoria del browser bloccata
// la domanda semplicemente continua a comparire.
const MUTE_KEY = 'rcGuestInviteHint'
export function isInvitePromptMuted() {
  try { return localStorage.getItem(MUTE_KEY) === 'off' } catch { return false }
}
export function muteInvitePrompt() {
  try { localStorage.setItem(MUTE_KEY, 'off') } catch { /* niente da fare */ }
}
