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
 *
 * FORMER KNOWN-ISSUE CARVE-OUT (removed): this journey previously carved
 * `color-contrast` out of its hard gate for
 * https://github.com/pradeepmouli/rune-langium/issues/397. Root-causing that
 * issue found TWO separate things, not one systemic token problem:
 *  1. A genuine, steady-state violation: SettingsPerspective.tsx's "Project
 *     configuration" placeholder list used `text-muted-foreground
 *     opacity-50`, which composites to ~2.6:1 against the daikonic
 *     background — fixed by dropping the extra opacity (plain
 *     `text-muted-foreground` alone is ~6.6:1, comfortably AA).
 *  2. A false positive: the Import/Export-download dialog "violations" only
 *     ever reproduced because this sweep called `sweepAxe()` immediately
 *     after `toBeVisible()`, which resolves as soon as Base UI's dialog
 *     popup has a layout box — WHILE its 200ms `fade-in-0`/`zoom-in-95`
 *     entrance animation is still transitioning `opacity`. Axe was
 *     correctly measuring a real, but transient, mid-animation frame, not
 *     the dialog's resting state. Confirmed by re-running the exact same
 *     sweep after an explicit settle wait: 0 violations, in both a
 *     `--disable-gpu` and a GPU-accelerated headless Chromium session.
 * Both are now fixed at the source (see below) and `color-contrast` is back
 * to a hard gate like every other rule. Do not reintroduce a carve-out
 * without the same rigor (root-caused, reproduced, tracked in a filed
 * issue) that went into diagnosing this one — see this harness's Global
 * Constraints on never fabricating a passing assertion for a real gap.
 */

import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { checkout as test, expect, loadCdm } from '../fixtures.js';

// Mirrors test/e2e/a11y.spec.ts's exclusion list exactly — third-party
// widget a11y debt tracked separately per FR-A04, not this journey's gate.
const SELECTORS_TO_EXCLUDE = ['.monaco-editor', '.react-flow', '.dockview-theme-abyss'];

// Base UI's dialog popup fades/zooms in over 200ms (dialog.tsx's
// `duration-200` on DialogContent) — comfortably clear of it before
// scanning, so axe measures the dialog's resting state, not a genuine but
// transient mid-animation opacity frame (see file-header note on #397).
const DIALOG_ANIMATION_SETTLE_MS = 400;

interface AxeSweepResult {
  checkpoint: string;
  blocking: number;
}

async function sweepAxe(page: Page, checkpointName: string): Promise<AxeSweepResult> {
  const builder = new AxeBuilder({ page });
  for (const sel of SELECTORS_TO_EXCLUDE) builder.exclude(sel);
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  if (blocking.length > 0) {
    console.log(`[axe:${checkpointName}:blocking]`, JSON.stringify(blocking, null, 2));
  }
  return { checkpoint: checkpointName, blocking: blocking.length };
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
    await page.waitForTimeout(DIALOG_ANIMATION_SETTLE_MS);
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
    await page.waitForTimeout(DIALOG_ANIMATION_SETTLE_MS);
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

    const totalBlocking = results.reduce((sum, r) => sum + r.blocking, 0);
    expect(totalBlocking, `serious/critical axe violations: ${JSON.stringify(results)}`).toBe(0);
  });
});
