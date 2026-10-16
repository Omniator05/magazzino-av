// Tema dell'app: 'auto' (predefinito: segue il sistema), 'light' oppure 'dark'.
// La scelta sta in localStorage (per dispositivo) e il tema effettivo viene
// scritto in <html data-theme="light|dark">, da cui leggono tutti i token CSS
// (vedi src/index.css). La stessa logica è replicata in poche righe nello
// script di index.html, così il tema giusto c'è già al primo paint.
const KEY = 'rcTheme'
const THEME_COLOR = { light: '#f5f5f3', dark: '#121211' }

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function resolveTheme(pref = getThemePref()) {
  if (pref === 'auto') {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

export function applyTheme(pref = getThemePref()) {
  const theme = resolveTheme(pref)
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[theme])
  return theme
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref) } catch { /* nessun problema: vale per questa sessione */ }
  return applyTheme(pref)
}

// Con 'auto' il tema segue i cambi del sistema anche ad app aperta.
export function watchSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => { if (getThemePref() === 'auto') applyTheme('auto') }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
