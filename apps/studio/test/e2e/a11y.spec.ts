// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T088 — axe-core a11y gate.
 *
 * Runs axe-core against the studio's main routes and FAILS the suite on
 * any 'serious' or 'critical' violation in code we own. The Monaco
 * editor surface and other third-party widgets inherit their upstream
 * a11y posture (FR-A04) and are excluded — gaps there are tracked as
 * known caveats, not as merge gates.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SELECTORS_TO_EXCLUDE = [
  // Monaco editor — third-party, large a11y debt that's upstream's
  // responsibility per FR-A04.
  '.monaco-editor',
  // Reactflow nodes — drag-drop graph; complementary keyboard nav lives
  // in the visual-editor package and is covered by its own tests.
  '.react-flow',
  // dockview's internal chrome (drag handles etc.) — its own a11y track.
  '.dockview-theme-light'
];

test.describe('Studio a11y (T088)', () => {
  test('home / start page passes axe-core (no serious/critical)', async ({ page }) => {
    await page.goto('/');
    const builder = new AxeBuilder({ page });
    for (const sel of SELECTORS_TO_EXCLUDE) builder.exclude(sel);
    const results = await builder.analyze();
    const blocking = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (blocking.length > 0) {
      console.log(JSON.stringify(blocking, null, 2));
    }
    expect(blocking).toEqual([]);
  });
});
