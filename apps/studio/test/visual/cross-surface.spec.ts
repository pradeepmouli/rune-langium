// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T063 (014/Phase-8 / US7) — visual cross-surface assertions.
 *
 * Phase 8's spec promises the Studio start page renders with the same
 * primitives as the landing site and the docs theme: Outfit body font,
 * 8px primary-button radius, transparent secondary buttons (NOT amber).
 * This Playwright spec asserts those properties via `page.evaluate`
 * against the live computed style — independent of the form-baseline
 * screenshot suite, which is for component-level regressions.
 *
 * First-time setup: `pnpm --filter @rune-langium/studio exec playwright
 * test apps/studio/test/visual/cross-surface.spec.ts --update-snapshots`
 * (no screenshots are required today, but the spec leaves room).
 */

import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'sm-laptop', width: 1280, height: 800 },
  { name: 'md-laptop', width: 1440, height: 900 }
] as const;

test.describe('Cross-surface UX consistency (T063 / US7)', () => {
  for (const viewport of VIEWPORTS) {
    test(`start page primitives at ${viewport.name} (${viewport.width}×${viewport.height})`, async ({
      page
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('./');
      await page.waitForLoadState('domcontentloaded');

      // 1. body font-family includes Outfit (FR-022)
      const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
      expect(bodyFont).toMatch(/Outfit/i);

      // 2. The primary "New blank workspace" button has 8px border-radius
      //    (FR-024 — landing/docs/Studio canonical primary radius).
      const primaryButton = page.getByTestId('file-loader').getByRole('button', { name: /^New/i });
      await expect(primaryButton).toBeVisible();
      const primaryRadius = await primaryButton.evaluate(
        (el) => getComputedStyle(el as Element).borderRadius
      );
      // shadcn/Button uses `rounded-md` which = `var(--radius-md)` = 8px now.
      // Some browsers report `8px 8px 8px 8px` (per-corner); accept either.
      expect(primaryRadius).toMatch(/^(8px|8px 8px 8px 8px)$/);

      // 3. Secondary buttons (Select Files / Select Folder) render
      //    transparent — NOT solid amber. (FR-023, T054.)
      const secondaryButton = page
        .getByTestId('file-loader')
        .getByRole('button', { name: 'Select Files' });
      await expect(secondaryButton).toBeVisible();
      const secondaryBg = await secondaryButton.evaluate(
        (el) => getComputedStyle(el as Element).backgroundColor
      );
      // `bg-transparent` produces `rgba(0, 0, 0, 0)` in most engines;
      // `transparent` is also acceptable. Reject any opaque colour
      // (anything with non-zero alpha that isn't 0/0/0).
      expect(secondaryBg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    });
  }
});
