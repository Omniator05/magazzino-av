// Stessa identica logica di src/utils/workHours.js:todayStr — duplicata qui
// (non importata da src/) per lo stesso motivo di _googleCalendarSync.js: le
// funzioni in /api sono bundle serverless a sé, non condividono src/.
// Isomorfa rispetto all'ambiente (browser vs Node) ma NON rispetto al fuso
// orario: gira nel fuso del server Vercel (UTC), non in quello della squadra.
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
