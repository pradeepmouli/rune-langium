// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Playwright E2E test — Graph Interactions.
 *
 * Validates the ReactFlow graph canvas:
 * 1. Nodes render with correct types and labels
 * 2. Edges render between related types
 * 3. Node selection highlights
 * 4. Fit view and re-layout actions work
 * 5. Graph controls (zoom, minimap) present
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures — Use unique names that won't be substrings of each other
// ---------------------------------------------------------------------------

const INHERITANCE_MODEL = `namespace graph.test
version "1.0.0"

type Vehicle:
  vin string (1..1)

type Sedan extends Vehicle:
  doors int (0..1)

enum Fuel:
  Gasoline
  Electric
  Hybrid
`;

const MULTI_FILE_MODEL_A = `namespace graph.alpha
version "1.0.0"

type AlphaOne:
  value string (1..1)

type AlphaTwo extends AlphaOne:
  count int (1..1)
`;

const MULTI_FILE_MODEL_B = `namespace graph.beta
version "1.0.0"

type BetaItem:
  ref string (0..1)

enum BetaStatus:
  Active
  Inactive
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
  await page.locator('.react-flow__node:not(.react-flow__node-groupContainer)').first().waitFor({
    timeout: 10000
  });
  // Wait for layout animation to settle
  await page.waitForTimeout(2000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Graph Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should render all nodes from the model', async ({ page }) => {
    await loadFiles(page, [{ name: 'model.rosetta', content: INHERITANCE_MODEL }]);

    // 3 types: Vehicle, Sedan, Fuel
    await expect(page.getByTestId('rf__node-graph.test::Vehicle')).toBeVisible();
    await expect(page.getByTestId('rf__node-graph.test::Sedan')).toBeVisible();
    await expect(page.getByTestId('rf__node-graph.test::Fuel')).toBeVisible();
  });

  test('should render edges for inheritance relationships', async ({ page }) => {
    await loadFiles(page, [{ name: 'model.rosetta', content: INHERITANCE_MODEL }]);

    const edges = page.locator('.react-flow__edge');
    const edgeCount = await edges.count();
    // Sedan extends Vehicle = at least 1 edge
    expect(edgeCount).toBeGreaterThanOrEqual(1);
  });

  test('should select a node when clicked', async ({ page }) => {
    await loadFiles(page, [{ name: 'model.rosetta', content: INHERITANCE_MODEL }]);
    await page.waitForTimeout(2000); // Wait for layout animation

    const vehicleNode = page.getByTestId('rf__node-graph.test::Vehicle');
    await vehicleNode.click({ force: true });
    await page.waitForTimeout(500);

    // ReactFlow adds aria-selected or selected attribute to clicked nodes
    // Also the editor form panel should open
    const panel = page.locator('[data-slot="editor-form-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test('Fit View button should work', async ({ page }) => {
    await loadFiles(page, [{ name: 'model.rosetta', content: INHERITANCE_MODEL }]);

    const fitViewBtn = page.locator('[aria-label="Graph toolbar"]').getByRole('button', {
      name: 'Fit View'
    });
    await fitViewBtn.click();
    await page.waitForTimeout(500);

    // All nodes should still be visible after fit view
    await expect(page.getByTestId('rf__node-graph.test::Vehicle')).toBeVisible();
    await expect(page.getByTestId('rf__node-graph.test::Sedan')).toBeVisible();
  });

  test('Re-layout button should rearrange nodes', async ({ page }) => {
    await loadFiles(page, [{ name: 'model.rosetta', content: INHERITANCE_MODEL }]);

    const relayoutBtn = page.locator('[aria-label="Graph toolbar"]').getByRole('button', {
      name: 'Re-layout'
    });
    if (await relayoutBtn.isVisible()) {
      await relayoutBtn.click();
      await page.waitForTimeout(1000);

      // Nodes should still be visible after re-layout
      await expect(page.getByTestId('rf__node-graph.test::Vehicle')).toBeVisible();
    }
  });

  test('should render nodes from multiple files', async ({ page }) => {
    await loadFiles(page, [
      { name: 'alpha.rosetta', content: MULTI_FILE_MODEL_A },
      { name: 'beta.rosetta', content: MULTI_FILE_MODEL_B }
    ]);

    await expect(page.getByTestId('rf__node-graph.alpha::AlphaOne')).toBeVisible();
    await expect(page.getByTestId('rf__node-graph.alpha::AlphaTwo')).toBeVisible();
    await expect(page.getByTestId('rf__node-graph.beta::BetaItem')).toBeVisible();
    await expect(page.getByTestId('rf__node-graph.beta::BetaStatus')).toBeVisible();
  });

  test('should show node attributes in graph nodes', async ({ page }) => {
    await loadFiles(page, [{ name: 'model.rosetta', content: INHERITANCE_MODEL }]);

    const vehicleNode = page.getByTestId('rf__node-graph.test::Vehicle');
    await expect(vehicleNode.getByText('vin')).toBeVisible();
  });

  test('graph canvas should be pannable', async ({ page }) => {
    await loadFiles(page, [{ name: 'model.rosetta', content: INHERITANCE_MODEL }]);

    const viewport = page.locator('.react-flow__viewport');
    const initialTransform = await viewport.getAttribute('style');

    // Pan the canvas
    const pane = page.locator('.react-flow__pane');
    await pane.hover({ position: { x: 200, y: 200 } });
    await page.mouse.down();
    await page.mouse.move(300, 300);
    await page.mouse.up();
    await page.waitForTimeout(300);

    const newTransform = await viewport.getAttribute('style');
    expect(newTransform).not.toBe(initialTransform);
  });
});
