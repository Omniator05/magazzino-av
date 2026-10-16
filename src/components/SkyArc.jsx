// Cielo stilizzato per l'header delle due home (admin e magazziniere): sole o
// luna, a tratto sottile in un giallo tenue, che percorrono un arco da sinistra a
// destra durante il giorno/la notte DIETRO al testo, con nuvole, pioggia,
// neve o nebbia in base al meteo. La posizione si calcola dall'ora di apertura
// della pagina (non si muove sotto gli occhi). L'header che lo ospita deve
// avere `position: relative; overflow: hidden`.
const INK = { sun: '#f0bd2c', moon: '#e6cf7a', cloud: '#b6bcc6', rain: '#9fb5ca', storm: '#aca6cb', snow: '#b9cde0', fog: '#c3c3bd' }
const CLOUD = 'M7 18a5 5 0 1 1 1-9.9 6 6 0 0 1 11.5 2.4A3.8 3.8 0 0 1 18 18H7z'
const svgBase = (size, color) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true })

export const weatherCond = code => {
  const c = code ?? -1
  if (c < 0 || c <= 1) return 'clear'
  if (c === 2) return 'partly'
  if (c === 3) return 'overcast'
  if (c === 45 || c === 48) return 'fog'
  if (c >= 71 && c <= 77) return 'snow'
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain'
  if (c >= 95) return 'storm'
  return 'clear'
}

// Sole o luna.
function SkyBody({ isDay, size }) {
  return isDay ? (
    <svg {...svgBase(size, INK.sun)}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></svg>
  ) : (
    <svg {...svgBase(size, INK.moon)}><path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z" /></svg>
  )
}

// Nuvole / pioggia / neve / nebbia che coprono (o affiancano) il corpo celeste.
function SkyCover({ cond, size }) {
  if (cond === 'rain') return <svg {...svgBase(size, INK.rain)}><path d={CLOUD} transform="translate(0 -3)" /><path d="M8 17.5l-1 3M12 17.5l-1 3M16 17.5l-1 3" /></svg>
  if (cond === 'storm') return <svg {...svgBase(size, INK.storm)}><path d={CLOUD} transform="translate(0 -3)" /><path d="M12.5 14l-2.2 3.4h3L11.3 21" /></svg>
  if (cond === 'snow') return <svg {...svgBase(size, INK.snow)}><path d={CLOUD} transform="translate(0 -3)" /><path d="M8 18.5v.01M12 20v.01M16 18.5v.01M10 21v.01M14 21v.01" /></svg>
  if (cond === 'fog') return <svg {...svgBase(size, INK.fog)}><path d="M4 8h16M6 12h14M4 16h16M7 20h11" /></svg>
  return <svg {...svgBase(size, INK.cloud)}><path d={CLOUD} /></svg>
}

export default function SkyArc({ weather, isMobile }) {
  const now = new Date()
  const hour = now.getHours()
  const hourFrac = hour + now.getMinutes() / 60
  const isDay = hour >= 6 && hour < 20
  const cond = weatherCond(weather?.code)
  // Posizione sull'arco: di giorno 06→20, di notte 20→06; da sinistra (inizio) a destra (fine).
  const progress = Math.min(Math.max(isDay ? (hourFrac - 6) / 14 : (hourFrac >= 20 ? hourFrac - 20 : hourFrac + 4) / 10, 0), 1)
  const x = 12 + progress * 68
  const y = 66 - Math.sin(progress * Math.PI) * 38
  const size = isMobile ? 48 : 64
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <div style={{ opacity: cond === 'clear' ? 0.75 : cond === 'partly' ? 0.7 : 0.35 }}><SkyBody isDay={isDay} size={size} /></div>
        {cond !== 'clear' && (
          <div style={cond === 'partly'
            ? { position: 'absolute', right: -size * 0.22, bottom: -size * 0.2, opacity: 0.8 }
            : { position: 'absolute', inset: 0, opacity: 0.8 }}>
            <SkyCover cond={cond} size={cond === 'partly' ? size * 0.78 : size} />
          </div>
        )}
      </div>
    </div>
  )
}
