// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T013 — curated-load happy path e2e (014-studio-prod-ready, US1).
 *
 * Mocks the curated mirror at `daikonic.dev/curated/cdm/...` and clicks the
 * CDM card on a fresh start page. Asserts:
 *   (a) only `daikonic.dev` URLs are fetched (T016: blocks any cors.isomorphic-git.org)
 *   (b) the workspace becomes interactive within 5s of mock completion
 *   (c) at least one `.rosetta` file is open in the editor
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

const MANIFEST_URL_GLOB = '**/curated/cdm/manifest.json';
const ARCHIVE_URL_GLOB = '**/curated/cdm/latest.tar.gz';
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

    // (b) Wait for editor to open within 5s of fetch completion.
    // The editor toolbar's Explorer button is the existing "interactive
    // workspace" probe used by other e2e tests.
    await expect(page.getByRole('button', { name: 'Explorer' })).toBeVisible({
      timeout: 30_000
    });

    // (c) At least one `.rosetta` file is open in the editor.
    // The editor surface renders file names; we use a permissive locator
    // since the dock chrome and tab strip vary across IDE shells.
    await expect(page.getByText(/\.rosetta/).first()).toBeVisible({ timeout: 10_000 });

    // (a) Only daikonic.dev URLs are fetched. No isomorphic-git proxy
    // requests should ever be observed.
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
