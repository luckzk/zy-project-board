import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev server proxies /api/ and /uploads/ to the local FastAPI backend
// (port 8001). In Docker the built app is served by nginx, which proxies
// both to backend:8001 — see frontend/nginx.conf (do not duplicate that
// here).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/uploads': {
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
