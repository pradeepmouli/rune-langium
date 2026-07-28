// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm } from '../fixtures.js';

import {
  ANCHOR_ENUM as ENUM_NODE_ID,
  ANCHOR_DATA as DATA_NODE_ID,
  ANCHOR_NEVER_HYDRATED_DATA as COUNTERPARTY_NODE_ID
} from '../anchors.js';

test.describe('J04 — explorer navigation & on-demand hydration', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J04a explorer navigation updates panes with reference-only design', async ({ page, evidence }) => {
    await loadCdm(page);
    const centerStack = page.getByTestId('center-stack');

    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('explorer-nav');

    // The namespace tree is virtualized — filter narrowly before each click so
    // the target row is mounted regardless of corpus growth.
    const namespaceSearch = page.getByTestId('namespace-search');
    await namespaceSearch.fill('BusinessDayConvention');

    await page.getByTestId(`ns-type-nav-${ENUM_NODE_ID}`).click();
    await expect(page.getByText(ENUM_NODE_ID, { exact: true })).toBeVisible({ timeout: 15000 });

    await namespaceSearch.fill('BusinessCenters');
    await page.getByTestId(`ns-type-nav-${DATA_NODE_ID}`).click();
    await expect(page.getByText(DATA_NODE_ID, { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Structure' }).click();
    await expect(page.getByTestId('structure-view-flow')).toBeVisible();
    await expect(page.getByTestId('structure-empty-state')).toHaveCount(0);

    await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(centerStack.getByRole('heading', { name: 'BusinessCenters' })).toBeVisible();
    await expect(centerStack.getByText('cdm.base.datetime', { exact: true })).toBeVisible();
    await expect(centerStack.getByText('Reference Only', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Source' }).click();
    await expect(centerStack.getByText('namespace example', { exact: false })).toBeVisible();
  });

  test('J04b Inspector populates members on first navigation to a never-hydrated curated namespace', async ({
    page,
    evidence
  }) => {
    // Regression for fix/source-parse-recovery (resolveNodeFileRef, commit f6a64029).
    //
    // Before the fix: the hydration relink effect captured a stale resolveNodeFile
    // closure. On the first navigation to an unvisited namespace, linkDocument
    // received the synthetic ${bundleId}/${namespace} path instead of the real
    // deferred-model path, returned newModels:[], and Inspector stayed as a bare
    // header stub with no members.
    //
    // This test navigates directly to cdm.base.staticdata.party.Counterparty
    // without first visiting any other namespace, then asserts that the Inspector
    // shows a populated "Members (N)" list. An empty inspector would mean the bug
    // regressed.
    await loadCdm(page);
    const centerStack = page.getByTestId('center-stack');

    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20_000 });

    const namespaceSearch = page.getByTestId('namespace-search');
    await namespaceSearch.fill('Counterparty');

    await page.getByTestId(`ns-type-nav-${COUNTERPARTY_NODE_ID}`).click();
    await expect(page.getByText(COUNTERPARTY_NODE_ID, { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(centerStack.getByRole('heading', { name: 'Counterparty' })).toBeVisible({ timeout: 10_000 });
    await expect(centerStack.getByText('Reference Only', { exact: true })).toBeVisible();
    // /Members \([1-9]/ ensures at least one member — OtherForm's guard
    // `{members.length > 0 && ...}` means "Members (0)" is never rendered, but
    // being explicit here documents the intent clearly.
    await expect(centerStack.getByText(/Members \([1-9]/)).toBeVisible({ timeout: 30_000 });
    await evidence.checkpoint('hydration-complete');
  });

  test('J04c graph node shows a hydrating spinner while a never-hydrated namespace loads', async ({
    page,
    evidence
  }) => {
    // Regression for the BaseFlowNode hydrating-placeholder indicator (spec
    // 021 follow-up). Production's on-demand hydration round-trip
    // (/api/parse) is normally too fast to reliably observe the transient
    // spinner state, so this test deliberately delays that one endpoint —
    // the delay only affects when the browser's real request completes, it
    // does not fabricate the response — giving the spinner a guaranteed
    // window to assert against before it clears.
    await page.route('**/api/parse', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await loadCdm(page);

    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20_000 });

    const namespaceSearch = page.getByTestId('namespace-search');
    await namespaceSearch.fill('Counterparty');
    await page.getByTestId(`ns-type-nav-${COUNTERPARTY_NODE_ID}`).click();

    await expect(page.getByTestId('rune-node-hydrating-spinner')).toBeVisible({ timeout: 5_000 });
    await evidence.checkpoint('hydration-spinner-visible');

    // The spinner clears once hydration completes and members populate.
    const centerStack = page.getByTestId('center-stack');
    await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(centerStack.getByText(/Members \([1-9]/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('rune-node-hydrating-spinner')).toHaveCount(0);
    await evidence.checkpoint('hydration-complete');
  });
});
