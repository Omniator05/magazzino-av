// Categorie del magazzino, per squadra.
//
// L'elenco sta sul documento squadra (`team.categories`, array di { name, icon } nell'ordine
// scelto). Una squadra che non l'ha mai toccato usa DEFAULT_CATEGORIES: sono le categorie con cui
// l'app è nata, così nulla cambia per chi non le personalizza. Sugli oggetti la categoria resta
// il nome in chiaro (`item.category`), quindi nessun dato esistente va migrato.
//
// "Altro" non sta mai nell'elenco salvato: c'è sempre, per ultima, ed è dove finiscono gli oggetti
// la cui categoria non esiste (più). "Consumabili" è l'unica con un comportamento proprio (scorta
// minima, unità di misura, riordino): si può spostare ma non rinominare né togliere.

export const FALLBACK_CATEGORY = 'Altro'
export const CONSUMABLE_CATEGORY = 'Consumabili'
export const FALLBACK_ICON = '📦'
// Nomi che l'app usa per righe speciali (kit, righe extra scritte a mano): non si possono riusare.
export const RESERVED_NAMES = ['Altro', 'Kit', 'Extra']
export const MAX_CATEGORY_NAME = 24
export const MAX_CATEGORIES = 40

export const DEFAULT_CATEGORIES = [
  { name: 'Audio', icon: '🔊' },
  { name: 'Microfoni', icon: '🎤' },
  { name: 'Video', icon: '📺' },
  { name: 'Luci', icon: '🔦' },
  { name: 'Rigging', icon: '⛓️' },
  { name: 'Corrente', icon: '⚡' },
  { name: 'Effetti', icon: '🎉' },
  { name: 'Consumabili', icon: '🪣' },
  { name: 'Traduzione', icon: '🌐' },
  { name: 'Connettività', icon: '📶' },
  { name: 'Comunicazione', icon: '📡' },
  { name: 'Strumenti', icon: '🎸' },
]

// Icone di righe che non sono vere categorie, più i nomi delle vecchie categorie (ancora presenti
// su qualche oggetto o evento vecchio): servono solo per disegnare l'icona giusta.
const SYSTEM_ICONS = {
  Kit: '🧰', Extra: '✨', [FALLBACK_CATEGORY]: FALLBACK_ICON,
  'Console audio':'🎚️','Mixer':'🎛️','Amplificatore':'📡','Casse':'🔊','Subwoofer':'💥',
  'Microfono':'🎤','Cavo audio':'🔌','Cavo DMX':'🔗','Proiettore':'💡','LED bar':'🌈',
  'Par LED':'🔵','Moving head':'🎭','Dimmer':'🔆','Controller luci':'🎮',
  'Cavo elettrico':'⚡','Multipresa':'🔌','Flight case':'🧳','Stativi':'🪜',
  'Mixer Audio':'🎚️','Console Luci':'🕹️','Faro':'🔦','Ledwall':'📺',
  'Cavo XLR':'🎙️','Cavo Corrente':'⚡','Valigetta':'💼','Case':'🧳',
}

// Scelta di icone per le categorie nuove: oggetti da magazzino, non solo da palco.
export const ICON_CHOICES = [
  '📦','🔊','🎤','📺','🔦','⛓️','⚡','🎉','🪣','🌐','📶','📡','🎸','🎛️','🔌','🔧','🛠️','🧰','🪜','🧵','👕','👟','🪑','🛋️','🍽️','🥤','🎪','🏷️','📚','🧴','🧯','🚧','🎒','🎁','💡','🖥️','📷','🎬','🧪','🔋',
]

const clean = list => (Array.isArray(list) ? list : [])
  .filter(c => c && typeof c.name === 'string' && c.name.trim())
  .map(c => ({ name: c.name.trim(), icon: c.icon || FALLBACK_ICON }))

// Categorie scelte dalla squadra (senza "Altro"). Una lista salvata ma vuota vale come "nessuna
// personalizzazione": si torna alle predefinite invece di lasciare l'app senza categorie.
export function getTeamCategories(team) {
  const own = clean(team?.categories).filter(c => !RESERVED_NAMES.includes(c.name))
  return own.length > 0 ? own : DEFAULT_CATEGORIES
}

export const isCustomized = team => clean(team?.categories).length > 0

// Elenco completo da usare nell'app: le categorie della squadra più "Altro" in fondo.
export function resolveCategories(team) {
  return [...getTeamCategories(team), { name: FALLBACK_CATEGORY, icon: FALLBACK_ICON }]
}

// Icona di una categoria: quella scelta dalla squadra, altrimenti quella di sistema/storica.
export function iconFor(categories, name) {
  const found = categories.find(c => c.name === name)
  return found?.icon || SYSTEM_ICONS[name] || FALLBACK_ICON
}

// Un nome è già preso (senza distinguere maiuscole) o riservato?
export const isNameTaken = (list, name, exceptIndex = -1) => {
  const n = name.trim().toLowerCase()
  return RESERVED_NAMES.some(r => r.toLowerCase() === n)
    || list.some((c, i) => i !== exceptIndex && c.name.toLowerCase() === n)
}
