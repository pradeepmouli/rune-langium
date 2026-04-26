// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import z2fVite from '@zod-to-form/vite';
import { fileURLToPath } from 'url';

export default defineConfig({
  base: process.env.VITE_BASE_URL || (process.env.CF_PAGES === '1' ? '/rune-studio/studio/' : '/'),
  // Plugin order: z2fVite BEFORE react() per upstream's quickstart, so the
  // generated TSX flows through React's JSX transform normally.
  plugins: [z2fVite(), tailwindcss(), react()],
  optimizeDeps: {
    include: ['buffer']
  },
  // langium-zod's `dist/index.js` re-exports its CLI (`generate` from `cli.js`)
  // which runs `process.argv.slice(2)` at module-init. When vite optimises
  // the package the top-level CLI bytes execute in the browser and crash the
  // page with `process is not defined`. We're not running the CLI in-browser;
  // the smallest fix is to expose a no-op `process` shim so the CLI's
  // top-level guards short-circuit. This affects neither prod bundling nor
  // any code that actually wants Node's process at runtime.
  define: {
    'process.argv': '[]',
    'process.platform': '"browser"',
    'process.env': '{}',
    'process.exit': '(()=>{})',
    'process.cwd': '(()=>"/")',
    process: '({argv:[],platform:"browser",env:{},exit:()=>{},cwd:()=>"/"})'
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    dedupe: ['react', 'react-dom', '@xyflow/react']
  },
  server: {
    // Default 5173 (Vite convention, uncontested on macOS where AirPlay owns
    // :5000). `scripts/check-env.mjs` can pick a free fallback and export
    // STUDIO_DEV_PORT for both this config and playwright.config.ts.
    port: Number(process.env.STUDIO_DEV_PORT) || 5173,
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
