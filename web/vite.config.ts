import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.resolve(__dirname, '..');

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    open: false,
    // config/equipment.json лежит в корне репозитория
    fs: { allow: [repoRoot] },
    proxy: {
      // пригодится, когда появится API (VITE_DATA_SOURCE=live)
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
