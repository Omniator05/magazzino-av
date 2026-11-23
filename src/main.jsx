import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './i18n'
import './utils/staleChunk'

// Collegamento della postazione magazzino (/postazione/<chiave>): stessa idea, ma qui si fa l'accesso.
const StationConnect = lazy(() => import('./pages/StationConnect'))
const stationToken = (window.location.pathname.match(/^\/postazione\/([^/?#]+)/) || [])[1]

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {stationToken
      ? <Suspense fallback={null}><StationConnect token={stationToken} /></Suspense>
      : <App />}
  </React.StrictMode>
)
