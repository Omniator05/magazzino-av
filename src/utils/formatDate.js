const LOCALES = { it: 'it-IT', en: 'en-US' }

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
