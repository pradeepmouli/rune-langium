// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: ['prod-smoke/**/*.spec.ts', 'prod-ux/journeys/**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: false,
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
  timeout: 120000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://www.daikonic.dev/rune-studio/studio/',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
        }
      }
    }
  ]
});
