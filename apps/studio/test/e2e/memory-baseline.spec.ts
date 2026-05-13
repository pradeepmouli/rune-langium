// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Studio browser memory regression guard (019 Phase 2, Task 2.7).
 *
 * Implements US2 acceptance criterion #7: after the studio loads the
 * CDM fixture corpus, performance.memory.usedJSHeapSize must not
 * exceed the captured baseline by more than HEADROOM_PCT.
 *
 * The baseline is set via the STUDIO_MEMORY_BASELINE_BYTES env var
 * (configured in CI as vars.STUDIO_MEMORY_BASELINE_BYTES). When the
 * var is unset, the test SKIPS — there's no meaningful comparison
 * without a recorded baseline. The CI workflow MUST set the var
 * before this gate is enforceable.
 *
 * Capture procedure (one-shot, recorded in the repo's CI variables):
 *   1. Boot the studio at the current HEAD.
 *   2. Run `pnpm --filter @rune-langium/studio exec node
 *      scripts/capture-memory-baseline.mjs` against the CDM fixture URL.
 *   3. Set STUDIO_MEMORY_BASELINE_BYTES in repo vars to the heapBytes
 *      value plus a small headroom (e.g., +0%) — the regression gate
 *      below adds HEADROOM_PCT on top.
 */

import { expect, test } from '@playwright/test';

const BASELINE = Number(process.env.STUDIO_MEMORY_BASELINE_BYTES ?? '0');
const HEADROOM_PCT = 5;
const READINESS_SELECTOR = process.env.STUDIO_READINESS_SELECTOR ?? '[data-testid="workspace-loaded"]';
const FIXTURE_PATH = process.env.STUDIO_FIXTURE_PATH ?? '/?fixture=cdm';

test.describe('Studio browser memory regression', () => {
  test.skip(BASELINE === 0, 'STUDIO_MEMORY_BASELINE_BYTES not set');

  test('used JS heap after CDM workspace load is within baseline + headroom', async ({ page }) => {
    await page.goto(FIXTURE_PATH);
    await page.waitForSelector(READINESS_SELECTOR, { timeout: 60_000 });
    // Let GC settle before sampling.
    await page.waitForTimeout(2000);

    const heap = await page.evaluate(() => {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
      return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : 0;
    });

    expect(heap, 'performance.memory.usedJSHeapSize must be available').toBeGreaterThan(0);

    const max = Math.floor(BASELINE * (1 + HEADROOM_PCT / 100));
    // eslint-disable-next-line no-console
    console.log(
      `Memory: heap=${heap.toLocaleString()} bytes, baseline=${BASELINE.toLocaleString()}, max=${max.toLocaleString()} (headroom ${HEADROOM_PCT}%)`
    );
    expect(heap, `heap ${heap} exceeds baseline+${HEADROOM_PCT}% (${max})`).toBeLessThanOrEqual(max);
  });
});
