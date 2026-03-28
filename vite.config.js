import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': { target: API, changeOrigin: true },
      '/parent-gate': { target: API, changeOrigin: true },
      '/parent_mode': { target: API, changeOrigin: true },
      '/lessons': { target: API, changeOrigin: true },
      '/me': { target: API, changeOrigin: true },
      '/parent': { target: API, changeOrigin: true },
      '/practice': { target: API, changeOrigin: true },
      '/shop': { target: API, changeOrigin: true },
      '/leaderboard': { target: API, changeOrigin: true },
      '/users': { target: API, changeOrigin: true },
      '/teacher': { target: API, changeOrigin: true },
      '/admin': { target: API, changeOrigin: true },
      '/classes': { target: API, changeOrigin: true },
      '/health': { target: API, changeOrigin: true },
      '/achievements': { target: API, changeOrigin: true },
    },
  },
})
