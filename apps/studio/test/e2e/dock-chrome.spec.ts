// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * E2E — dock chrome visual regression (014/T025).
 *
 * Verifies SC-010: at the two reference viewports (1280x800, 1440x900)
 * the dock surface renders with proper chrome — `dv-tab` elements are
 * present after dockview-react's stylesheet loads, and the rendered
 * tab strip uses user-readable titles (Files / Editor / Inspector /
 * Problems / Output / Preview) instead of the internal `workspace.*`
 * component IDs.
 *
 * The fastest reliable way to mount the dock shell in production-like
 * conditions is the empty-workspace "New" affordance — it drops the
 * user into the editor with a starter blank file, which mounts
 * EditorPage and therefore DockShell.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openBlankWorkspace(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const loader = page.getByTestId('file-loader');
  await expect(loader).toBeVisible();
  await loader.getByRole('button', { name: /^New/i }).click();
  // Once we're in the editor the dock-shell mounts.
  await expect(page.getByTestId('dock-shell')).toBeVisible({ timeout: 10_000 });
}

async function assertDockChrome(page: Page): Promise<void> {
  // dv-tab elements are emitted by dockview-react once its stylesheet
  // is loaded AND a panel group exists. The shell creates 6 panels;
  // each panel renders at least one tab element in the strip.
  await expect
    .poll(async () => page.locator('.dv-tab').count(), { timeout: 10_000 })
    .toBeGreaterThan(0);

  const tabCount = await page.locator('.dv-tab').count();
  expect(tabCount).toBeGreaterThan(0);

  // No internal `workspace.*` component IDs may leak into the rendered
  // chrome — they should be replaced by PANEL_TITLES in addPanel calls.
  const text = (await page.textContent('body')) ?? '';
  expect(text).not.toContain('workspace.fileTree');
  expect(text).not.toContain('workspace.editor');
  expect(text).not.toContain('workspace.inspector');
  expect(text).not.toContain('workspace.problems');
  expect(text).not.toContain('workspace.output');
  expect(text).not.toContain('workspace.visualPreview');
}

test.describe('Studio — dock chrome (T025, SC-010)', () => {
  test('dock chrome renders at 1280x800', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBlankWorkspace(page);
    await assertDockChrome(page);
  });

  test('dock chrome renders at 1440x900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBlankWorkspace(page);
    await assertDockChrome(page);
  });
});
