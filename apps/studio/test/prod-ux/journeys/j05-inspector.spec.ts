// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm } from '../fixtures.js';
import { expectPopulatedAttributes } from '../readiness.js';
import { ANCHOR_DATA } from '../anchors.js';

test.describe('J05 — Inspector pane', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J05 Inspector shows heading, namespace, reference-only badge, and populated members', async ({
    page,
    evidence
  }) => {
    await loadCdm(page, evidence);
    const centerStack = page.getByTestId('center-stack');

    await page.getByTestId('rail-explore').click();
    await page.getByTestId('namespace-search').fill('BusinessCenters');
    await page.getByTestId(`ns-type-nav-${ANCHOR_DATA}`).click();
    await expect(page.getByText(ANCHOR_DATA, { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(centerStack.getByRole('heading', { name: 'BusinessCenters' })).toBeVisible();
    await expect(centerStack.getByText('cdm.base.datetime', { exact: true })).toBeVisible();
    await expect(centerStack.getByText('Reference Only', { exact: true })).toBeVisible();
    await expectPopulatedAttributes(centerStack);
    await evidence.checkpoint('inspector-populated');
  });
  test(
    'J05 narrow viewport keeps three selected center panes readable',
    { annotation: { type: 'journey-subid', description: 'narrow-layout' } },
    async ({ page, evidence }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await loadCdm(page, evidence);
      await page.getByTestId('rail-explore').click();
      await page.getByTestId('namespace-search').fill('BusinessCenters');
      await page.getByTestId(`ns-type-nav-${ANCHOR_DATA}`).click();
      for (const name of ['Graph', 'Source', 'Inspector']) {
        const button = page.getByRole('button', { name, exact: true });
        if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
      }
      const structure = page.getByRole('button', { name: 'Structure', exact: true });
      if ((await structure.getAttribute('aria-pressed')) === 'true') await structure.click();
      const stack = page.getByTestId('center-stack');
      await expect(stack).toHaveAttribute('data-count', '3');
      await expect(stack).toHaveCSS('display', 'grid');
      const panes = await stack.locator('[data-pane]').evaluateAll((elements) =>
        elements.map((element) => ({
          width: element.getBoundingClientRect().width,
          parentWidth: element.parentElement!.getBoundingClientRect().width
        }))
      );
      for (const pane of panes) {
        expect(pane.width).toBeGreaterThan(300);
        expect(pane.width).toBeLessThanOrEqual(pane.parentWidth);
      }
      const inspector = stack.locator('[data-pane="inspector"]');
      await inspector.scrollIntoViewIfNeeded();
      await expectPopulatedAttributes(inspector);
      await evidence.checkpoint('narrow-three-pane-inspector');
    }
  );
});
