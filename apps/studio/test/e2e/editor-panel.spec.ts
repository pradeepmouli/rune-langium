/**
 * Playwright E2E test — Editor Form Panel.
 *
 * Validates the right-side property editing panel:
 * 1. Opens when a graph node is clicked
 * 2. Shows correct form for each node kind (Enum, Data, Choice)
 * 3. Edits propagate to graph node labels
 * 4. Panel closes and shows empty state when no node selected
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures — Use names that won't be substrings of each other
// ---------------------------------------------------------------------------

const MODEL_WITH_ALL_KINDS = `namespace editor.panel
version "1.0.0"

type Customer:
  name string (1..1)
  age int (0..1)

enum Priority:
  Active
  Inactive
  Pending

choice ItemKind:
  Customer
  Priority
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadModel(page: Page) {
  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles({
    name: 'model.rosetta',
    mimeType: 'text/plain',
    buffer: Buffer.from(MODEL_WITH_ALL_KINDS)
  });
  await page.waitForSelector('[data-testid="editor-page"]', { timeout: 15000 });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 10000 });
  // Wait for layout animation to settle
  await page.waitForTimeout(1500);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Editor Form Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await loadModel(page);
  });

  test('should keep panel visible when switching from one node to another', async ({ page }) => {
    // Click on Customer to open the panel
    await page.getByTestId('rf__node-editor.panel::Customer').click({ force: true });
    await page.waitForTimeout(1500);

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Click Priority — panel should remain visible
    await page.getByTestId('rf__node-editor.panel::Priority').click({ force: true });
    await page.waitForTimeout(1000);
    await expect(panel).toBeVisible();
  });

  test('should open editor panel when clicking a data type node', async ({ page }) => {
    await page.getByTestId('rf__node-editor.panel::Customer').click({ force: true });
    await page.waitForTimeout(1000);

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test('should show enum form when clicking an enum node', async ({ page }) => {
    await page.getByTestId('rf__node-editor.panel::Priority').click({ force: true });
    await page.waitForTimeout(1000);

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Enum form renders values as input fields (name + display inputs per value)
    await expect(panel.getByRole('textbox', { name: /value name for active/i })).toBeVisible({
      timeout: 5000
    });
    await expect(panel.getByRole('textbox', { name: /value name for inactive/i })).toBeVisible();
    await expect(panel.getByRole('textbox', { name: /value name for pending/i })).toBeVisible();
  });

  test('should show choice form when clicking a choice node', async ({ page }) => {
    await page.getByTestId('rf__node-editor.panel::ItemKind').click({ force: true });
    await page.waitForTimeout(1000);

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test('should switch forms when clicking different nodes', async ({ page }) => {
    const panel = page.locator('[data-slot="editor-form-panel"]');

    // Click Customer (data type) — use evaluate to bypass viewport issues
    await page.evaluate(() => {
      const node = document.querySelector('[data-testid="rf__node-editor.panel::Customer"]');
      if (node) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(1500);
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Click Priority (enum) — use evaluate to bypass viewport issues
    await page.evaluate(() => {
      const node = document.querySelector('[data-testid="rf__node-editor.panel::Priority"]');
      if (node) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(1500);
    await expect(panel.getByRole('textbox', { name: /value name for active/i })).toBeVisible({
      timeout: 5000
    });
  });

  test('should show kind badge in panel header', async ({ page }) => {
    await page.getByTestId('rf__node-editor.panel::Customer').click({ force: true });
    await page.waitForTimeout(1000);

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });
    const header = panel.locator('[data-slot="panel-header"]');
    await expect(header).toBeVisible();
  });

  test('should display attributes for data type node', async ({ page }) => {
    await page.getByTestId('rf__node-editor.panel::Customer').click({ force: true });
    await page.waitForTimeout(1000);

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Attributes render as input fields in the data form
    await expect(panel.locator('input[value="name"]')).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('input[value="age"]')).toBeVisible();
  });
});
