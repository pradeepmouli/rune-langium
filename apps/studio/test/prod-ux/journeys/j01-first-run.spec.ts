// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect } from '../fixtures.js';

test.describe('J01 — first run / start page', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J01 fresh load shows the start page with no console errors', async ({ page, evidence }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/Rune Studio/);
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('unsupported-viewport')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'CDM (Common Domain Model)' })).toBeVisible();
    await evidence.checkpoint('start-page');
  });
});
