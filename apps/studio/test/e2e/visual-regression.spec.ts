/**
 * Visual regression tests — Capture and compare UI structure + computed styles.
 *
 * Uses DOM snapshots (HTML structure + computed styles on key elements) AND
 * pixel screenshots to verify visual consistency during CSS/Tailwind migrations.
 *
 * Run with: pnpm test:e2e --grep "Visual Regression"
 *
 * Workflow:
 *   1. Run with --update-snapshots to capture "before" baselines
 *   2. Perform the CSS migration
 *   3. Run without --update-snapshots to compare
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────────────────────────────────

const ROSETTA_SIMPLE = `namespace demo.simple
version "1.0.0"

type Person:
  name string (1..1)
  age int (0..1)

type Employee extends Person:
  employeeId string (1..1)
  department string (0..1)

enum RoleEnum:
  Manager
  Developer
  Designer

choice PersonOrRole:
  Person
  RoleEnum
`;

// ────────────────────────────────────────────────────────────────────────────
// Snapshot helpers
// ────────────────────────────────────────────────────────────────────────────

/** CSS properties we care about for visual regression */
const STYLE_PROPS = [
  'color',
  'backgroundColor',
  'borderColor',
  'borderWidth',
  'borderRadius',
  'fontSize',
  'fontWeight',
  'fontFamily',
  'padding',
  'margin',
  'gap',
  'display',
  'flexDirection',
  'alignItems',
  'justifyContent',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'opacity',
  'boxShadow',
  'outline'
] as const;

interface ElementSnapshot {
  selector: string;
  tagName: string;
  textContent: string;
  className: string;
  styles: Record<string, string>;
  childCount: number;
  visible: boolean;
}

interface DomSnapshot {
  name: string;
  timestamp: string;
  viewport: { width: number; height: number };
  elements: ElementSnapshot[];
}

/** Capture computed styles for a set of selectors on the page */
async function captureDomSnapshot(
  page: Page,
  name: string,
  selectors: string[]
): Promise<DomSnapshot> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const styleProps = [...STYLE_PROPS];

  const elements: ElementSnapshot[] = await page.evaluate(
    ({ selectors, styleProps }) => {
      const results: ElementSnapshot[] = [];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) {
          results.push({
            selector,
            tagName: '',
            textContent: '',
            className: '',
            styles: {},
            childCount: 0,
            visible: false
          });
          continue;
        }
        const computed = window.getComputedStyle(el);
        const styles: Record<string, string> = {};
        for (const prop of styleProps) {
          styles[prop] = computed.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
        }
        const rect = el.getBoundingClientRect();
        results.push({
          selector,
          tagName: el.tagName.toLowerCase(),
          textContent: el.textContent?.substring(0, 200) ?? '',
          className: el.className,
          styles,
          childCount: el.children.length,
          visible: rect.width > 0 && rect.height > 0
        });
      }
      return results;
    },
    { selectors, styleProps }
  );

  return {
    name,
    timestamp: new Date().toISOString(),
    viewport,
    elements
  };
}

const SNAPSHOT_DIR = path.join(__dirname, '__snapshots__');
const SCREENSHOT_DIR = path.join(__dirname, '__screenshots__');

