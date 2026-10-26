import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url';
// Адрес ML-сервиса (каталог ml/). 127.0.0.1, а не localhost: Node может резолвить localhost в ::1,
// а uvicorn по умолчанию слушает IPv4.
const ML_TARGET = process.env.ML_PROXY_TARGET ?? 'http://127.0.0.1:8000'
const mlProxy = {
  '/ml': { target: ML_TARGET, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/ml/, '') },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: { proxy: mlProxy },
  preview: { proxy: mlProxy },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
