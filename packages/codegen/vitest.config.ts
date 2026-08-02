// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { defineConfig } from 'vitest/config';
import { decoratorLoweringPlugin } from './vitest-decorator-plugin.js';

export default defineConfig({
  plugins: [decoratorLoweringPlugin()],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**']
  }
});
