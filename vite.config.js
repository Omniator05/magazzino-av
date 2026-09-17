import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// Hash del commit corrente, incorporato in build: usato per mostrare un
// popup "aggiornamento riuscito" al primo avvio dopo un nuovo deploy (vedi
// src/components/UpdateToast.jsx). VERCEL_GIT_COMMIT_SHA copre il build su
// Vercel; git rev-parse copre il build locale. Se nessuno dei due è
// disponibile (es. zip senza storia git) il popup resta semplicemente
// disattivato, non è un dato critico.
const appVersion = process.env.VERCEL_GIT_COMMIT_SHA || (() => {
  try { return execSync('git rev-parse HEAD').toString().trim() } catch { return '' }
})()

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' invece di 'autoUpdate': con autoUpdate il nuovo service
      // worker si attivava da solo e ricaricava la pagina senza preavviso —
      // rischioso a metà di una lista di carico in magazzino. Con 'prompt'
      // il nuovo SW resta in attesa finché UpdateAvailableBanner.jsx (montato
      // in App.jsx) non lo dice esplicitamente, tramite updateSW(true) da
      // virtual:pwa-register — l'utente decide quando ricaricare, non l'app.
      registerType: 'prompt',
      // Senza questo, in `npm run dev` il plugin non genera/serve
      // manifest.webmanifest né il service worker: la richiesta del browser
      // cade sul fallback SPA di Vite (index.html), e provare a parsare HTML
      // come JSON dà il "Manifest: Line 1, column 1, Syntax error" in
      // console — solo rumore in dev, la build reale non ne risente, ma
      // abilitarlo qui lo elimina e permette di testare la PWA anche in locale.
      devOptions: { enabled: true },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Roadcase',
        short_name: 'Roadcase',
        description: 'Gestione attrezzatura audio/luci per eventi',
        lang: 'it',
        // Tema chiaro (vedi index.html/App.jsx): questo manifest, generato da
        // VitePWA a partire da questo oggetto, SOVRASCRIVE in build qualunque
        // modifica fatta a mano su public/manifest.webmanifest — è l'unica
        // fonte di verità reale per lo splash nativo mostrato all'avvio della
        // PWA installata, prima che qualunque riga della nostra app parta.
        theme_color: '#e63946',
        background_color: '#f5f5f3',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'firebase-cache', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 } }
          }
        ]
      }
    })
  ]
})
