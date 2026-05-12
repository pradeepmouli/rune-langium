// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}', 'functions/test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
    setupFiles: ['./test/setup.ts']
  }
});
