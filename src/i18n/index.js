import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import it from './locales/it.json'
import en from './locales/en.json'
import pt from './locales/pt.json'
import ar from './locales/ar.json'
import { RTL_LANGUAGES } from '../utils/formatDate'

i18n.use(initReactI18next).init({
  resources: { it: { translation: it }, en: { translation: en }, pt: { translation: pt }, ar: { translation: ar } },
  lng: 'it',
  fallbackLng: 'it',
  interpolation: { escapeValue: false },
})

// La pagina segue la lingua: attributo lang e, per l'arabo, direzione da destra a sinistra.
function applyLanguage(lng) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lng
  document.documentElement.dir = RTL_LANGUAGES.includes(lng) ? 'rtl' : 'ltr'
}
i18n.on('languageChanged', applyLanguage)
applyLanguage(i18n.language)

// Lingua del dispositivo per chi non ha un profilo (ospiti, link della postazione): italiano se non è una di queste.
export function detectDeviceLanguage() {
  const l = (typeof navigator !== 'undefined' ? navigator.language || '' : '').toLowerCase()
  if (l.startsWith('pt')) return 'pt'
  if (l.startsWith('ar')) return 'ar'
  if (l.startsWith('en')) return 'en'
  return 'it'
}

export default i18n
