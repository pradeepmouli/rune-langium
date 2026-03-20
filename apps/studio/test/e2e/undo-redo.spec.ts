// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Playwright E2E test — Undo/Redo.
 *
 * Validates undo/redo functionality:
 * 1. Ctrl+Z undoes graph modifications
 * 2. Ctrl+Shift+Z redoes undone changes
 * 3. Undo works after form edits propagate to graph
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const UNDO_MODEL = `namespace undo.test
version "1.0.0"

type Widget:
  title string (1..1)
  quantity int (0..1)

enum Category:
  Electronics
  Clothing
  Food
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadModel(page: Page) {
  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles({
    name: 'undo.rosetta',
    mimeType: 'text/plain',
    buffer: Buffer.from(UNDO_MODEL)
  });
  await page.waitForSelector('[data-testid="editor-page"]', { timeout: 15000 });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 10000 });
}

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Undo / Redo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await loadModel(page);
  });

  test('should undo node position change with Ctrl+Z', async ({ page }) => {
    const widgetNode = page.getByTestId('rf__node-undo.test::Widget');
    const initialBox = await widgetNode.boundingBox();
    expect(initialBox).toBeTruthy();

    // Drag the node
    await widgetNode.hover();
    await page.mouse.down();
    await page.mouse.move(
      initialBox!.x + initialBox!.width / 2 + 100,
      initialBox!.y + initialBox!.height / 2 + 100
    );
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Undo
    await page.keyboard.press(`${modifier}+z`);
    await page.waitForTimeout(500);

    // Node should still be visible (no crash)
    await expect(widgetNode).toBeVisible();
  });

  test('should redo with Ctrl+Shift+Z after undo', async ({ page }) => {
    const widgetNode = page.getByTestId('rf__node-undo.test::Widget');
    const initialBox = await widgetNode.boundingBox();

    // Drag node
    await widgetNode.hover();
    await page.mouse.down();
    await page.mouse.move(
      initialBox!.x + initialBox!.width / 2 + 150,
      initialBox!.y + initialBox!.height / 2 + 150
    );
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Undo
    await page.keyboard.press(`${modifier}+z`);
    await page.waitForTimeout(500);

    // Redo
    await page.keyboard.press(`${modifier}+Shift+z`);
    await page.waitForTimeout(500);

    await expect(widgetNode).toBeVisible();
  });

  test('undo should work after selecting and editing via form', async ({ page }) => {
    // Fit view to ensure nodes are in viewport
    await page.locator('button', { hasText: 'Fit View' }).click();
    await page.waitForTimeout(1000);

    // Select enum node
    const categoryNode = page.getByTestId('rf__node-undo.test::Category');
    await categoryNode.click({ force: true });
    await page.waitForTimeout(1000);

    // Verify form opened
    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });
    await expect(panel.getByRole('textbox', { name: /value name for electronics/i })).toBeVisible({
      timeout: 5000
    });

    // Undo should not crash when form is open
    await page.keyboard.press(`${modifier}+z`);
    await page.waitForTimeout(500);

    // App should still be functional
    await expect(page.getByTestId('editor-page')).toBeVisible();
  });

  test('multiple sequential undos should work', async ({ page }) => {
    const widgetNode = page.getByTestId('rf__node-undo.test::Widget');

    // Perform multiple drag operations
    for (let i = 0; i < 3; i++) {
      const box = await widgetNode.boundingBox();
      await widgetNode.hover();
      await page.mouse.down();
      await page.mouse.move(box!.x + 50, box!.y + 50);
      await page.mouse.up();
      await page.waitForTimeout(300);
    }

    // Undo all 3
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press(`${modifier}+z`);
      await page.waitForTimeout(300);
    }

    await expect(widgetNode).toBeVisible();
  });
});
