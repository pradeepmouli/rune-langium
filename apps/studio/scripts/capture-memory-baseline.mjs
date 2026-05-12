#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Capture studio browser memory baseline (019 Phase 2, Task 2.7).
 *
 * Boots a chromium with --enable-precise-memory-info, loads the studio,
 * waits for the workspace-loaded marker, then reads
 * performance.memory.usedJSHeapSize after a short settling delay.
 *
 * Outputs JSON: { heapBytes, url, capturedAt }
 *
 * Usage:
 *   STUDIO_URL=http://localhost:5173/?fixture=cdm \
 *     pnpm --filter @rune-langium/studio exec node scripts/capture-memory-baseline.mjs
 *
 * The captured value should be recorded in
 * .github/workflows/ci.yml or repo variables (STUDIO_MEMORY_BASELINE_BYTES)
 * so the memory-baseline e2e gate can compare against it.
 */

import { chromium } from 'playwright';

const url = process.env.STUDIO_URL ?? 'http://localhost:5173/?fixture=cdm';
const readinessSelector = process.env.STUDIO_READINESS_SELECTOR ?? '[data-testid="workspace-loaded"]';
const readinessTimeoutMs = Number(process.env.STUDIO_READINESS_TIMEOUT_MS ?? 60_000);
const settleMs = Number(process.env.STUDIO_SETTLE_MS ?? 2000);

const browser = await chromium.launch({
  args: ['--enable-precise-memory-info', '--no-sandbox', '--disable-dev-shm-usage']
});
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(readinessSelector, { timeout: readinessTimeoutMs });
  await page.waitForTimeout(settleMs);
  const heapBytes = await page.evaluate(() => {
    const m = /** @type {{ memory?: { usedJSHeapSize?: number } }} */ (performance).memory;
    return typeof m?.usedJSHeapSize === 'number' ? m.usedJSHeapSize : 0;
  });
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({ heapBytes, url, capturedAt: new Date().toISOString() }, null, 2)
  );
} finally {
  await browser.close();
}
