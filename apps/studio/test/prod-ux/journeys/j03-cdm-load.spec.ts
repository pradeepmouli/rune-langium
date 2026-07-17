// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm, readOpLog } from '../fixtures.js';

test.describe('J03 — curated CDM load & unload', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J03 loads and unloads CDM, recording cdmLoad timing', async ({ page, evidence }) => {
    const cdmLoadStartedAt = Date.now();
    await loadCdm(page);
    const cdmLoadWallClockMs = Date.now() - cdmLoadStartedAt;
    await evidence.checkpoint('cdm-loaded');

    const opLog = await readOpLog(page);
    const modelLoadEntries = opLog.filter((e) => e.op === 'modelLoad' && e.subject === 'cdm');
    expect(
      modelLoadEntries.length,
      'expected a modelLoad op-log entry for the cdm subject (Task 6 instrumentation)'
    ).toBeGreaterThan(0);
    const successEntry = modelLoadEntries.find((e) => e.level === 'success');
    expect(successEntry?.durationMs, 'cdmLoad duration should be recorded').toBeGreaterThanOrEqual(0);

    // Budget check uses a test-side wall-clock stopwatch spanning the full
    // click-to-loaded UI transition (including the curated parse/link that
    // happens in App.tsx's model-change effect AFTER model-store's own
    // modelLoad span closes) rather than the opLog entry's durationMs, which
    // only covers the initial metadata fetch and can miss a slow/stuck parse.
    if (cdmLoadWallClockMs > 45000) {
      evidence.softFinding('cdmLoad-budget', `cdmLoad took ${cdmLoadWallClockMs}ms, over the 45s soft budget`);
    }

    await page.getByRole('button', { name: /Unload CDM/ }).click();
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('cdm-unloaded');
  });
});
