import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server proxies /api/ to the local FastAPI backend (port 8001).
// In Docker the built app is served by nginx, which proxies /api/ to
// backend:8001 — see frontend/nginx.conf (do not duplicate that here).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
})
