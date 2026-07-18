// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Route } from '@playwright/test';
import { checkout as test, expect, loadCdm } from '../fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolves to apps/studio/test/fixtures/curated/cdm-tiny.tar.gz — confirmed
// live this session (the file exists at that path; two levels up from
// apps/studio/test/prod-ux/journeys/ lands on apps/studio/test/).
const FIXTURE_PATH = resolve(__dirname, '../../fixtures/curated/cdm-tiny.tar.gz');
const MANIFEST_URL = 'https://www.daikonic.dev/curated/cdm/manifest.json';
const ARCHIVE_URL = 'https://www.daikonic.dev/curated/cdm/latest.tar.gz';

function fixtureBytes(): Buffer {
  return readFileSync(FIXTURE_PATH);
}

function makeManifest(): string {
  return JSON.stringify({
    schemaVersion: 1,
    modelId: 'cdm',
    version: '2026-04-25',
    sha256: createHash('sha256').update(fixtureBytes()).digest('hex'),
    sizeBytes: fixtureBytes().byteLength,
    generatedAt: '2026-04-25T03:00:00Z',
    upstreamCommit: '',
    upstreamRef: 'master',
    archiveUrl: ARCHIVE_URL,
    history: []
  });
}

test.describe('J16 — Resilience & chrome', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  // Ported from test/e2e/curated-load-cancel.spec.ts (T019b, EC-2) — same
  // mock-delayed-archive + Cancel-before-completion + reload + 4-part
  // assertion sequence, onto the checkout fixture with evidence checkpoints
  // added. See that file's own doc comment for the EC-2 spec rationale this
  // absorbs verbatim.
  //
  // SPEC-VS-REALITY GAP, confirmed live this session (not a local-env flake):
  // curated-model loads no longer have a client-observable, cancellable
  // in-flight network window. `buildArchiveLoader()` in
  // apps/studio/src/store/model-store.ts returns an instant, synchronous
  // stub (`{ files: [], commitHash: 'latest', ... }`) with the comment
  // "019 Phase 0: bundle content is fetched server-to-server by /api/parse.
  // We record metadata only — no archive download, no OPFS write." The
  // MANIFEST_URL/ARCHIVE_URL routes this test mocks are for a client-side
  // fetch flow that no longer exists post-019 (see the
  // project_no_browser_corpus_parsing memory note), so neither the "Cancel"
  // button nor the "Connecting/Cloning/Reading/Discovering" progress text
  // (both are ProgressBar states unique to the git-clone/"+ Load from
  // custom URL" path) ever render for a curated source. Confirmed this is
  // a genuine, pre-existing architecture-vs-test-premise gap, not something
  // this port introduced: the ORIGINAL test/e2e/curated-load-cancel.spec.ts
  // fails identically, under its own native config (plain `vite dev`, no
  // wrangler proxy involved) — verified live this session before deleting
  // it. Recorded as a soft finding rather than forcing a broken assertion
  // or fabricating a pass.
  test('J16 curated load cancel mid-flight returns cleanly to the loader', async ({ page, evidence }) => {
    await page.route(MANIFEST_URL, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: makeManifest() });
    });
    await page.route(ARCHIVE_URL, async (route: Route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({ status: 200, contentType: 'application/gzip', body: fixtureBytes() });
    });

    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');

    const cdmButton = page.getByTestId('model-loader').getByRole('button', { name: /CDM/i }).first();
    await expect(cdmButton).toBeVisible({ timeout: 10000 });
    await cdmButton.click();

    const cancelButton = page.getByTestId('model-loader').getByRole('button', { name: 'Cancel' });
    const connectingText = page.getByText(/Connecting to|Cloning|Reading|Discovering/);
    const reachedInFlight = await cancelButton
      .or(connectingText)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!reachedInFlight) {
      evidence.softFinding(
        'KI-curated-load-no-cancel-window',
        'Curated-model loads no longer expose an in-flight/cancellable network window (buildArchiveLoader() ' +
          'returns an instant client-side stub post-019; real content is fetched server-to-server by /api/parse) ' +
          '— neither the Cancel button nor the Connecting/Cloning/Reading/Discovering progress text ever ' +
          'rendered within 5s of clicking the CDM card, so the EC-2 mid-flight-cancel scenario this test was ' +
          'ported from (test/e2e/curated-load-cancel.spec.ts, T019b) cannot be exercised via the current UI.'
      );
      await evidence.checkpoint('no-cancel-window-soft-finding');
      return;
    }
    await evidence.checkpoint('load-in-flight');

    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
    } else {
      await page.goto('./');
    }
    await evidence.checkpoint('cancelled');

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText(/Loading CDM.*failed/i)).not.toBeVisible({ timeout: 1000 });
    await expect(page.getByText('Loaded Models', { exact: false })).not.toBeVisible({ timeout: 1000 });
    await expect(page.getByTestId('model-loader').getByRole('button', { name: /✓ CDM/ })).not.toBeVisible({
      timeout: 1000
    });
    await expect(page.getByTestId('model-loader').getByRole('button', { name: /^CDM/ })).toBeVisible({
      timeout: 1000
    });

    const recents = await page.evaluate(async () => {
      try {
        return await new Promise<string[]>((res, rej) => {
          const req = indexedDB.open('rune-studio');
          req.onerror = () => rej(req.error);
          req.onsuccess = () => {
            const db = req.result;
            if (!Array.from(db.objectStoreNames).includes('recents')) {
              db.close();
              res([]);
              return;
            }
            const all = db.transaction('recents', 'readonly').objectStore('recents').getAll();
            all.onerror = () => rej(all.error);
            all.onsuccess = () => {
              db.close();
              res(((all.result as { id: string }[]) ?? []).map((e) => JSON.stringify(e)));
            };
          };
        });
      } catch {
        return [];
      }
    });
    const containsCdm = recents.some((entry) => entry.toLowerCase().includes('cdm'));
    expect(containsCdm, 'no recents entry referencing the cancelled CDM workspace').toBe(false);
    await evidence.checkpoint('no-orphaned-workspace');
  });

  test('J16 reload mid-Explore restores active perspective and dockview layout', async ({ page, evidence }) => {
    await loadCdm(page);
    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('before-reload');

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('after-reload');
  });

  test('J16 rail buttons for workspace-requiring perspectives are disabled with no workspace', async ({
    page,
    evidence
  }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

    // No workspace loaded yet — explore/git/export require one; workspaces/
    // settings do not (perspective-registry.ts's requiresWorkspace flags).
    for (const railId of ['rail-explore', 'rail-git', 'rail-export']) {
      await expect(page.getByTestId(railId)).toBeDisabled();
    }
    for (const railId of ['rail-workspaces', 'rail-settings']) {
      await expect(page.getByTestId(railId)).toBeEnabled();
    }
    await evidence.checkpoint('rail-disabled-no-workspace');

    // SPEC ADAPTATION: "resolveEffectivePerspective fallback (delete last
    // file while in Explore → lands on Workspaces)" has no reachable UI
    // trigger — confirmed via source that neither FileTreePanel.tsx
    // (open-only) nor FileTabStrip in explore-chrome.tsx (select/create
    // only) exposes any delete/close/remove action. Recorded as a soft
    // finding rather than driving the store directly (which would bypass
    // this harness's whole "exercise the real UI" principle) or fabricating
    // a pass. resolveEffectivePerspective itself remains covered by unit
    // tests elsewhere in the repo; this is specifically about the E2E
    // UI-driven trigger the spec describes not existing.
    evidence.softFinding(
      'KI-delete-file-unreachable',
      'No UI action deletes a WorkspaceFile entirely (FileTreePanel is open-only, FileTabStrip is select/create ' +
        'only) — resolveEffectivePerspective\'s "delete last file" fallback path cannot be exercised via real UI.'
    );
  });

  test('J16 toasts appear and auto-dismiss', async ({ page, evidence }) => {
    // Reuses the exact real trigger found in ExportPerspective.tsx's
    // handleModalGenerate: a CodegenDownloadError (thrown on any non-OK
    // /api/codegen response) calls showToast({ variant: 'destructive',
    // title: 'Code generation failed', ... }) — a REGULAR toast (default
    // duration={4000}), not a loading toast (those never auto-dismiss; see
    // StudioToastProvider.tsx's showLoadingToast, timeout: 0). This is the
    // same /api/codegen failure path Task 2 (J13) soft-asserts under
    // KI-codegen-503 — best-effort here too, since success vs. 503 is prod
    // infra state, not something this journey controls.
    await loadCdm(page);
    await page.getByTestId('rail-export').click();
    await expect(page.getByTestId('export-perspective')).toBeVisible({ timeout: 20000 });
    await page
      .getByTestId('export-targets-section')
      .getByRole('button', { name: /download/i })
      .first()
      .click();
    await expect(page.getByTestId('download-config-dialog')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('download-config-dialog__generate').click();

    // Live-verified this session against packages/design-system/src/ui/toast.tsx
    // + @base-ui/react's ToastRoot source (node_modules/@base-ui/react/toast/root/ToastRoot.js):
    // the rendered toast root has `role="dialog"` (Base UI sets
    // `role: isHighPriority ? 'alertdialog' : 'dialog'`; StudioToastProvider
    // never sets `toast.priority`, so it's always the `'dialog'` branch),
    // with `aria-labelledby` pointing at the rendered `ToastTitle` — and
    // `showToast` here is called with `title: 'Code generation failed'`, so
    // the dialog's accessible name is that title text. `getByRole('dialog',
    // { name: ... })` is therefore the correct, real locator — NOT a
    // plain-text locator, since the description text ("detail") is separate
    // and the title/description are two different child elements under the
    // same role="dialog" root.
    const toast = page.getByRole('dialog', { name: 'Code generation failed' });
    const appeared = await toast.isVisible({ timeout: 20000 }).catch(() => false);
    if (appeared) {
      await evidence.checkpoint('toast-appeared');
      await expect(toast).not.toBeVisible({ timeout: 5000 });
      await evidence.checkpoint('toast-auto-dismissed');
    } else {
      evidence.softFinding(
        'KI-codegen-503',
        'J16 toast-auto-dismiss check found no /api/codegen failure to trigger the "Code generation failed" ' +
          'toast within 20s — either /api/codegen succeeded (no toast expected) or is slower than the timeout.'
      );
    }
  });
});
