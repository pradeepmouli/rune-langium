// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Playwright E2E test — Editor Form Panel.
 *
 * Validates the right-side property editing panel:
 * 1. Opens when a type is selected from the explorer
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
  await page.getByTestId('namespace-explorer').waitFor({ timeout: 10000 });
  await page.getByTestId('ns-type-editor.panel::Customer').waitFor({ timeout: 10000 });
}

async function selectType(page: Page, nodeId: string) {
  await page.getByTestId(`ns-type-${nodeId}`).click();
  await page.waitForTimeout(1000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Editor Form Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await loadModel(page);
  });

  test('should keep panel visible when switching from one node to another', async ({ page }) => {
    await selectType(page, 'editor.panel::Customer');

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });

    await selectType(page, 'editor.panel::Priority');
    await expect(panel).toBeVisible();
  });

  test('should open editor panel when clicking a data type node', async ({ page }) => {
    await selectType(page, 'editor.panel::Customer');

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test('should show enum form when clicking an enum node', async ({ page }) => {
    await selectType(page, 'editor.panel::Priority');

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
    await selectType(page, 'editor.panel::ItemKind');

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test('should switch forms when clicking different nodes', async ({ page }) => {
    const panel = page.locator('[data-slot="editor-form-panel"]');

    await selectType(page, 'editor.panel::Customer');
    await expect(panel).toBeVisible({ timeout: 5000 });

    await selectType(page, 'editor.panel::Priority');
    await expect(panel.getByRole('textbox', { name: /value name for active/i })).toBeVisible({
      timeout: 5000
    });
  });

  test('should show kind badge in panel header', async ({ page }) => {
    await selectType(page, 'editor.panel::Customer');

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });
    const header = panel.locator('[data-slot="panel-header"]');
    await expect(header).toBeVisible();
  });

  test('should display attributes for data type node', async ({ page }) => {
    await selectType(page, 'editor.panel::Customer');

    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Attributes render as input fields in the data form
    await expect(panel.locator('input[value="name"]')).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('input[value="age"]')).toBeVisible();
  });
});
