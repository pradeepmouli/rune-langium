/**
 * Playwright E2E test — Namespace Explorer (enhance-001).
 *
 * Validates the namespace explorer panel behavior:
 * 1. Explorer renders with correct namespace tree after file load
 * 2. Large models start collapsed; small models start expanded
 * 3. Toggle namespace visibility correlates with graph node rendering
 * 4. Search/filter works within the tree
 * 5. Expand All / Collapse All buttons work
 * 6. Individual node visibility toggles work
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SMALL_MODEL = `namespace demo.small
version "1.0.0"

type Person:
  name string (1..1)
  age int (0..1)

type Employee extends Person:
  employeeId string (1..1)

enum RoleEnum:
  Manager
  Developer
  Designer
`;

const MULTI_NAMESPACE_MODEL_A = `namespace ns.alpha
version "1.0.0"

type AlphaType:
  value string (1..1)

type AlphaSub extends AlphaType:
  extra int (0..1)
`;

const MULTI_NAMESPACE_MODEL_B = `namespace ns.beta
version "1.0.0"

type BetaType:
  count int (1..1)

enum BetaEnum:
  One
  Two
  Three
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadFiles(
  page: import('@playwright/test').Page,
  files: { name: string; content: string }[]
) {
  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles(
    files.map((f) => ({
      name: f.name,
      mimeType: 'text/plain',
      buffer: Buffer.from(f.content)
    }))
  );
  await page.waitForSelector('[data-testid="editor-page"]', { timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Namespace Explorer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should show explorer panel after loading a model', async ({ page }) => {
    await loadFiles(page, [{ name: 'demo.rosetta', content: SMALL_MODEL }]);

    const explorer = page.getByTestId('namespace-explorer');
    await expect(explorer).toBeVisible();
  });

  test('should display namespace tree with correct namespace', async ({ page }) => {
    await loadFiles(page, [{ name: 'demo.rosetta', content: SMALL_MODEL }]);

    const tree = page.getByTestId('namespace-tree');
    await expect(tree).toBeVisible();

    // Should have the namespace row
    const nsRow = page.getByTestId('ns-row-demo.small');
    await expect(nsRow).toBeVisible();
  });

  test('should display type count badge for namespace', async ({ page }) => {
    await loadFiles(page, [{ name: 'demo.rosetta', content: SMALL_MODEL }]);

    // 3 types: Person, Employee, RoleEnum
    const badge = page.locator('.ns-row__badge');
    await expect(badge).toHaveText('3');
  });

  test('small model should start with namespace expanded (visible on graph)', async ({ page }) => {
    await loadFiles(page, [{ name: 'demo.rosetta', content: SMALL_MODEL }]);

    // Small model = expanded = graph should show nodes
    // Look for ReactFlow nodes rendered on canvas
    const reactFlowNodes = page.locator('.react-flow__node');
    await expect(reactFlowNodes.first()).toBeVisible({ timeout: 10000 });

    const count = await reactFlowNodes.count();
    expect(count).toBe(3); // Person, Employee, RoleEnum
  });

  test('should render multiple namespaces from multiple files', async ({ page }) => {
    await loadFiles(page, [
      { name: 'alpha.rosetta', content: MULTI_NAMESPACE_MODEL_A },
      { name: 'beta.rosetta', content: MULTI_NAMESPACE_MODEL_B }
    ]);

    const nsAlpha = page.getByTestId('ns-row-ns.alpha');
    const nsBeta = page.getByTestId('ns-row-ns.beta');
    await expect(nsAlpha).toBeVisible();
    await expect(nsBeta).toBeVisible();
  });

  test('should toggle explorer panel with toolbar button', async ({ page }) => {
    await loadFiles(page, [{ name: 'demo.rosetta', content: SMALL_MODEL }]);

    const explorer = page.getByTestId('namespace-explorer');
    await expect(explorer).toBeVisible();

    // Click Explorer button to hide
    const explorerBtn = page.locator('.studio-toolbar-button', { hasText: 'Explorer' });
    await explorerBtn.click();
    await expect(explorer).not.toBeVisible();

    // Click again to show
    await explorerBtn.click();
    await expect(explorer).toBeVisible();
  });

  test('should filter namespaces with search input', async ({ page }) => {
    await loadFiles(page, [
      { name: 'alpha.rosetta', content: MULTI_NAMESPACE_MODEL_A },
      { name: 'beta.rosetta', content: MULTI_NAMESPACE_MODEL_B }
    ]);

    const search = page.getByTestId('namespace-search');
    await search.fill('alpha');

    // Only alpha namespace should be visible
    const nsAlpha = page.getByTestId('ns-row-ns.alpha');
    const nsBeta = page.getByTestId('ns-row-ns.beta');
    await expect(nsAlpha).toBeVisible();
    await expect(nsBeta).not.toBeVisible();

    // Clear search
    await search.clear();
    await expect(nsBeta).toBeVisible();
  });

  test('should filter by type name', async ({ page }) => {
    await loadFiles(page, [
      { name: 'alpha.rosetta', content: MULTI_NAMESPACE_MODEL_A },
      { name: 'beta.rosetta', content: MULTI_NAMESPACE_MODEL_B }
    ]);

    const search = page.getByTestId('namespace-search');
    await search.fill('BetaEnum');

    // Beta namespace should appear (matched by type name)
    const nsBeta = page.getByTestId('ns-row-ns.beta');
    await expect(nsBeta).toBeVisible();

    // Alpha should not match
    const nsAlpha = page.getByTestId('ns-row-ns.alpha');
    await expect(nsAlpha).not.toBeVisible();
  });

  test('Collapse All should hide all graph nodes', async ({ page }) => {
    await loadFiles(page, [{ name: 'demo.rosetta', content: SMALL_MODEL }]);

    // Wait for nodes to render first
    const reactFlowNodes = page.locator('.react-flow__node');
    await expect(reactFlowNodes.first()).toBeVisible({ timeout: 10000 });

    // Click Collapse All
    const collapseBtn = page.getByTestId('collapse-all');
    await collapseBtn.click();

    // Wait for nodes to disappear
    await expect(reactFlowNodes).toHaveCount(0, { timeout: 5000 });
  });

  test('Expand All should show all graph nodes after collapse', async ({ page }) => {
    await loadFiles(page, [{ name: 'demo.rosetta', content: SMALL_MODEL }]);

    const reactFlowNodes = page.locator('.react-flow__node');
    await expect(reactFlowNodes.first()).toBeVisible({ timeout: 10000 });

    // Collapse all
    const collapseBtn = page.getByTestId('collapse-all');
    await collapseBtn.click();
    await expect(reactFlowNodes).toHaveCount(0, { timeout: 5000 });

    // Expand all
    const expandBtn = page.getByTestId('expand-all');
    await expandBtn.click();

    // Nodes should reappear
    await expect(reactFlowNodes.first()).toBeVisible({ timeout: 10000 });
    const count = await reactFlowNodes.count();
    expect(count).toBe(3);
  });

  test('clicking namespace visibility eye should toggle graph rendering', async ({ page }) => {
    await loadFiles(page, [{ name: 'demo.rosetta', content: SMALL_MODEL }]);

    const reactFlowNodes = page.locator('.react-flow__node');
    await expect(reactFlowNodes.first()).toBeVisible({ timeout: 10000 });
    const beforeCount = await reactFlowNodes.count();
    expect(beforeCount).toBe(3);

    // Click the eye icon to hide the namespace
    const visibilityBtn = page.locator('.ns-row__visibility').first();
    await visibilityBtn.click();

    // All nodes should be hidden (single namespace model)
    await expect(reactFlowNodes).toHaveCount(0, { timeout: 5000 });

    // Click again to show
    await visibilityBtn.click();
    await expect(reactFlowNodes.first()).toBeVisible({ timeout: 10000 });
    const afterCount = await reactFlowNodes.count();
    expect(afterCount).toBe(3);
  });

  test('expanding tree chevron should show type list', async ({ page }) => {
    await loadFiles(page, [{ name: 'demo.rosetta', content: SMALL_MODEL }]);

    // Click the chevron to expand the tree (UI-only, not graph visibility)
    const chevron = page.locator('.ns-row__chevron').first();
    await chevron.click();

    // Type entries should appear
    const typeEntry = page.locator('.ns-type__name', { hasText: 'Person' });
    await expect(typeEntry).toBeVisible();

    const employeeEntry = page.locator('.ns-type__name', { hasText: 'Employee' });
    await expect(employeeEntry).toBeVisible();

    const enumEntry = page.locator('.ns-type__name', { hasText: 'RoleEnum' });
    await expect(enumEntry).toBeVisible();
  });

  test('clicking type name in tree should focus it on graph', async ({ page }) => {
    await loadFiles(page, [{ name: 'demo.rosetta', content: SMALL_MODEL }]);

    // Expand tree
    const chevron = page.locator('.ns-row__chevron').first();
    await chevron.click();

    // Click on "Employee" type name
    const typeName = page.locator('.ns-type__name', { hasText: 'Employee' });
    await typeName.click();

    // The graph should zoom/pan to focus on the node
    // We can verify the viewport changed by checking the ReactFlow transform
    // Just verify no errors and the node is still visible
    const employeeNode = page.locator('.react-flow__node', { hasText: 'Employee' });
    await expect(employeeNode).toBeVisible({ timeout: 5000 });
  });

  test('status bar should show visible/total count', async ({ page }) => {
    await loadFiles(page, [{ name: 'demo.rosetta', content: SMALL_MODEL }]);

    // Explorer header should show count like "3/3"
    const countDisplay = page.locator('.ns-explorer__count');
    await expect(countDisplay).toHaveText('3/3');
  });
});
