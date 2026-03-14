import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    dedupe: ['react', 'react-dom', '@xyflow/react']
  },
  server: {
    port: 5000,
    host: '0.0.0.0',
    allowedHosts: true
  },
  build: {
    target: 'es2020',
    outDir: 'dist'
  },
  worker: {
    format: 'es'
  }
});
