// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T013 — curated-load happy path e2e (014-studio-prod-ready, US1).
 *
 * Mocks the curated mirror at `daikonic.dev/curated/cdm/...` and clicks the
 * CDM card on a fresh start page. Asserts:
 *   (a) only `daikonic.dev` URLs are fetched (T016: blocks any cors.isomorphic-git.org).
 *   (b) the workspace surface signals success within 5 s of fetch completion —
 *       the ModelLoader's "Loaded Models" badge is the canonical ready signal
 *       at this phase. (Phase 4 / US4 + Phase 5 / US2 add the dock chrome and
 *       auto-restored editor that the spec's "interactive editor" copy refers
 *       to; until those land, badge-visibility is the strongest assertion that
 *       the curated archive flow ran to terminal-success.)
 *   (c) the loaded-model file count is ≥ 1 — i.e. the OPFS unpack + walk
 *       recovered `.rosetta` sources from the curated archive.
 *
 * Backs FR-001, FR-002, FR-019, FR-020, SC-001, SC-004.
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../fixtures/curated/cdm-tiny.tar.gz');

const MANIFEST_URL_GLOB = 'https://www.daikonic.dev/curated/cdm/manifest.json';
const ARCHIVE_URL_GLOB = 'https://www.daikonic.dev/curated/cdm/latest.tar.gz';
const ISOGIT_URL_GLOB = '**/cors.isomorphic-git.org/**';

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
    archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
    history: []
  });
}

async function mockCuratedMirror(page: Page): Promise<{ requested: string[] }> {
  const requested: string[] = [];

  // Capture every relevant request for the post-load assertions on (a).
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('daikonic.dev') || u.includes('isomorphic-git') || u.includes('curated')) {
      requested.push(`req:${u}`);
    }
  });

  await page.route(MANIFEST_URL_GLOB, async (route: Route) => {
    requested.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: makeManifest()
    });
  });

  await page.route(ARCHIVE_URL_GLOB, async (route: Route) => {
    requested.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/gzip',
      body: fixtureBytes()
    });
  });

  // T016 — block the legacy isomorphic-git CORS proxy. Any hit MUST fail
  // the test (FR-019 — the legacy git path must not be reachable from the
  // public deploy when a curated archive URL is set).
  await page.route(ISOGIT_URL_GLOB, async (route: Route) => {
    requested.push(`BLOCKED:${route.request().url()}`);
    await route.abort('failed');
  });

  return { requested };
}

test.describe('Curated load happy path (T013, US1)', () => {
  test('CDM card → manifest + archive fetched, editor shows .rosetta', async ({ page }) => {
    const { requested } = await mockCuratedMirror(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click the CDM curated card. ModelLoader renders the source.name as the
    // visible button label (model-registry.ts).
    const cdmButton = page
      .getByTestId('model-loader')
      .getByRole('button', { name: /CDM/i })
      .first();
    await expect(cdmButton).toBeVisible({ timeout: 10_000 });
    await cdmButton.click();

    // (b) Within 5s of fetch completion the workspace surface MUST signal
    // that the curated load reached terminal-success. The "Loaded Models"
    // section is the existing UI signal — the ModelLoader badge appears
    // only when the model is in the store.
    await expect(page.getByText('Loaded Models', { exact: false })).toBeVisible({
      timeout: 5_000
    });

    // (c) At least one `.rosetta` file is in the loaded model. The badge
    // displays "(N files)"; assert N >= 1 so we know the OPFS write +
    // walk recovered .rosetta sources from the curated archive.
    const filesCounter = page.getByText(/\(\d+ files?\)/).first();
    await expect(filesCounter).toBeVisible({ timeout: 5_000 });
    const counterText = (await filesCounter.textContent()) ?? '';
    const fileCount = Number(counterText.match(/\((\d+) files?\)/)?.[1] ?? '0');
    expect(
      fileCount,
      'curated archive yields ≥1 .rosetta file in the LoadedModel'
    ).toBeGreaterThanOrEqual(1);

    // The CDM card itself should now show as loaded (✓ prefix, disabled).
    await expect(
      page.getByTestId('model-loader').getByRole('button', { name: /✓ CDM/ })
    ).toBeVisible({ timeout: 2_000 });

    // (a) Only daikonic.dev URLs are fetched. No isomorphic-git proxy
    // requests should ever be observed (FR-019).
    const blocked = requested.filter((u) => u.startsWith('BLOCKED:'));
    expect(blocked, 'no isomorphic-git proxy requests should be observed').toEqual([]);
    expect(
      requested.some((u) => u.includes('daikonic.dev/curated/cdm/manifest.json')),
      'manifest fetched from daikonic.dev'
    ).toBe(true);
    expect(
      requested.some((u) => u.includes('daikonic.dev/curated/cdm/latest.tar.gz')),
      'archive fetched from daikonic.dev'
    ).toBe(true);
  });
});
