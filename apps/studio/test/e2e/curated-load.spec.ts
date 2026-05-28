// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T013 — curated-load happy path e2e (014-studio-prod-ready, US1).
 *
 * Verifies the current browser-side curated-load contract:
 *   (a) clicking the CDM card reaches the loaded-model UI state
 *   (b) the browser does not hit the legacy isomorphic-git CORS proxy
 *
 * 019 Phase 0 moved curated bundle fetch/hydration server-side into `/api/parse`.
 * The browser now records bundle metadata only, so this test intentionally does
 * not assert direct manifest/archive requests or local `.rosetta` file counts.
 *
 * Backs FR-019, FR-020, SC-001.
 */

import { test, expect, type Route } from '@playwright/test';

const ISOGIT_URL_GLOB = '**/cors.isomorphic-git.org/**';

test.describe('Curated load happy path (T013, US1)', () => {
  test('CDM card reaches loaded state without legacy proxy traffic', async ({ page }) => {
    const blockedProxyRequests: string[] = [];
    await page.route(ISOGIT_URL_GLOB, async (route: Route) => {
      blockedProxyRequests.push(route.request().url());
      await route.abort('failed');
    });

    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');

    // Click the CDM curated card. ModelLoader renders the source.name as the
    // visible button label (model-registry.ts).
    const cdmButton = page.getByTestId('model-loader').getByRole('button', { name: /CDM/i }).first();
    await expect(cdmButton).toBeVisible({ timeout: 10_000 });
    await cdmButton.click();

    // (b) Within 5s of fetch completion the workspace surface MUST signal
    // that the curated load reached terminal-success. The "Loaded Models"
    // section is the existing UI signal — the ModelLoader badge appears
    // only when the model is in the store.
    await expect(page.getByText('Loaded Models', { exact: false })).toBeVisible({
      timeout: 5_000
    });

    // The CDM card itself should now show as loaded (✓ prefix, disabled).
    await expect(page.getByTestId('model-loader').getByRole('button', { name: /✓ CDM/ })).toBeVisible({
      timeout: 2_000
    });

    expect(blockedProxyRequests, 'no isomorphic-git proxy requests should be observed').toEqual([]);
  });
});
