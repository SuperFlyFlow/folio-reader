import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served from https://superflyflow.github.io/folio-reader/ in production.
const base = process.env.BASE_PATH ?? '/'
const build = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  base,
  define: { __BUILD__: JSON.stringify(build) },
  plugins: [
    react(),
    {
      // version.json lets installed copies notice a new deploy (it is never cached by the service worker).
      name: 'folio-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build }) })
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Folio',
        short_name: 'Folio',
        description: 'Your books, beautifully read.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mjs}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  server: { host: true, port: 5173 },
})
