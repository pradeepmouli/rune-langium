// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

const CDM_BUTTON = 'CDM (Common Domain Model)';
const ENUM_NODE_ID = 'cdm.base.datetime.BusinessCenterEnum';
const DATA_NODE_ID = 'cdm.base.datetime.BusinessCenters';
// Regression: cdm.base.staticdata.party is never pre-hydrated at load time.
// First navigation to it must populate Inspector members (resolveNodeFileRef fix).
const COUNTERPARTY_NODE_ID = 'cdm.base.staticdata.party.Counterparty';
const WORKSPACE_FILE_NAME = 'starter.rosetta';
const WORKSPACE_FILE_CONTENT = 'namespace example\n';

async function loadCdm(page: import('@playwright/test').Page) {
  await page.goto('./');
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveTitle(/Rune Studio/);
  await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles([
    {
      name: WORKSPACE_FILE_NAME,
      mimeType: 'text/plain',
      buffer: Buffer.from(WORKSPACE_FILE_CONTENT)
    }
  ]);
  await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('rail-workspaces').click();
  await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

  await page.getByTestId('model-loader').getByRole('button', { name: CDM_BUTTON }).click();

  await expect(page.getByText('Loaded Models', { exact: false })).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('button', { name: `Unload ${CDM_BUTTON}` })).toBeVisible({ timeout: 90000 });
}

test.describe('production checkout smoke', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('loads CDM and updates explorer-driven panes with reference-only design', async ({ page }) => {
    await loadCdm(page);
    const centerStack = page.getByTestId('center-stack');

    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

    const namespaceSearch = page.getByTestId('namespace-search');
    await namespaceSearch.fill('BusinessCenter');

    await page.getByTestId(`ns-type-nav-${ENUM_NODE_ID}`).click();
    await expect(page.getByText(ENUM_NODE_ID, { exact: true })).toBeVisible({ timeout: 15000 });

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

  test('Inspector populates members on first navigation to a never-hydrated curated namespace', async ({ page }) => {
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
  });
});
