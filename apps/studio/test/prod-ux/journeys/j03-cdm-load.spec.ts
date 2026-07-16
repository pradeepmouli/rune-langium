// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm, readOpLog } from '../fixtures.js';

test.describe('J03 — curated CDM load & unload', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J03 loads and unloads CDM, recording cdmLoad timing', async ({ page, evidence }) => {
    await loadCdm(page);
    await evidence.checkpoint('cdm-loaded');

    const opLog = await readOpLog(page);
    const modelLoadEntries = opLog.filter((e) => e.op === 'modelLoad' && e.subject === 'cdm');
    expect(
      modelLoadEntries.length,
      'expected a modelLoad op-log entry for the cdm subject (Task 6 instrumentation)'
    ).toBeGreaterThan(0);
    const successEntry = modelLoadEntries.find((e) => e.level === 'success');
    expect(successEntry?.durationMs, 'cdmLoad duration should be recorded').toBeGreaterThanOrEqual(0);
    if ((successEntry?.durationMs ?? 0) > 45000) {
      evidence.softFinding('cdmLoad-budget', `cdmLoad took ${successEntry?.durationMs}ms, over the 45s soft budget`);
    }

    await page.getByRole('button', { name: /Unload CDM/ }).click();
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('cdm-unloaded');
  });
});
