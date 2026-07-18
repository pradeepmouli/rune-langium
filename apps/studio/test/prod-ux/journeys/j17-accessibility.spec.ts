// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * J17 — Accessibility sweep.
 *
 * Reuses `test/e2e/a11y.spec.ts`'s exact axe-core harness pattern
 * (`AxeBuilder`, `SELECTORS_TO_EXCLUDE`, `serious`/`critical`-only gate) —
 * this journey's job is coverage breadth (one checkpoint per perspective
 * plus the Import and Export dialogs), not new a11y tooling.
 *
 * Dialog-open sequences were live-verified against this branch's Task 1
 * (J12) / Task 2 (J13) specs rather than guessed:
 * - Import dialog: `getByRole('button', { name: 'Import' })` →
 *   `import-dialog` (matches j12-import-dialog.spec.ts's
 *   `openWorkspaceAndImport` exactly).
 * - Export download dialog: J13 found the brief's generic
 *   `getByRole('button', { name: /download/i })` guess doesn't match —
 *   the real per-target trigger is `codegen-targets-table__download-zod`
 *   (read directly from `CodegenTargetsTable.tsx`), closed via
 *   `download-config-dialog__cancel`. Reused verbatim here.
 *
 * Given J15's confirmed finding that theme is currently fixed at dark (no
 * toggle exists anywhere in the app), the spec's "both themes" requirement
 * cannot be exercised via a UI toggle — the sweep below runs once, under
 * whatever the app's fixed theme actually is, and records a `softFinding`
 * rather than fabricating a second run under an unreachable theme.
 */

import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { checkout as test, expect, loadCdm } from '../fixtures.js';

// Mirrors test/e2e/a11y.spec.ts's exclusion list exactly — third-party
// widget a11y debt tracked separately per FR-A04, not this journey's gate.
const SELECTORS_TO_EXCLUDE = ['.monaco-editor', '.react-flow', '.dockview-theme-abyss'];

interface AxeSweepResult {
  checkpoint: string;
  seriousOrCritical: number;
}

async function sweepAxe(page: Page, checkpointName: string): Promise<AxeSweepResult> {
  const builder = new AxeBuilder({ page });
  for (const sel of SELECTORS_TO_EXCLUDE) builder.exclude(sel);
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  if (blocking.length > 0) {
    console.log(`[axe:${checkpointName}]`, JSON.stringify(blocking, null, 2));
  }
  return { checkpoint: checkpointName, seriousOrCritical: blocking.length };
}

test.describe('J17 — Accessibility sweep', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J17 axe sweep across all perspectives and the Import/Export dialogs', async ({ page, evidence }) => {
    const results: AxeSweepResult[] = [];

    await loadCdm(page);

    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    results.push(await sweepAxe(page, 'explore'));
    await evidence.checkpoint('axe-explore');

    await page.getByTestId('rail-workspaces').click();
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });
    results.push(await sweepAxe(page, 'workspaces'));
    await evidence.checkpoint('axe-workspaces');

    await page.getByTestId('rail-git').click();
    await expect(page.getByTestId('git-perspective')).toBeVisible({ timeout: 20000 });
    results.push(await sweepAxe(page, 'git'));
    await evidence.checkpoint('axe-git');

    await page.getByTestId('rail-export').click();
    await expect(page.getByTestId('export-perspective')).toBeVisible({ timeout: 20000 });
    results.push(await sweepAxe(page, 'export'));
    await evidence.checkpoint('axe-export');

    await page.getByTestId('rail-settings').click();
    await expect(page.getByTestId('settings-perspective')).toBeVisible({ timeout: 20000 });
    results.push(await sweepAxe(page, 'settings'));
    await evidence.checkpoint('axe-settings');

    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('import-dialog')).toBeVisible({ timeout: 10000 });
    results.push(await sweepAxe(page, 'import-dialog'));
    await evidence.checkpoint('axe-import-dialog');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('import-dialog')).not.toBeVisible({ timeout: 5000 });

    await page.getByTestId('rail-export').click();
    await expect(page.getByTestId('export-perspective')).toBeVisible({ timeout: 20000 });
    // Confirmed live against J13 (task-2, this branch): the real per-target
    // trigger is `codegen-targets-table__download-zod`, not a generic
    // "download" role/name guess — see file-header comment.
    await page.getByTestId('codegen-targets-table__download-zod').click();
    await expect(page.getByTestId('download-config-dialog')).toBeVisible({ timeout: 10000 });
    results.push(await sweepAxe(page, 'download-config-dialog'));
    await evidence.checkpoint('axe-download-config-dialog');
    await page.getByTestId('download-config-dialog__cancel').click();
    await expect(page.getByTestId('download-config-dialog')).not.toBeVisible({ timeout: 5000 });

    // SPEC ADAPTATION: "both themes" is unreachable — J15 confirmed theme
    // is currently fixed at dark, no toggle exists. Recording rather than
    // fabricating a second sweep under an unreachable theme.
    evidence.softFinding(
      'KI-a11y-single-theme-only',
      "Axe sweep ran once under the app's fixed dark theme — no light-theme toggle exists to exercise the " +
        'spec\'s "both themes" requirement (same root cause as J15\'s KI-layout-reset-unreachable finding: ' +
        'SettingsPerspective.tsx confirms theme is fixed at dark).'
    );

    const totalBlocking = results.reduce((sum, r) => sum + r.seriousOrCritical, 0);
    expect(totalBlocking, `serious/critical axe violations: ${JSON.stringify(results)}`).toBe(0);
  });
});
