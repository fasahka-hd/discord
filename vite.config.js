import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
