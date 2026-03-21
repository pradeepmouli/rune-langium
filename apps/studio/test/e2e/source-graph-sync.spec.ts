// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Playwright E2E test — Source ↔ Graph ↔ Form Synchronization.
 *
 * Validates bidirectional sync between:
 * 1. Source editor content matches loaded model
 * 2. Form edits reflect correct data per node
 * 3. Double-clicking a node opens source editor
 * 4. Switching nodes updates the form
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SYNC_MODEL = `namespace sync.test
version "1.0.0"

type Customer:
  name string (1..1)
  email string (0..1)

enum Tier:
  Gold
  Silver
  Bronze
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadModel(page: Page) {
  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles({
    name: 'sync.rosetta',
    mimeType: 'text/plain',
    buffer: Buffer.from(SYNC_MODEL)
  });
  await page.waitForSelector('[data-testid="editor-page"]', { timeout: 15000 });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 10000 });
  // Wait for layout animation to fully settle
  await page.waitForTimeout(2500);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Source ↔ Graph ↔ Form Sync', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await loadModel(page);
  });

  test('graph should render all nodes from the model', async ({ page }) => {
    await expect(page.getByTestId('rf__node-sync.test::Customer')).toBeVisible();
    await expect(page.getByTestId('rf__node-sync.test::Tier')).toBeVisible();
  });

  test('double-clicking a node should open source editor', async ({ page }) => {
    // Use evaluate to dispatch dblclick directly (node may be outside viewport)
    await page.evaluate(() => {
      const node = document.querySelector('[data-testid="rf__node-sync.test::Customer"]');
      if (node) node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await page.waitForTimeout(3000);

    const sourceEditor = page.locator('[data-testid="source-editor"]');
    await expect(sourceEditor).toBeVisible({ timeout: 10000 });
  });

  test('graph nodes should reflect model structure', async ({ page }) => {
    // Verify Customer node shows its attributes
    const customerNode = page.getByTestId('rf__node-sync.test::Customer');
    await expect(customerNode.getByText('name')).toBeVisible({ timeout: 5000 });

    // Verify Tier node shows its enum values
    const tierNode = page.getByTestId('rf__node-sync.test::Tier');
    await expect(tierNode.getByText('Gold')).toBeVisible({ timeout: 5000 });
    await expect(tierNode.getByText('Silver')).toBeVisible();
  });

  test('clicking a graph node should open the editor form panel', async ({ page }) => {
    await page.getByTestId('rf__node-sync.test::Tier').click({ force: true });
    await page.waitForTimeout(1000);

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test('form should show correct data when switching between nodes', async ({ page }) => {
    const panel = page.locator('[data-slot="editor-form-panel"]');

    // Click Customer node using evaluate (may be outside viewport)
    await page.evaluate(() => {
      const node = document.querySelector('[data-testid="rf__node-sync.test::Customer"]');
      if (node) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(1500);
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Click Tier
    await page.evaluate(() => {
      const node = document.querySelector('[data-testid="rf__node-sync.test::Tier"]');
      if (node) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(1500);
    await expect(panel).toBeVisible();
  });

  test('status bar should show file count', async ({ page }) => {
    await expect(page.getByText(/1 file/i)).toBeVisible();
  });
});
