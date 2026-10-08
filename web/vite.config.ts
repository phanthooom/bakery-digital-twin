import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.resolve(__dirname, '..');

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // README обещает именно :5173 — если порт занят, лучше явная ошибка, чем тихий переезд
    strictPort: true,
    open: false,
    // config/equipment.json лежит в корне репозитория
    fs: { allow: [repoRoot] },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    // SINGLE_FILE=1 — один JS-файл без отдельных чанков (для страницы-демо одним HTML)
    rollupOptions: process.env.SINGLE_FILE ? { output: { inlineDynamicImports: true } } : {},
  },
});
