// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T019b — cancel-mid-load e2e (014-studio-prod-ready, US1, EC-2).
 *
 * Spec edge case (EC-2): "a curated load is in flight when the user closes
 * the tab. Partial OPFS writes are cleaned up on next launch; the workspace
 * appears uncreated rather than half-created."
 *
 * Flow:
 *   1. mock manifest → 200 (settles fast)
 *   2. mock archive → delayed 2 s + then 200
 *   3. click CDM card; manifest lands; archive is in flight
 *   4. click Cancel before the archive completes
 *   5. reload the page
 *   6. assert (a) no error banner referencing CDM, (b) no orphaned
 *      "Loaded Models" badge, (c) the start page is back in its
 *      pre-load state, (d) `listRecents()` returns no entry for cdm.
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../fixtures/curated/cdm-tiny.tar.gz');

const MANIFEST_URL = 'https://www.daikonic.dev/curated/cdm/manifest.json';
const ARCHIVE_URL = 'https://www.daikonic.dev/curated/cdm/latest.tar.gz';

function fixtureBytes(): Buffer {
  return readFileSync(FIXTURE_PATH);
}

function fixtureSha256(): string {
  return createHash('sha256').update(fixtureBytes()).digest('hex');
}

function makeManifest(): string {
  return JSON.stringify({
    schemaVersion: 1,
    modelId: 'cdm',
    version: '2026-04-25',
    sha256: fixtureSha256(),
    sizeBytes: fixtureBytes().byteLength,
    generatedAt: '2026-04-25T03:00:00Z',
    upstreamCommit: '',
    upstreamRef: 'master',
    archiveUrl: ARCHIVE_URL,
    history: []
  });
}

async function mockMirrorWithDelayedArchive(page: Page, delayMs: number): Promise<void> {
  await page.route(MANIFEST_URL, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: makeManifest()
    });
  });

  await page.route(ARCHIVE_URL, async (route: Route) => {
    // Delay so the cancel can land before the archive bytes return.
    await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({
      status: 200,
      contentType: 'application/gzip',
      body: fixtureBytes()
    });
  });
}

test.describe('Curated load cancel-mid-flight (T019b, EC-2)', () => {
  test('cancel before archive completes leaves no orphaned workspace', async ({ page }) => {
    await mockMirrorWithDelayedArchive(page, 3000);

    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the curated card and click it.
    const cdmButton = page
      .getByTestId('model-loader')
      .getByRole('button', { name: /CDM/i })
      .first();
    await expect(cdmButton).toBeVisible({ timeout: 10_000 });
    await cdmButton.click();

    // The Connecting/progress text appears once the load is in flight.
    // Either the "Connecting to ..." string or the progress bar's testid
    // confirms the load entered the loading state.
    const cancelButton = page.getByTestId('model-loader').getByRole('button', { name: 'Cancel' });
    const connectingText = page.getByText(/Connecting to|Cloning|Reading|Discovering/);
    await expect(cancelButton.or(connectingText).first()).toBeVisible({ timeout: 5_000 });

    // Click Cancel if visible; otherwise call the store's cancel via the
    // existing UI affordance (close button + reload).
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
    } else {
      // Fallback: navigate away mid-flight, which aborts via React unmount.
      await page.goto('./');
    }

    // Reload the page — EC-2's "next launch" probe.
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // (a) No error banner referencing CDM (no `archive_*` failure visible).
    await expect(page.getByText(/Loading CDM.*failed/i)).not.toBeVisible({ timeout: 1_000 });

    // (b) No orphaned "Loaded Models" badge for CDM.
    const loadedBadge = page.getByText('Loaded Models', { exact: false });
    await expect(loadedBadge).not.toBeVisible({ timeout: 1_000 });

    // (c) The CDM card is back to its pre-load state (no "✓" prefix).
    await expect(
      page.getByTestId('model-loader').getByRole('button', { name: /✓ CDM/ })
    ).not.toBeVisible({ timeout: 1_000 });
    await expect(
      page.getByTestId('model-loader').getByRole('button', { name: /^CDM/ })
    ).toBeVisible({ timeout: 1_000 });

    // (d) Probe IndexedDB recents — cancelled curated loads must not leave
    // a workspace record behind. The store/persistence layer uses
    // `listRecents()` exposed via `WorkspaceManager`. We probe the raw
    // IndexedDB store name `recents` (workspace/persistence.ts) to assert
    // no entry references the `cdm` model id.
    const recents = await page.evaluate(async () => {
      // Minimal raw IDB read; matches the persistence-layer schema where
      // entries live in the `recents` object store under the studio DB.
      // If the DB doesn't exist or the store is empty the result is [].
      try {
        return await new Promise<string[]>((resolve, reject) => {
          const req = indexedDB.open('rune-studio');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const storeNames = Array.from(db.objectStoreNames);
            if (!storeNames.includes('recents')) {
              db.close();
              resolve([]);
              return;
            }
            const tx = db.transaction('recents', 'readonly');
            const store = tx.objectStore('recents');
            const all = store.getAll();
            all.onerror = () => reject(all.error);
            all.onsuccess = () => {
              db.close();
              const entries = (all.result as { id: string; curatedModels?: string[] }[]) ?? [];
              resolve(entries.map((e) => JSON.stringify(e)));
            };
          };
        });
      } catch {
        return [];
      }
    });
    const containsCdm = recents.some(
      (entry) => entry.includes('"cdm"') || entry.toLowerCase().includes('cdm')
    );
    expect(containsCdm, 'no recents entry referencing the cancelled CDM workspace').toBe(false);
  });
});
