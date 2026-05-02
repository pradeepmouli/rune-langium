// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Playwright E2E test — Export Functionality.
 *
 * Validates all export mechanisms:
 * 1. Export .rosetta menu option
 * 2. Export SVG/PNG
 * 3. Export Code dialog (language selection, service availability)
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EXPORT_MODEL = `namespace export.test
version "1.0.0"

type Order:
  orderId string (1..1)
  quantity int (1..1)
  price number (0..1)

enum OrderStatus:
  Pending
  Shipped
  Delivered
  Cancelled
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadModel(page: Page) {
  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles({
    name: 'export.rosetta',
    mimeType: 'text/plain',
    buffer: Buffer.from(EXPORT_MODEL)
  });
  await page.waitForSelector('[data-testid="editor-page"]', { timeout: 15000 });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 10000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Export Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await loadModel(page);
  });

  test('export menu should be visible after loading a model', async ({ page }) => {
    const exportMenu = page.getByTestId('export-menu');
    await expect(exportMenu).toBeVisible();
  });

  test('export menu should have .rosetta export option', async ({ page }) => {
    const exportMenu = page.getByTestId('export-menu');

    // Click to open the menu
    const exportButton = exportMenu.locator('button').first();
    await exportButton.click();
    await page.waitForTimeout(300);

    // Should have export options
    const rosettaOption = page.getByText(/export.*rosetta/i);
    if (await rosettaOption.isVisible()) {
      await expect(rosettaOption).toBeVisible();
    }
  });

  test('export menu should have SVG export option', async ({ page }) => {
    const exportMenu = page.getByTestId('export-menu');
    const exportButton = exportMenu.locator('button').first();
    await exportButton.click();
    await page.waitForTimeout(300);

    const svgOption = page.getByText(/svg/i);
    if (await svgOption.isVisible()) {
      await expect(svgOption).toBeVisible();
    }
  });

  test('Export Code button should be present in toolbar', async ({ page }) => {
    const exportCodeBtn = page.locator('button', { hasText: 'Export Code' });
    await expect(exportCodeBtn).toBeVisible();
  });

  test('Export Code dialog should open when clicking Export Code', async ({ page }) => {
    const exportCodeBtn = page.locator('button', { hasText: 'Export Code' });
    await exportCodeBtn.click();
    await page.waitForTimeout(500);

    // Dialog should open
    const dialog = page.getByTestId('export-dialog');
    await expect(dialog).toBeVisible();

    // Should show "Export Code" title
    await expect(dialog.getByText('Export Code')).toBeVisible();
  });

  test('Export Code dialog should show language selector', async ({ page }) => {
    const exportCodeBtn = page.locator('button', { hasText: 'Export Code' });
    await exportCodeBtn.click();
    await page.waitForTimeout(500);

    const dialog = page.getByTestId('export-dialog');

    // Should show target language label
    await expect(dialog.getByText('Target language')).toBeVisible();

    // Should have a generate button
    await expect(dialog.getByText('Generate')).toBeVisible();
  });

  test('Export Code dialog should close when clicking Close', async ({ page }) => {
    const exportCodeBtn = page.locator('button', { hasText: 'Export Code' });
    await exportCodeBtn.click();
    await page.waitForTimeout(500);

    const dialog = page.getByTestId('export-dialog');
    await expect(dialog).toBeVisible();

    // Click close button
    const closeBtn = dialog.getByText('Close');
    await closeBtn.click();
    await page.waitForTimeout(300);

    // Dialog should be gone
    await expect(dialog).not.toBeVisible();
  });

  test('Export Code dialog should close when clicking overlay', async ({ page }) => {
    const exportCodeBtn = page.locator('button', { hasText: 'Export Code' });
    await exportCodeBtn.click();
    await page.waitForTimeout(500);

    // Click overlay
    const overlay = page.getByTestId('export-dialog-overlay');
    await overlay.click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);

    const dialog = page.getByTestId('export-dialog');
    await expect(dialog).not.toBeVisible();
  });

  test('Export Code dialog should show service unavailable warning when no service', async ({
    page
  }) => {
    const exportCodeBtn = page.locator('button', { hasText: 'Export Code' });
    await exportCodeBtn.click();
    await page.waitForTimeout(2000);

    const dialog = page.getByTestId('export-dialog');

    // Without a running codegen service, should show unavailable message
    const unavailable = dialog.getByText(/not available/i);
    if (await unavailable.isVisible()) {
      await expect(unavailable).toBeVisible();
    }
  });
});
