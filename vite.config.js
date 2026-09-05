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
      registerType: 'autoUpdate',
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
