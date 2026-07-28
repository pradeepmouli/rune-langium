// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm, authorScratchType } from '../fixtures.js';
import { ANCHOR_DATA } from '../anchors.js';

// Target keys match packages/codegen/src/types.ts's `Target` union exactly
// (confirmed live this session) — 'json-schema' is hyphenated, and there is
// no 'jsonschema' key; testids below use these keys verbatim
// (`codegen-targets-table__{row,view,download}-{target}`).
const TARGETS = ['typescript', 'zod', 'json-schema', 'sql', 'openapi'] as const;

const SCRATCH_NAMESPACE = 'scratch.j11codegen';
const SCRATCH_TYPE = 'ScratchCodegenWidget';

test.describe('J11 — Client-side codegen (Code tab)', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J11 Code tab renders non-empty output per target for the scratch workspace; curated content is available through Download', async ({
    page,
    evidence
  }) => {
    // --- Curated anchor -----------------------------------------------------
    await loadCdm(page);
    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

    const namespaceSearch = page.getByTestId('namespace-search');
    await namespaceSearch.fill('BusinessCenters');
    await page.getByTestId(`ns-type-nav-${ANCHOR_DATA}`).click();

    await page.getByRole('tab', { name: 'Code' }).click();
    await expect(page.getByTestId('panel-codePreview')).toBeVisible({ timeout: 20000 });

    // FINDING (this session, confirmed live against production): the Code
    // tab's live per-target preview is deliberately, NOT accidentally,
    // scoped to user-authored workspace files only —
    // apps/studio/src/shell/providers/CodegenProvider.tsx's file-sync effect
    // says so explicitly ("codegen:setFiles uses only user-authored files —
    // readOnly corpus files are not the target of local code generation").
    // Selecting/hydrating ANCHOR_DATA and opening every target's viewer here
    // renders the SAME output as an empty scratch workspace (an empty
    // `$defs: {}` for JSON Schema, observed live) — never ANCHOR_DATA's own
    // schema. This is a real, documented product decision, not a bug to
    // route around: only the separate, server-backed Download path
    // (`/api/codegen`, wired through `DownloadConfigDialog`) includes
    // curated bundles — confirmed live this session, its namespace list
    // shows 42 curated `cdm.*` namespaces once CDM is loaded. So the
    // "curated anchor" half of this journey verifies curated inclusion via
    // that Download path instead of the live per-target loop below (which
    // is exercised, meaningfully, only against the scratch workspace).
    await page.getByTestId('codegen-targets-table__download-typescript').click();
    await expect(page.getByTestId('download-config-dialog')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('download-config-dialog__ns-row-cdm.base.datetime')).toBeVisible();
    await evidence.checkpoint('curated-namespace-available-for-download');

    // Download itself is server-backed (`/api/codegen`) — same
    // historically-503-prone endpoint as the topbar Export Code modal (see
    // this plan's Global Constraints correction). Treat it as a SOFT
    // assertion under the existing `KI-codegen-503` ledger entry, matching
    // J13's precedent for Export — it must not hard-fail this journey.
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 20000 }),
        page.getByTestId('download-config-dialog__generate').click()
      ]);
      expect(download.suggestedFilename().length).toBeGreaterThan(0);
    } catch (err) {
      evidence.softFinding(
        'KI-codegen-503',
        `Curated Download (TypeScript, cdm.base.datetime) failed or timed out: ${err instanceof Error ? err.message : String(err)}`
      );
      // Best-effort dialog close so a failed/timed-out Generate doesn't leave
      // the modal open for the scratch-workspace steps below.
      await page
        .getByTestId('download-config-dialog__cancel')
        .click({ timeout: 2000 })
        .catch(() => {});
    }
    await evidence.checkpoint('curated-download-attempted');

    // --- Scratch workspace ---------------------------------------------------
    // The live per-target preview DOES reflect user-authored content — this
    // is where "Code tab renders non-empty output per target" is actually
    // exercised (confirmed live this session for all five targets below).
    await authorScratchType(page, {
      name: SCRATCH_TYPE,
      namespace: SCRATCH_NAMESPACE,
      attributes: [{ name: 'title', typeName: 'string', cardinality: '(1..1)' }]
    });
    await page.getByTestId(`ns-type-nav-${SCRATCH_NAMESPACE}.${SCRATCH_TYPE}`).click();
    await page.getByRole('tab', { name: 'Code' }).click();
    await expect(page.getByTestId('panel-codePreview')).toBeVisible({ timeout: 20000 });

    for (const target of TARGETS) {
      // Clicking a different target's View (eye) button directly swaps the
      // open viewer — no need to collapse the previous one first
      // (CodePreviewPanel.tsx's handleViewTarget only toggles closed when
      // the SAME target is clicked again).
      await page.getByTestId(`codegen-targets-table__view-${target}`).click();
      await expect(page.getByTestId('codegen-status')).toContainText(/Generated/i, { timeout: 20000 });
      const output = await page.getByTestId('code-preview-editor').textContent();
      expect(output?.trim().length ?? 0, `expected non-empty scratch ${target} output`).toBeGreaterThan(0);
    }
    await evidence.checkpoint('scratch-all-targets-rendered');
  });
});
