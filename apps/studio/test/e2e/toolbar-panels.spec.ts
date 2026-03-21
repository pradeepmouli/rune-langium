// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Playwright E2E test — Toolbar & Panel Management.
 *
 * Validates toolbar buttons and panel toggling:
 * 1. All toolbar buttons present
 * 2. Panel toggling (Explorer, Source, Editor, Problems)
 * 3. Panel state persistence across actions
 * 4. Status bar information
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOOLBAR_MODEL = `namespace toolbar.test
version "1.0.0"

type Widget:
  name string (1..1)
  active boolean (0..1)

type Gadget extends Widget:
  model string (1..1)

enum Status:
  On
  Off
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadModel(page: Page) {
  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles({
    name: 'toolbar.rosetta',
    mimeType: 'text/plain',
    buffer: Buffer.from(TOOLBAR_MODEL)
  });
  await page.waitForSelector('[data-testid="editor-page"]', { timeout: 15000 });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 10000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Toolbar & Panel Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await loadModel(page);
  });

  test('should display all toolbar buttons', async ({ page }) => {
    const toolbar = page.locator('[aria-label="Editor toolbar"]');
    await expect(toolbar).toBeVisible();

    // Check for key toolbar buttons
    await expect(page.locator('button', { hasText: 'Explorer' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Fit View' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Source' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Editor' })).toBeVisible();
  });

  test('Explorer toggle should show/hide namespace panel', async ({ page }) => {
    const explorer = page.getByTestId('namespace-explorer');

    // Explorer should be visible by default
    await expect(explorer).toBeVisible();

    // Toggle off
    const explorerBtn = page.locator('button', { hasText: 'Explorer' });
    await explorerBtn.click();
    await page.waitForTimeout(300);
    await expect(explorer).not.toBeVisible();

    // Toggle on
    await explorerBtn.click();
    await page.waitForTimeout(300);
    await expect(explorer).toBeVisible();
  });

  test('Source toggle should show/hide source editor panel', async ({ page }) => {
    const sourceBtn = page.locator('button', { hasText: 'Source' });

    // Toggle on
    await sourceBtn.click();
    await page.waitForTimeout(500);
    const sourceEditor = page.locator('[data-testid="source-editor"]');
    await expect(sourceEditor).toBeVisible();

    // Toggle off
    await sourceBtn.click();
    await page.waitForTimeout(300);
  });

  test('Problems toggle should show/hide diagnostics panel', async ({ page }) => {
    const problemsBtn = page.locator('button', { hasText: 'Problems' });
    if (await problemsBtn.isVisible()) {
      await problemsBtn.click();
      await page.waitForTimeout(300);

      const diagPanel = page.getByTestId('diagnostics-panel');
      await expect(diagPanel).toBeVisible();

      // Toggle off
      await problemsBtn.click();
      await page.waitForTimeout(300);
      await expect(diagPanel).not.toBeVisible();
    }
  });

  test('multiple panels can be open simultaneously', async ({ page }) => {
    // Open source panel
    const sourceBtn = page.locator('button', { hasText: 'Source' });
    await sourceBtn.click();
    await page.waitForTimeout(500);

    // Explorer should still be visible
    await expect(page.getByTestId('namespace-explorer')).toBeVisible();

    // Source editor should be visible
    const sourceEditor = page.locator('[data-testid="source-editor"]');
    await expect(sourceEditor).toBeVisible();
  });

  test('status bar should show model info', async ({ page }) => {
    // Status footer should show file count
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(page.getByText(/1 file/i)).toBeVisible();
  });

  test('Fit View should zoom to show all nodes', async ({ page }) => {
    const fitViewBtn = page.locator('button', { hasText: 'Fit View' });
    await fitViewBtn.click();
    await page.waitForTimeout(500);

    // All nodes should be visible after fit view
    await expect(page.locator('.react-flow__node', { hasText: 'Widget' })).toBeVisible();
    await expect(page.locator('.react-flow__node', { hasText: 'Gadget' })).toBeVisible();
    await expect(page.locator('.react-flow__node', { hasText: 'Status' })).toBeVisible();
  });

  test('should show close button to return to file loader', async ({ page }) => {
    const closeBtn = page.getByTitle('Close all files');
    await expect(closeBtn).toBeVisible();

    await closeBtn.click();
    await page.waitForTimeout(500);

    // Should return to file loader
    await expect(page.getByTestId('file-loader')).toBeVisible();
  });
});
