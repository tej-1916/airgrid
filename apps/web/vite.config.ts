import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.AIRGRID_API_PROXY || 'http://127.0.0.1:8000';
const PORT = Number(process.env.AIRGRID_WEB_PORT || 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
      },
      '/healthz': {
        target: API,
        changeOrigin: true,
      },
    },
  },
});
