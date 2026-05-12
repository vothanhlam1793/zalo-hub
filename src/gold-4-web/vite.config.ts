import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: '../../dist/gold-4-web',
    emptyOutDir: true,
  },
  server: {
    port: 3400,
    proxy: {
      '/api': 'http://localhost:3399',
      '/ws': { target: 'ws://localhost:3399', ws: true },
    },
  },
});
