import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3400,
    proxy: {
      '/api': 'http://localhost:3399',
      '/ws': { target: 'ws://localhost:3399', ws: true },
      '/media': 'http://localhost:3399',
    },
  },
});
