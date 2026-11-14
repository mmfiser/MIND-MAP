/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

/** Označení buildu: datum a čas sestavení + zkrácený git commit. */
function buildVersion(): string {
  let sha = '';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    /* mimo git */
  }
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return sha ? `${ts} UTC (${sha})` : `${ts} UTC`;
}

/**
 * Přísná Content-Security-Policy – vkládá se jen do produkčního buildu
 * (vývojový server Vite potřebuje inline skripty a WebSocket pro HMR).
 *
 * style-src 'unsafe-inline' je nutné kvůli inline atributům `style`,
 * které používá React Flow pro pozicování uzlů a hran.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'mapa-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  // Při nasazení na GitHub Pages předává workflow --base=/<repo>/ ; lokálně '/'.
  base: process.env.VITE_BASE ?? '/',
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
  },
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      // Jen service worker pro offline mezipaměť – žádný manifest, žádná instalace.
      manifest: false,
      injectRegister: 'script',
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Nová verze aplikace se použije hned při dalším načtení stránky.
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
