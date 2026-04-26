// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T003 — pre-migration visual baseline for the five top-level editor forms.
 *
 * Captures one screenshot per form kind (Data, Choice, Enum, Function,
 * TypeAlias) of the inspector panel. The first run produces the SC-004
 * reference set; subsequent runs (once the migration starts) compare
 * against it.
 *
 * First-time setup:
 *   pnpm --filter @rune-langium/studio playwright test \
 *     apps/studio/test/visual/forms.spec.ts --update-snapshots
 *
 * Then commit `apps/studio/test/visual/__screenshots__/forms.spec.ts/`.
 */

import { test, expect } from '@playwright/test';
import {
  INSPECTOR_FORM_ROOT,
  NODES_BY_KIND,
  loadFormsBaseline,
  selectNode,
  type FormKind
} from './fixtures.js';

const KINDS: ReadonlyArray<FormKind> = Object.keys(NODES_BY_KIND) as FormKind[];

test.describe('Editor form visual baseline', () => {
  test.setTimeout(60_000);

  for (const kind of KINDS) {
    test(`baseline — ${kind} form`, async ({ page }) => {
      await loadFormsBaseline(page);
      await selectNode(page, kind);

      const inspector = page.locator(INSPECTOR_FORM_ROOT);
      await expect(inspector).toBeVisible();

      // Per-kind screenshot. Tolerance defaults to Playwright's pixel-diff
      // threshold; tighten with `maxDiffPixelRatio` only after validating
      // the baseline is stable across reruns.
      await expect(inspector).toHaveScreenshot(`${kind}-baseline.png`, {
        maxDiffPixelRatio: 0.01,
        animations: 'disabled'
      });
    });
  }
});
