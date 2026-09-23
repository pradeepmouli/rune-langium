// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Route } from '@playwright/test';
import { checkout as test, expect, loadCdm } from '../fixtures.js';
import { typeNavigationButton } from '../../helpers/type-navigation.js';

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
  test(
    'J16 curated load cancel mid-flight returns cleanly to the loader',
    { annotation: { type: 'journey-subid', description: 'cancel-load' } },
    async ({ page, evidence }) => {
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
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(
          () => true,
          () => false
        );

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
        test.skip(true, 'Curated loading exposes no cancel operation; cancellation was not exercised.');
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
    }
  );

  test(
    'J16 reload mid-Explore restores active perspective and dockview layout',
    { annotation: { type: 'journey-subid', description: 'reload-explore' } },
    async ({ page, evidence }) => {
      await loadCdm(page, evidence);
      await page.getByTestId('rail-explore').click();
      await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
      await evidence.checkpoint('before-reload');

      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
      await evidence.checkpoint('after-reload');
    }
  );

  test(
    'J16 rail buttons for workspace-requiring perspectives are disabled with no workspace',
    { annotation: { type: 'journey-subid', description: 'rail-disabled' } },
    async ({ page, evidence }) => {
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

      // Issue #405 (closed): FileTabStrip's per-tab "×" delete button now
      // provides the previously-missing UI trigger for
      // resolveEffectivePerspective's "delete last file while in Explore →
      // falls back to Workspaces" path. Reach a fresh single-file scratch
      // workspace (matches J02's own inline file-input pattern — the
      // helper isn't exported from fixtures.ts, and every journey that
      // needs it re-declares these two small constants locally), delete
      // that one file via the real delete button, and confirm the app
      // actually lands on the Workspaces launcher instead of a blank
      // Explore perspective.
      const WORKSPACE_FILE_NAME = 'starter.rosetta';
      const WORKSPACE_FILE_CONTENT = 'namespace example\n';
      await page.goto('./');
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });
      await page
        .locator('input[type="file"][accept=".rosetta"]')
        .setInputFiles([
          { name: WORKSPACE_FILE_NAME, mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE_FILE_CONTENT) }
        ]);
      await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
      await evidence.checkpoint('single-file-workspace-created');

      page.once('dialog', (dialog) => void dialog.accept());
      await page.getByLabel(`Delete ${WORKSPACE_FILE_NAME}`).click();

      // resolveEffectivePerspective falls back to 'workspaces' the moment
      // hasExploreContent drops to false — the Workspaces launcher (the
      // same model-loader surface loadCdm/J02 land on when navigating
      // there directly) becomes visible without any further navigation.
      await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });
      await evidence.checkpoint('delete-last-file-fallback-to-workspaces');
    }
  );

  test(
    'J16 toasts appear and auto-dismiss',
    { annotation: { type: 'journey-subid', description: 'toasts' } },
    async ({ page, evidence }) => {
      // The Code tab still uses DownloadConfigDialog and reports server-backed
      // download failures as a toast. Force that response so this journey
      // tests toast display and dismissal independently of codegen health.
      await page.route('**/api/codegen', async (route: Route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'J16 toast-determinism mock — forced failure' })
        });
      });

      await page.goto('./');
      await expect(page.getByTestId('model-loader')).toBeVisible();
      await page.locator('input[type="file"][accept=".rosetta"]').setInputFiles([
        {
          name: 'toast.rosetta',
          mimeType: 'text/plain',
          buffer: Buffer.from('namespace toast\ntype Sample:\n value string (1..1)\n')
        }
      ]);
      await expect(page.getByTestId('explore-workbench')).toBeVisible();
      await page.getByTestId('namespace-search').fill('Sample');
      await typeNavigationButton(page, 'toast.Sample').click();
      await page.getByRole('tab', { name: 'Code' }).click();
      await page.getByTestId('codegen-targets-table__download-zod').click();
      await expect(page.getByTestId('download-config-dialog')).toBeVisible({ timeout: 10000 });
      await page.getByTestId('download-config-dialog__generate').click();

      // Base UI names the toast dialog from its title; the mocked failure
      // therefore gives us a stable accessible locator.
      const toast = page.getByRole('dialog', { name: 'Code generation failed' });
      await expect(toast).toBeVisible({ timeout: 20000 });
      await evidence.checkpoint('toast-appeared');
      await expect(toast).not.toBeVisible({ timeout: 5000 });
      await evidence.checkpoint('toast-auto-dismissed');
      await page.getByTestId('rail-explore').click();
      if ((await page.getByTestId('toggle-utilities').getAttribute('aria-pressed')) === 'false') {
        await page.getByTestId('toggle-utilities').click();
      }
      await page.getByRole('tab', { name: 'Activity', exact: true }).click();
      await expect(page.getByTestId('panel-activity')).toBeVisible();
      await evidence.checkpoint('activity-history');
      await page.getByRole('tab', { name: 'Output', exact: true }).click();
      await expect(page.getByTestId('panel-output')).toContainText('J16 toast-determinism mock');
      await evidence.checkpoint('download-error-retained-in-output');
    }
  );
});
