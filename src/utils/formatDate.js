// Lingue dell'app. Arabo con cifre latine (0-9): più leggibili per date e orari accanto ai numeri del resto dell'app.
// Portoghese europeo; la maggior parte delle parole coincide con quello brasiliano.
const LOCALES = { it: 'it-IT', en: 'en-US', pt: 'pt-PT', ar: 'ar-u-nu-latn' }
export const RTL_LANGUAGES = ['ar']

export function localeFor(lang) {
  return LOCALES[lang] || LOCALES.it
}

// Wrapper attorno a toLocaleDateString che sceglie il locale in base alla lingua attiva
export function formatDate(date, options, lang) {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString(localeFor(lang), options)
}

// I nomi di giorni/mesi da toLocaleDateString sono minuscoli in italiano
export function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str
}

// Nomi dei 12 mesi (per esteso, con l'iniziale maiuscola) e iniziali dei giorni da lunedì a domenica, nella lingua attiva:
// servono ai calendari a tendina (DateField, DateRangeField, MultiDateField).
export function monthNames(lang) {
  return Array.from({ length: 12 }, (_, m) => capitalize(new Date(2024, m, 1, 12).toLocaleDateString(localeFor(lang), { month: 'long' })))
}
export function weekdayInitials(lang) {
  return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i, 12).toLocaleDateString(localeFor(lang), { weekday: 'narrow' }))
}
