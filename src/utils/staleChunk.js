// Dopo un aggiornamento dell'app, una pagina rimasta aperta dalla versione precedente può non trovare più i file
// "a pezzi" (es. Inventory-AbC123.js): il browser dà "Failed to fetch dynamically imported module". Basta
// ricaricare per prendere la versione nuova. Qui lo si fa da soli, una volta sola (se riprova a fallire non si
// entra in un ciclo): si tolgono il service worker e le copie in cache, così il ricaricamento parte pulito.
const KEY = 'rcStaleChunkReload'

export const isStaleChunkError = err => /dynamically imported module|importing a module script failed|error loading dynamically imported module/i.test(String(err?.message || err || ''))

export async function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 60000) return false          // già provato da poco: non si ripete
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch { /* senza memoria della sessione si prova comunque una volta */ }
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.()
    await Promise.all((regs || []).map(r => r.unregister()))
    if (window.caches) await Promise.all((await window.caches.keys()).map(k => window.caches.delete(k)))
  } catch { /* si ricarica lo stesso */ }
  window.location.reload()
  return true
}

if (typeof window !== 'undefined') {
  // Vite lancia questo evento quando non riesce a scaricare un pezzo dell'app.
  window.addEventListener('vite:preloadError', e => { e.preventDefault(); reloadForNewVersion() })
}
