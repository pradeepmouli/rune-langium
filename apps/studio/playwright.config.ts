// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Covers test/e2e (existing), test/visual (013-z2f-editor-migration T003),
  // and test/perf (013-z2f-editor-migration T006). Subdirs are scoped via
  // glob-based test paths in the CLI when a single suite is wanted.
  testDir: './test',
  testMatch: ['e2e/**/*.spec.ts', 'visual/**/*.spec.ts', 'perf/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: false,
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
  timeout: 30000,
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      `http://localhost:${Number(process.env.STUDIO_DEV_PORT) || 5173}`,
    trace: 'on-first-retry'
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Must match apps/studio/vite.config.ts server.port. Both default to
        // 5173 and honour STUDIO_DEV_PORT when set by scripts/check-env.mjs.
        command: 'pnpm run dev',
        port: Number(process.env.STUDIO_DEV_PORT) || 5173,
        reuseExistingServer: true,
        timeout: 60000
      },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage'
          ]
        }
      }
    }
  ]
});
