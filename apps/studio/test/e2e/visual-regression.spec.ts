/**
 * Visual regression tests — Capture and compare UI structure + computed styles.
 *
 * Uses DOM snapshots (HTML structure + computed styles on key elements) rather
 * than pixel screenshots to verify visual consistency during CSS/Tailwind migrations.
 * This approach is more robust across environments and directly validates that
 * the correct CSS properties are applied.
 *
 * Run with: pnpm test:e2e --grep "Visual Regression"
 *
 * Workflow:
 *   1. Run with --update-snapshots to capture "before" baselines
 *   2. Perform the CSS migration
 *   3. Run without --update-snapshots to compare
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
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

const ROSETTA_MULTI_NS = `namespace org.example
version "1.0.0"

type Account:
  id string (1..1)
  owner string (1..1)
`;

// ────────────────────────────────────────────────────────────────────────────
// Snapshot helpers
// ────────────────────────────────────────────────────────────────────────────

/** CSS properties we care about for visual regression */
const STYLE_PROPS = [
  'color', 'backgroundColor', 'borderColor', 'borderWidth', 'borderRadius',
  'fontSize', 'fontWeight', 'fontFamily',
  'padding', 'margin', 'gap',
  'display', 'flexDirection', 'alignItems', 'justifyContent',
  'width', 'height', 'minWidth', 'maxWidth',
  'opacity', 'boxShadow', 'outline'
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
          styles[prop] = computed.getPropertyValue(
            prop.replace(/([A-Z])/g, '-$1').toLowerCase()
          );
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
// Selectors to snapshot per screen
// ────────────────────────────────────────────────────────────────────────────

const FILE_LOADER_SELECTORS = [
  '.studio-app',
  '.studio-header',
  '.studio-header__title',
  '.studio-file-loader',
  '.studio-file-loader__title',
  '.studio-file-loader__hint',
  '.studio-file-loader__button',
  '.studio-file-loader__button--secondary'
];

const EDITOR_PAGE_SELECTORS = [
  '.studio-app',
  '.studio-header',
  '.studio-editor-page',
  '.studio-editor-page__toolbar',
  '.studio-editor-page__explorer',
  '.studio-editor-page__graph',
  '.studio-editor-page__status',
  '.studio-toolbar-button',
  '.studio-connection-status',
  '.studio-connection-status__dot'
];

const NAMESPACE_EXPLORER_SELECTORS = [
  '.ns-explorer',
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
  '.studio-source-editor',
  '.studio-source-editor__tabs',
  '.studio-source-editor__tab',
  '.studio-source-editor__editor',
  '.cm-editor'
];

const DIAGNOSTICS_SELECTORS = [
  '.studio-diag-panel',
  '.studio-diag-panel__summary',
  '.studio-diag-panel__empty'
];

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

test.describe('Visual Regression', () => {
  test.setTimeout(60_000);

  test('01 — file loader styles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('file-loader')).toBeVisible();

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

  test('02 — editor page layout and styles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    await loadModel(page, [{ name: 'demo.rosetta', content: ROSETTA_SIMPLE }]);

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

  test('03 — namespace explorer styles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    await loadModel(page, [{ name: 'demo.rosetta', content: ROSETTA_SIMPLE }]);
    await page.waitForSelector('[data-testid="namespace-explorer"]', { timeout: 5000 });

    // Expand all to see types
    const expandBtn = page.getByTestId('expand-all');
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
      await page.waitForTimeout(300);
    }

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

  test('04 — source editor styles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    await loadModel(page, [{ name: 'demo.rosetta', content: ROSETTA_SIMPLE }]);

    // Open source panel
    await page.getByTitle('Toggle source view').click();
    await page.waitForSelector('[data-testid="source-editor"]', { timeout: 5000 });
    await page.waitForTimeout(500);

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

  test('05 — diagnostics panel styles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    await loadModel(page, [{ name: 'demo.rosetta', content: ROSETTA_SIMPLE }]);

    // Open diagnostics panel
    await page.getByTitle('Toggle diagnostics panel').click();
    await page.waitForSelector('[data-testid="diagnostics-panel"]', { timeout: 5000 });
    await page.waitForTimeout(300);

    const snapshot = await captureDomSnapshot(
      page,
      '05-diagnostics-panel',
      DIAGNOSTICS_SELECTORS
    );
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
