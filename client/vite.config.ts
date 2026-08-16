import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 30 * 60 * 1000,
        proxyTimeout: 30 * 60 * 1000
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 30 * 60 * 1000,
        proxyTimeout: 30 * 60 * 1000
      }
    }
  }
});
