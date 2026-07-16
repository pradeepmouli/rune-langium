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
    const verdict = testInfo.status === testInfo.expectedStatus ? 'PASS' : 'FAIL';
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
