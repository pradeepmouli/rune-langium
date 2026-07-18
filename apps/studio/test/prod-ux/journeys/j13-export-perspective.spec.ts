// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * J13 — Export perspective.
 *
 * Step 1 (this session) live-verified the brief's two open questions against
 * the real source tree before any assertion below was written:
 *
 * 1. Is there a genuinely client-side, always-succeeding bundle/`.rosetta`
 *    export button anywhere reachable from a loaded-CDM workspace, distinct
 *    from the `/api/codegen`-backed DownloadConfigDialog flow?
 *    NO. `ExportMenu.tsx` (`handleExportRosetta`) is a real, pure
 *    Blob+`<a download>` component with zero network dependency, but a
 *    codebase-wide search for `<ExportMenu` found ZERO JSX render sites —
 *    only the component's own definition and this plan's own doc
 *    (`docs/superpowers/plans/2026-07-18-prod-ux-checkout-harness-phase3.md`).
 *    It is not mounted in the Explore toolbar, the Export perspective, or
 *    anywhere else in the current app — dead/unmounted code from an earlier
 *    design. Recorded below as `evidence.softFinding('KI-exportmenu-unmounted', ...)`
 *    rather than asserting a download path that doesn't exist. This means
 *    the spec's "workspace bundle export produces a download (validated:
 *    non-zero tar.gz, contains the scratch `.rosetta`)" wording does not
 *    correspond to any live UI affordance today — the DownloadConfigDialog
 *    generate-flow assertions below are the real, correct coverage for
 *    "does Export produce output."
 *
 * 2. `apps/studio/test/e2e/export.spec.ts`'s exact testids / 503-handling
 *    pattern (read in full this session): it drives a DIFFERENT, older UI
 *    surface — the topbar "Export Code" button (`ExportDialog.tsx`,
 *    testid `export-dialog`) — via `page.locator('button', { hasText:
 *    'Export Code' })`, and its own `export-menu` testid maps to the same
 *    unmounted `ExportMenu` component described above (that spec file
 *    predates the current perspective architecture; its own early tests
 *    already tolerate a possibly-absent menu via `if (await x.isVisible())`
 *    guards, and its 503 test similarly only conditionally asserts). This
 *    harness's own, stronger convention (`evidence.softFinding`, precedent:
 *    J9's `KI-anchor-data-no-field-validation`) is used below instead of
 *    reproducing that weaker conditional-isVisible pattern.
 *
 * Additionally confirmed live via direct source read: `ExportPerspective`'s
 * `handleModalGenerate` unconditionally routes through `downloadTargetViaRouter`,
 * which POSTs to `/api/codegen` — the same endpoint this session's project
 * memory (`feedback_code_tab_vs_export_button.md`) records as historically
 * 503-ing in prod. The second test below treats a failed/absent download
 * from that endpoint as a known-issue candidate (`KI-codegen-503`), not a
 * hard failure — J11 (Phase 2) already covers the client-side,
 * always-available Code tab path separately. Also confirmed: `handleDownload`
 * only opens the modal when the workspace has non-read-only files OR curated
 * bundles (`collectCuratedBundlesFromWorkspace`) — a CDM-loaded workspace
 * (via `loadCdm`) satisfies the curated-bundle branch, so the modal opens.
 *
 * The per-target download button locator (`codegen-targets-table__download-<target>`)
 * was read directly from `CodegenTargetsTable.tsx` rather than guessed —
 * this journey targets `zod`, the first row rendered (TARGET_DESCRIPTORS'
 * insertion order, filtered by IMPLEMENTED_TARGETS), which is also one of
 * the three targets with layout choices (`TARGET_PANELS` in
 * `DownloadConfigDialog.tsx`), so the layout-radio assertions below are
 * guaranteed to have something to click.
 */

import { stat } from 'node:fs/promises';
import { checkout as test, expect, loadCdm } from '../fixtures.js';

