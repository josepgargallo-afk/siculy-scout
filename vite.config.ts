import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Siculy Scout',
        short_name: 'Scout',
        description: 'Captura de proveedores y clientes en ferias. Datos locales, sin servidores.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        // Android: «Compartir → Siculy Scout» desde el visor de archivos o el navegador (vCard o enlace).
        share_target: {
          action: './share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title', text: 'text', url: 'url',
            files: [{ name: 'file', accept: ['text/vcard', 'text/x-vcard', 'text/directory', '.vcf', 'text/plain'] }],
          },
        },
        background_color: '#0f2a3d',
        theme_color: '#0f2a3d',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // Los recursos OCR (pesados) NO se precachean: se descargan bajo demanda
        // desde Ajustes ("Preparar OCR sin conexión") y se guardan en la caché 'scout-ocr'.
        globIgnores: ['ocr/**', 'ort/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        importScripts: ['share-target-sw.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/ort/'),
            handler: 'CacheFirst',
            options: { cacheName: 'scout-ort' },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: 'scout-ocr', rangeRequests: false },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/__tests__/**/*.test.ts'] },
});
