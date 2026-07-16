// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm } from '../fixtures.js';
import { ANCHOR_DATA } from '../anchors.js';

test.describe('J05 — Inspector pane', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J05 Inspector shows heading, namespace, reference-only badge, and populated members', async ({
    page,
    evidence
  }) => {
    await loadCdm(page);
    const centerStack = page.getByTestId('center-stack');

    await page.getByTestId('rail-explore').click();
    await page.getByTestId('namespace-search').fill('BusinessCenters');
    await page.getByTestId(`ns-type-nav-${ANCHOR_DATA}`).click();
    await expect(page.getByText(ANCHOR_DATA, { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(centerStack.getByRole('heading', { name: 'BusinessCenters' })).toBeVisible();
    await expect(centerStack.getByText('cdm.base.datetime', { exact: true })).toBeVisible();
    await expect(centerStack.getByText('Reference Only', { exact: true })).toBeVisible();
    await expect(centerStack.getByText(/Members \([1-9]/)).toBeVisible({ timeout: 15000 });
    await evidence.checkpoint('inspector-populated');
  });
});
