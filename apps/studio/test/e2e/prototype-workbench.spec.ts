// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { expect, test } from '@playwright/test';

const source = `namespace demo
type Party:
  name string (1..1)`;

async function createPrototype(page: Parameters<typeof test>[0]['page']) {
  await page.goto('./');
  await page.locator('input[type="file"][accept=".rosetta"]').setInputFiles({
    name: 'demo.rosetta',
    buffer: Buffer.from(source),
    mimeType: 'text/plain'
  });

  await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('rail-prototype').click();
  await expect(page.getByTestId('prototype-perspective')).toBeVisible();
  await page.getByRole('button', { name: 'New instance' }).click();
  await expect(page.getByRole('heading', { name: 'New instance' })).toBeVisible();
  await page.getByRole('button', { name: 'Instance type' }).click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Instance type' })).toContainText('Party');
  await page.getByLabel('Instance name').fill('Acme');
  await page.getByRole('button', { name: 'Create instance' }).click();

  await expect(page.getByTestId('prototype-grid').locator('tbody tr')).toHaveCount(1);
}

test('creates a prototype from the shared workspace type picker', async ({ page }) => {
  await createPrototype(page);

  const inspector = page.getByTestId('prototype-perspective');
  await expect(inspector.getByTestId('prototype-grid')).toBeVisible();
  await expect(inspector.getByRole('heading', { name: 'Acme' })).toBeVisible();
  await expect(inspector.getByLabel('Instance payload')).toContainText('{}');
});

test('keeps the Inspector, instance grid, and payload graph reachable at a constrained width', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await createPrototype(page);

  const perspective = page.getByTestId('prototype-perspective');
  const panes = perspective.getByRole('navigation', { name: 'Prototype panes' });
  await expect(panes).toBeVisible();
  await expect(perspective.getByRole('heading', { name: 'Acme' })).toBeVisible();

  await panes.getByRole('button', { name: 'Instances' }).click();
  await expect(perspective.getByTestId('prototype-grid')).toBeVisible();
  await perspective
    .getByTestId('prototype-grid')
    .getByRole('row', { name: /Acme.*demo\.Party/ })
    .click();
  await expect(perspective.getByRole('heading', { name: 'Acme' })).toBeVisible();

  await perspective.getByRole('button', { name: 'Toggle payload graph' }).click();
  await panes.getByRole('button', { name: 'Payload graph' }).click();
  await expect(perspective.getByTestId('prototype-payload-graph')).toBeVisible();
});
