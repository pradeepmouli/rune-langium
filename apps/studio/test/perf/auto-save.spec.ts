// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T006 — pre-migration auto-save perf baseline (SC-007 reference).
 *
 * For each of the five forms, types into one representative leaf field,
 * measures `(time of action call) − (time of input event)` over 10 runs,
 * computes the median, and writes the per-form baselines to
 * `apps/studio/test/perf/auto-save-baseline.json`.
 *
 * The baseline is the regression oracle for SC-007: post-migration
 * timing must be within ±50 ms of these medians.
 *
 * First-time setup:
 *   pnpm --filter @rune-langium/studio playwright test \
 *     apps/studio/test/perf/auto-save.spec.ts
 *
 * Run with `--reporter=list` for compact output. Commit the resulting
 * `auto-save-baseline.json` alongside this spec.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFormsBaseline, selectNode, type FormKind } from '../visual/fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, 'auto-save-baseline.json');
const RUNS = 10;

/** The leaf-field selector that drives the rename action for each kind. */
const RENAME_FIELD: Record<FormKind, string> = {
  data: '[data-testid="panel-inspector"] [data-slot="type-name-input"]',
  choice: '[data-testid="panel-inspector"] [data-slot="type-name-input"]',
  enum: '[data-testid="panel-inspector"] [data-slot="type-name-input"]',
  function: '[data-testid="panel-inspector"] [data-slot="type-name-input"]',
  typeAlias: '[data-testid="panel-inspector"] [data-slot="type-name-input"]'
};

/**
 * Drive the auto-save instrumentation embedded in
 * `packages/visual-editor/src/hooks/useAutoSave.ts`. Each commit emits a
 * `__z2fAutoSaveCommit__` window event with `{ kind, timestamp }`. We
 * subscribe before each run and time the gap.
 */
async function measureMedian(
  page: import('@playwright/test').Page,
  selector: string,
  inputValue: string
): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const inputAt = await page.evaluate(() => performance.now());
    await page.locator(selector).fill(`${inputValue}${i}`);
    const commitAt = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('auto-save commit timeout')), 3000);
          const handler = (e: Event) => {
            clearTimeout(timer);
            window.removeEventListener('__z2fAutoSaveCommit__', handler);
            resolve((e as CustomEvent<{ timestamp: number }>).detail.timestamp);
          };
          window.addEventListener('__z2fAutoSaveCommit__', handler);
        })
    );
    samples.push(commitAt - inputAt);
  }
  samples.sort((a, b) => a - b);
  // Median (10 runs → average of the 5th and 6th sorted values)
  return (samples[4]! + samples[5]!) / 2;
}

test.describe('Auto-save perf baseline', () => {
  test.setTimeout(120_000);

  test('records median commit latency for all five forms', async ({ page }) => {
    await loadFormsBaseline(page);

    const baseline: Record<string, { medianMs: number; runs: number }> = {};
    const KINDS: ReadonlyArray<FormKind> = ['data', 'choice', 'enum', 'function', 'typeAlias'];

    for (const kind of KINDS) {
      await selectNode(page, kind);
      const median = await measureMedian(page, RENAME_FIELD[kind], `${kind}Probe`);
      baseline[kind] = { medianMs: median, runs: RUNS };
    }

    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');

    // Sanity assertion: every median is below 5s (anything slower indicates
    // the instrumentation is broken, not a genuine perf regression).
    for (const [kind, { medianMs }] of Object.entries(baseline)) {
      expect(medianMs, `${kind} median`).toBeLessThan(5000);
    }
  });
});