/** Save a DOM snapshot to disk */
function saveSnapshot(snapshot: DomSnapshot): void {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
  const filePath = path.join(SNAPSHOT_DIR, `${snapshot.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
}

/** Load a previously saved DOM snapshot */
function loadSnapshot(name: string): DomSnapshot | null {
  const filePath = path.join(SNAPSHOT_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/** Save a screenshot */
async function saveScreenshot(page: Page, name: string): Promise<void> {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true
  });
}

/** Helper to load model into the editor */
async function loadModel(page: Page, files: Array<{ name: string; content: string }>) {
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

// ────────────────────────────────────────────────────────────────────────────
// Selectors to snapshot per screen (updated for Tailwind + semantic HTML)
// ────────────────────────────────────────────────────────────────────────────

const FILE_LOADER_SELECTORS = [
  '.studio-app', // Root container (kept for scoping)
  '.studio-app > header', // App header
  '.studio-app > header h1', // Title
  '[data-testid="file-loader"]', // File loader section
  '[data-testid="file-loader"] p:first-of-type', // Main heading
  '[data-testid="file-loader"] p:nth-of-type(2)', // Subtitle text
  '[data-testid="file-loader"] [data-slot="button"]' // Primary button
];

const EDITOR_PAGE_SELECTORS = [
  '.studio-app', // Root container
  '.studio-app > header', // App header
  '[data-testid="editor-page"]', // Editor page root
  '[data-testid="editor-page"] > nav', // Toolbar
  '[data-testid="editor-page"] [data-slot="separator"]', // Separator
  '[data-testid="editor-page"] [data-slot="resizable-panel-group"]', // Panel group
  '[data-testid="editor-page"] > footer', // Status bar
  '[data-testid="editor-page"] [data-slot="button"]', // Toolbar buttons
  '[data-testid="export-menu"]', // Export menu
  '[role="status"]' // Connection status
];

const NAMESPACE_EXPLORER_SELECTORS = [
  '[data-testid="namespace-explorer"]',
  '.ns-explorer__header',
  '.ns-explorer__title',
  '.ns-explorer__count',
  '.ns-explorer__search',
  '.ns-explorer__action-btn',
  '.ns-row__header',
  '.ns-row__name',
  '.ns-row__badge',
  '.ns-type__name',
  '.ns-type__kind'
];

const SOURCE_EDITOR_SELECTORS = [
  '[data-testid="source-editor"]', // Source editor section
  '[data-testid="source-editor"] > nav', // Tab bar nav
  '[data-testid="source-editor"] > nav [role="tab"]', // Tab buttons
  '[data-testid="source-editor-container"]', // Editor container
  '.cm-editor' // CodeMirror editor
];

const DIAGNOSTICS_SELECTORS = [
  '[data-testid="diagnostics-panel"]', // Panel section
  '[data-testid="diagnostics-panel"] [data-slot="separator"]', // Separator
  '[data-testid="diagnostics-panel"] [data-slot="badge"]', // Badge
  '[data-testid="diagnostics-panel"] [data-slot="scroll-area"]' // ScrollArea
];

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

test.describe('Visual Regression', () => {
  test.setTimeout(60_000);

  test('01 — file loader screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('file-loader')).toBeVisible();

    // Capture screenshot
    await saveScreenshot(page, '01-file-loader');

    // Capture DOM snapshot
    const snapshot = await captureDomSnapshot(page, '01-file-loader', FILE_LOADER_SELECTORS);
    const baseline = loadSnapshot('01-file-loader');

    if (!baseline) {
      saveSnapshot(snapshot);
      console.log('  Baseline saved: 01-file-loader');
      return;
    }

    // Compare each element's styles
    for (let i = 0; i < snapshot.elements.length; i++) {
      const current = snapshot.elements[i]!;
      const base = baseline.elements[i];
      if (!base || !current.visible) continue;

      for (const [prop, value] of Object.entries(current.styles)) {
        expect(value, `${current.selector} → ${prop}`).toBe(base.styles[prop]);
      }
    }
  });

  test('02 — editor page layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    await loadModel(page, [{ name: 'demo.rosetta', content: ROSETTA_SIMPLE }]);

    // Capture screenshot
    await saveScreenshot(page, '02-editor-page');

    // Capture DOM snapshot
    const snapshot = await captureDomSnapshot(page, '02-editor-page', EDITOR_PAGE_SELECTORS);
    const baseline = loadSnapshot('02-editor-page');

    if (!baseline) {
      saveSnapshot(snapshot);
      console.log('  Baseline saved: 02-editor-page');
      return;
    }

    for (let i = 0; i < snapshot.elements.length; i++) {
      const current = snapshot.elements[i]!;
      const base = baseline.elements[i];
      if (!base || !current.visible) continue;

      for (const [prop, value] of Object.entries(current.styles)) {
        expect(value, `${current.selector} → ${prop}`).toBe(base.styles[prop]);
      }
    }
  });

  test('03 — namespace explorer', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    await loadModel(page, [{ name: 'demo.rosetta', content: ROSETTA_SIMPLE }]);
    await page.waitForSelector('[data-testid="namespace-explorer"]', { timeout: 5000 });

    // Expand all to see types (force: true because ResizablePanelGroup can intercept pointer events)
    const expandBtn = page.getByTestId('expand-all');
    if (await expandBtn.isVisible()) {
      await expandBtn.click({ force: true });
      await page.waitForTimeout(300);
    }

    // Capture screenshot
    await saveScreenshot(page, '03-namespace-explorer');

    const snapshot = await captureDomSnapshot(
      page,
      '03-namespace-explorer',
      NAMESPACE_EXPLORER_SELECTORS
    );
    const baseline = loadSnapshot('03-namespace-explorer');

    if (!baseline) {
      saveSnapshot(snapshot);
      console.log('  Baseline saved: 03-namespace-explorer');
      return;
    }

    for (let i = 0; i < snapshot.elements.length; i++) {
      const current = snapshot.elements[i]!;
      const base = baseline.elements[i];
      if (!base || !current.visible) continue;

      for (const [prop, value] of Object.entries(current.styles)) {
        expect(value, `${current.selector} → ${prop}`).toBe(base.styles[prop]);
      }
    }
  });

  test('04 — source editor panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    await loadModel(page, [{ name: 'demo.rosetta', content: ROSETTA_SIMPLE }]);

    // Open source panel (use { state: 'attached' } because ResizablePanel layout is async)
    await page.getByTitle('Toggle source view').click();
    await page.waitForSelector('[data-testid="source-editor"]', { state: 'attached', timeout: 5000 });
    await page.waitForTimeout(1000);

    // Capture screenshot
    await saveScreenshot(page, '04-source-editor');

    const snapshot = await captureDomSnapshot(page, '04-source-editor', SOURCE_EDITOR_SELECTORS);
    const baseline = loadSnapshot('04-source-editor');

    if (!baseline) {
      saveSnapshot(snapshot);
      console.log('  Baseline saved: 04-source-editor');
      return;
    }

    for (let i = 0; i < snapshot.elements.length; i++) {
      const current = snapshot.elements[i]!;
      const base = baseline.elements[i];
      if (!base || !current.visible) continue;

      for (const [prop, value] of Object.entries(current.styles)) {
        expect(value, `${current.selector} → ${prop}`).toBe(base.styles[prop]);
      }
    }
  });

  test('05 — diagnostics panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    await loadModel(page, [{ name: 'demo.rosetta', content: ROSETTA_SIMPLE }]);

    // Open diagnostics panel
    await page.getByTitle('Toggle diagnostics panel').click();
    await page.waitForSelector('[data-testid="diagnostics-panel"]', { timeout: 5000 });
    await page.waitForTimeout(300);

    // Capture screenshot
    await saveScreenshot(page, '05-diagnostics-panel');

    const snapshot = await captureDomSnapshot(page, '05-diagnostics-panel', DIAGNOSTICS_SELECTORS);
    const baseline = loadSnapshot('05-diagnostics-panel');

    if (!baseline) {
      saveSnapshot(snapshot);
      console.log('  Baseline saved: 05-diagnostics-panel');
      return;
    }

    for (let i = 0; i < snapshot.elements.length; i++) {
      const current = snapshot.elements[i]!;
      const base = baseline.elements[i];
      if (!base || !current.visible) continue;

      for (const [prop, value] of Object.entries(current.styles)) {
        expect(value, `${current.selector} → ${prop}`).toBe(base.styles[prop]);
      }
    }
  });
});
