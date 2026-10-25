import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Three PWAs from one Vite project: customer at /, driver at /driver/, ops dashboard at /admin/.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
  build: {
    rollupOptions: {
      input: {
        user: resolve(import.meta.dirname, 'index.html'),
        driver: resolve(import.meta.dirname, 'driver/index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
});
