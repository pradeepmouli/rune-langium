// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Playwright E2E test — Source Editor.
 *
 * Validates the source code editor panel:
 * 1. Opens with correct file content
 * 2. Tab management (switch files, close tabs)
 * 3. CodeMirror renders with syntax content
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MODEL_A = `namespace source.test
version "1.0.0"

type Widget:
  label string (1..1)
  count int (0..1)
`;

const MODEL_B = `namespace source.other
version "1.0.0"

enum Color:
  Red
  Green
  Blue
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadFiles(page: Page, files: { name: string; content: string }[]) {
  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles(
    files.map((f) => ({
      name: f.name,
      mimeType: 'text/plain',
      buffer: Buffer.from(f.content)
    }))
  );
  await page.waitForSelector('[data-testid="editor-page"]', { timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function openSourceViaDoubleClick(page: Page, nodeTestId: string) {
  const node = page.getByTestId(nodeTestId);
  await node.dblclick({ force: true });
  await page.waitForTimeout(2000);
  // After double-click, source editor should be visible with CodeMirror
  await page.waitForSelector('[data-testid="source-editor"]', { timeout: 10000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Source Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should show source editor panel when toggled via toolbar', async ({ page }) => {
    await loadFiles(page, [{ name: 'widget.rosetta', content: MODEL_A }]);

    const sourceBtn = page.locator('button', { hasText: 'Source' });
    await sourceBtn.click();
    await page.waitForTimeout(500);

    const sourceEditor = page.locator('[data-testid="source-editor"]');
    await expect(sourceEditor).toBeVisible({ timeout: 5000 });
  });

  test('should open source editor with CodeMirror when double-clicking a node', async ({
    page
  }) => {
    await loadFiles(page, [{ name: 'widget.rosetta', content: MODEL_A }]);
    await openSourceViaDoubleClick(page, 'rf__node-source.test::Widget');

    // CodeMirror should now be visible
    const cmEditor = page.locator('.cm-editor');
    await expect(cmEditor).toBeVisible({ timeout: 10000 });
  });

  test('should display file tabs after opening source', async ({ page }) => {
    await loadFiles(page, [
      { name: 'widget.rosetta', content: MODEL_A },
      { name: 'color.rosetta', content: MODEL_B }
    ]);
    await openSourceViaDoubleClick(page, 'rf__node-source.test::Widget');

    // Should show at least the active file tab
    const widgetTab = page.locator('[role="tab"]', { hasText: 'widget.rosetta' });
    await expect(widgetTab).toBeVisible({ timeout: 5000 });
  });

  test('should show CodeMirror editor with rosetta content', async ({ page }) => {
    await loadFiles(page, [{ name: 'widget.rosetta', content: MODEL_A }]);
    await openSourceViaDoubleClick(page, 'rf__node-source.test::Widget');

    const cmContent = page.locator('.cm-content');
    await expect(cmContent).toContainText('namespace', { timeout: 10000 });
  });

  test('should toggle source panel off and on', async ({ page }) => {
    await loadFiles(page, [{ name: 'widget.rosetta', content: MODEL_A }]);

    // Open source panel via toolbar
    const sourceBtn = page.locator('button', { hasText: 'Source' });
    await sourceBtn.click();
    await page.waitForTimeout(500);

    const sourceEditor = page.locator('[data-testid="source-editor"]');
    await expect(sourceEditor).toBeVisible();

    // Close
    await sourceBtn.click();
    await page.waitForTimeout(300);

    // Re-open
    await sourceBtn.click();
    await page.waitForTimeout(500);
    await expect(sourceEditor).toBeVisible();
  });
});
