// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * E2E — dock chrome visual regression (014/T025).
 *
 * Verifies SC-010: at the two reference viewports (1280x800, 1440x900)
 * the dock surface renders with proper chrome. The current shell exposes
 * the center-pane switcher and utility controls directly instead of relying
 * on Dockview's tab strip for all navigation.
 *
 * The fastest reliable way to mount the dock shell in production-like
 * conditions is the empty-workspace "New" affordance — it drops the
 * user into the editor with a starter blank file, which mounts
 * EditorPage and therefore DockShell.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { assertWorkbenchUsable } from '../helpers/workbench-invariants.js';

async function openBlankWorkspace(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForLoadState('domcontentloaded');
  const loader = page.getByTestId('file-loader');
  await expect(loader).toBeVisible();
  await loader.getByRole('button', { name: /^New/i }).click();
  // Once we're in the editor the dock-shell mounts.
  await expect(page.getByTestId('dock-shell')).toBeVisible({ timeout: 10_000 });
}

async function assertDockChrome(page: Page): Promise<void> {
  // No internal `workspace.*` component IDs may leak into the rendered
  // chrome — they should be replaced by PANEL_TITLES in addPanel calls.
  const text = (await page.textContent('body')) ?? '';
  expect(text).not.toContain('workspace.fileTree');
  expect(text).not.toContain('workspace.editor');
  expect(text).not.toContain('workspace.inspector');
  expect(text).not.toContain('workspace.problems');
  expect(text).not.toContain('workspace.output');
  expect(text).not.toContain('workspace.visualPreview');

  await expect(page.getByTestId('studio-paneswitch')).toContainText('Graph');
  await expect(page.getByTestId('studio-paneswitch')).toContainText('Structure');
  await expect(page.getByTestId('studio-paneswitch')).toContainText('Source');
  await expect(page.getByTestId('studio-paneswitch')).toContainText('Inspector');
  await expect(page.getByRole('button', { name: 'Show Problems & Messages' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse tree' })).toBeVisible();
  await expect(page.getByText('Form', { exact: true })).toBeVisible();
  await expect(page.getByText('Code', { exact: true })).toBeVisible();
  await expect(page.getByTestId('diagnostics-panel')).toContainText('Problems');
  await expect(page.locator('body')).toContainText('Messages');
}

test.describe('Studio — dock chrome (T025, SC-010)', () => {
  test('dock chrome renders at 1280x800', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBlankWorkspace(page);
    await assertDockChrome(page);
    await assertWorkbenchUsable(page);
  });

  test('dock chrome renders at 1440x900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBlankWorkspace(page);
    await assertDockChrome(page);
    await assertWorkbenchUsable(page);
  });

  test('workbench stays usable at the narrow regression width, including after restore', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await openBlankWorkspace(page);
    await assertDockChrome(page);
    await assertWorkbenchUsable(page);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('dock-shell')).toBeVisible({ timeout: 10_000 });
    await assertDockChrome(page);
    await assertWorkbenchUsable(page);
  });

  test('utility tray toggle updates its label', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBlankWorkspace(page);
    const toggle = page.getByTestId('toggle-utilities-chevron');
    await expect(toggle).toHaveAttribute('aria-label', /show problems & messages/i);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', /hide problems & messages/i);
  });
});