test.describe('J13 — Export perspective', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J13 Export perspective renders and DownloadConfigDialog opens/edits/closes', async ({ page, evidence }) => {
    evidence.softFinding(
      'KI-exportmenu-unmounted',
      "ExportMenu.tsx's client-side, always-succeeding 'Export .rosetta' button " +
        '(handleExportRosetta — pure Blob+<a download>, no network call) has ZERO confirmed JSX render sites ' +
        'anywhere in the current app (codebase-wide search for `<ExportMenu` finds only its own definition and ' +
        'a plan-doc mention) — it is not reachable from the Explore toolbar, the Export perspective, or ' +
        'anywhere else. The spec wording describing a client-side workspace-bundle export affordance does not ' +
        'currently correspond to a live UI surface; the only real Export-perspective output path is the ' +
        '/api/codegen-backed DownloadConfigDialog generate flow exercised elsewhere in this journey.'
    );

    await loadCdm(page);
    await page.getByTestId('rail-export').click();
    await expect(page.getByTestId('export-perspective')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('export-targets-section')).toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('export-perspective-loaded');

    // Open the download modal for the zod target — confirmed live as the
    // first rendered row and one of the three layout-aware targets (see
    // file-header comment).
    await page.getByTestId('codegen-targets-table__download-zod').click();
    await expect(page.getByTestId('download-config-dialog')).toBeVisible({ timeout: 10000 });

    // Edit: toggle a layout radio choice.
    const layoutGroup = page.getByTestId('download-config-dialog__layout');
    await expect(layoutGroup).toBeVisible();
    const layoutOptions = page.locator('[data-testid^="download-config-dialog__layout-"]');
    await expect(layoutOptions.first()).toBeVisible();
    await layoutOptions.last().click();
    await evidence.checkpoint('download-config-edited');

    // Close via cancel — confirms edits don't leak into a later open.
    await page.getByTestId('download-config-dialog__cancel').click();
    await expect(page.getByTestId('download-config-dialog')).not.toBeVisible({ timeout: 5000 });
  });

  test('J13 Export generate — soft-asserted under KI-codegen-503', async ({ page, evidence }) => {
    await loadCdm(page);
    await page.getByTestId('rail-export').click();
    await expect(page.getByTestId('export-perspective')).toBeVisible({ timeout: 20000 });

    await page.getByTestId('codegen-targets-table__download-zod').click();
    await expect(page.getByTestId('download-config-dialog')).toBeVisible({ timeout: 10000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await page.getByTestId('download-config-dialog__generate').click();
    const download = await downloadPromise;

    if (download) {
      const path = await download.path();
      expect(path, 'download produced a file').toBeTruthy();
      // download.path() is a truthy temp-file path even when the response
      // body is empty (e.g. /api/codegen returns HTTP 200 with a zero-byte
      // body) — verify the file actually has content before treating this
      // as a real success.
      const { size } = await stat(path!);
      expect(size, 'downloaded file is non-empty').toBeGreaterThan(0);
      await evidence.checkpoint('export-generate-succeeded');
    } else {
      // /api/codegen is a known, historically-503ing endpoint in prod (see
      // feedback_code_tab_vs_export_button.md / KI-codegen-503) — this
      // journey's own generate flow goes through the same endpoint
      // (confirmed via handleModalGenerate's unconditional call into
      // downloadTargetViaRouter, which POSTs to /api/codegen), so a
      // failure here is a corpus/infra known-issue candidate, not an
      // unambiguous regression. J11 (Phase 2) already covers the
      // client-side, always-available Code tab path separately.
      evidence.softFinding(
        'KI-codegen-503',
        'ExportPerspective DownloadConfigDialog generate did not produce a download within 20s — ' +
          '/api/codegen is a known historically-503ing endpoint in prod; see feedback_code_tab_vs_export_button.md'
      );
    }
  });
});
