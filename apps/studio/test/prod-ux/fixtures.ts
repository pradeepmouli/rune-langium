// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Buffer } from 'node:buffer';
import { test as base, expect, type Page } from '@playwright/test';
import { EvidenceCollector, appendJourneyRecord, type JourneyRecord } from './evidence.js';

interface CheckoutFixtures {
  evidence: EvidenceCollector;
}

export const checkout = base.extend<CheckoutFixtures>({
  evidence: async ({ page }, use, testInfo) => {
    const journeyId = testInfo.title.match(/^(J\d+[a-z]?)/)?.[1] ?? testInfo.title;
    const collector = new EvidenceCollector(page, journeyId, testInfo.title, testInfo.retry);
    await use(collector);
    const baseVerdict = testInfo.status === testInfo.expectedStatus ? 'PASS' : 'FAIL';
    const verdict = baseVerdict === 'PASS' && collector.hasSoftFindings ? 'DEGRADED' : baseVerdict;
    const opLog = await readOpLog(page);
    const record: JourneyRecord = await collector.finish(verdict, opLog);
    await appendJourneyRecord(record);
  }
});

export { expect };

export interface OpLogEntry {
  opId?: number;
  op: string;
  subject?: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  durationMs?: number;
  ts: number;
  panel: 'output' | 'activity';
}

// Playwright's page.evaluate callback type-checks against the DOM lib's own
// Window type, which does NOT see apps/studio/src's `declare global`
// augmentation (op-log-window-bridge.ts) — that augmentation only merges
// into programs that include the src file. Re-declare it locally so this
// fixture module type-checks standalone.
declare global {
  interface Window {
    __runeStudioOpLog?: { snapshot(): OpLogEntry[] };
  }
}

/** Reads window.__runeStudioOpLog.snapshot() from the page — installed by op-log-window-bridge.ts (Task 4). */
export async function readOpLog(page: Page): Promise<OpLogEntry[]> {
  return page.evaluate(() => window.__runeStudioOpLog?.snapshot() ?? []);
}

const CDM_BUTTON = 'CDM (Common Domain Model)';
const WORKSPACE_FILE_NAME = 'starter.rosetta';
const WORKSPACE_FILE_CONTENT = 'namespace example\n';

/** Ported verbatim from test/prod-smoke/production-checkout.spec.ts's loadCdm helper. */
export async function loadCdm(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveTitle(/Rune Studio/);
  await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles([
    { name: WORKSPACE_FILE_NAME, mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE_FILE_CONTENT) }
  ]);
  await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('rail-workspaces').click();
  await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

  await page.getByTestId('model-loader').getByRole('button', { name: CDM_BUTTON }).click();

  await expect(page.getByText('Loaded Models', { exact: false })).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('button', { name: `Unload ${CDM_BUTTON}` })).toBeVisible({ timeout: 90000 });
}

export interface ScratchAttributeSpec {
  name: string;
  typeName: string;
  /** e.g. '(1..1)', '(0..*)' — parens included, matches raw Rune DSL syntax. */
  cardinality: string;
}

export interface ScratchTypeSpec {
  name: string;
  namespace: string;
  attributes: ScratchAttributeSpec[];
}

/**
 * Authors a new Data type in a fresh scratch workspace by typing raw Rune
 * DSL into the Source editor and waiting for the app's debounced reparse to
 * pick it up.
 *
 * This app has no graphical "create type" UI — `TypeCreator.tsx` and
 * `editor-store.ts`'s `createType` action are fully implemented but have
 * zero JSX call sites anywhere in the app (confirmed via full-tree search).
 * Every other e2e test that involves a "new" type loads a pre-written
 * `.rosetta` file and edits *existing* nodes graphically. This helper is
 * deliberately the ONE place that authors a type via live Source-pane
 * typing — J8, J9, and J18 all import it rather than re-deriving the same
 * setup (DRY; see the Phase 2 plan's Task 2 design note).
 *
 * Reaches a blank workspace via the same file-input flow J02/J07 already
 * use (a fresh Playwright page gets its own OPFS/IndexedDB origin, so this
 * always starts from an empty workspace), then types the given type
 * definition into the Source editor.
 *
 * Typing is deliberately PACED — a per-keystroke delay plus a short wait
 * after each line — rather than one bulk write. A fast/instant bulk write
 * can race the workspace's debounced OPFS save (a remove+recreate of the
 * underlying file), truncating the persisted content; pacing the input
 * avoids that race. See task-2-report.md's OPFS-save-race finding.
 */
export async function authorScratchType(page: Page, spec: ScratchTypeSpec): Promise<void> {
  await page.goto('./');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles([
    { name: WORKSPACE_FILE_NAME, mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE_FILE_CONTENT) }
  ]);
  await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Source' }).click();
  const editor = page.getByTestId('source-editor').locator('.cm-content');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.click();

  const platformModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${platformModifier}+A`);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);

  await editor.pressSequentially(`namespace ${spec.namespace}\n`, { delay: 20 });
  await page.waitForTimeout(800);
  await editor.pressSequentially(`\ntype ${spec.name}:\n`, { delay: 20 });
  await page.waitForTimeout(800);
  for (const attribute of spec.attributes) {
    await editor.pressSequentially(`    ${attribute.name} ${attribute.typeName} ${attribute.cardinality}\n`, {
      delay: 20
    });
    await page.waitForTimeout(800);
  }

  const namespaceSearch = page.getByTestId('namespace-search');
  await namespaceSearch.fill(spec.name);
  await expect(page.getByTestId(`ns-type-nav-${spec.namespace}.${spec.name}`)).toBeVisible({ timeout: 15000 });
}
