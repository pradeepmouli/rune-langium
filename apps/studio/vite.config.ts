import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173
  },
  build: {
    target: 'es2020',
    outDir: 'dist'
  },
  worker: {
    format: 'es'
  }
});
