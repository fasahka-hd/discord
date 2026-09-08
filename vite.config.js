import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function discordUpgrade() {
  return {
    name: 'discord-upgrade-layer',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          { tag: 'link', attrs: { rel: 'stylesheet', href: '/src/discord-upgrade.css' }, injectTo: 'head' },
          { tag: 'script', attrs: { type: 'module', src: '/src/upgrade.js' }, injectTo: 'body' },
        ],
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), discordUpgrade()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true }
    },
    watch: {
      ignored: ['**/server/**', '**/data/**', '**/dist/**', '**/*.tmpdir/**', '**/*.tmp'],
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
})
