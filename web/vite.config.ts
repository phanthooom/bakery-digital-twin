import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.resolve(__dirname, '..');

const recentOrders: unknown[] = [];

function orderWebhookPlugin(): Plugin {
  return {
    name: 'order-webhook-plugin',
    configureServer(server) {
      server.middlewares.use('/api/orders', (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const order = JSON.parse(body);
              recentOrders.unshift(order);
              if (recentOrders.length > 50) recentOrders.pop();
              server.ws.send({ type: 'custom', event: 'telegram-order', data: order });
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, orderId: order.orderId }));
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            }
          });
          return;
        }

        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify(recentOrders));
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), orderWebhookPlugin()],
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
