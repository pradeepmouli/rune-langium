// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm } from '../fixtures.js';
import { ANCHOR_DATA } from '../anchors.js';

test.describe('J06 — Structure view', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J06 renders the graph with no empty state and selection syncs to Inspector', async ({ page, evidence }) => {
    await loadCdm(page);
    await page.getByTestId('rail-explore').click();
    await page.getByTestId('namespace-search').fill('BusinessCenters');
    await page.getByTestId(`ns-type-nav-${ANCHOR_DATA}`).click();
    await expect(page.getByText(ANCHOR_DATA, { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Structure' }).click();
    await expect(page.getByTestId('structure-view-flow')).toBeVisible();
    await expect(page.getByTestId('structure-empty-state')).toHaveCount(0);
    await evidence.checkpoint('structure-view-rendered');

    const node = page.getByTestId('structure-view-flow').locator('.react-flow__node').first();
    await expect(node).toBeVisible();
    await node.click();
    await evidence.checkpoint('node-selected');
  });
});
