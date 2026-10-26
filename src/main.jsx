import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './i18n'
import './utils/staleChunk'

// Pagina ospite per il personale esterno (/ospite/<chiave>): sola lettura, senza
// login — si monta da sola, fuori da App (nessun provider, nessuna navigazione).
const GuestView = lazy(() => import('./pages/GuestView'))
const guestToken = (window.location.pathname.match(/^\/ospite\/([^/?#]+)/) || [])[1]
// Collegamento della postazione magazzino (/postazione/<chiave>): stessa idea, ma qui si fa l'accesso.
const StationConnect = lazy(() => import('./pages/StationConnect'))
const stationToken = (window.location.pathname.match(/^\/postazione\/([^/?#]+)/) || [])[1]

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {guestToken
      ? <Suspense fallback={null}><GuestView token={guestToken} /></Suspense>
      : stationToken
        ? <Suspense fallback={null}><StationConnect token={stationToken} /></Suspense>
        : <App />}
  </React.StrictMode>
)
