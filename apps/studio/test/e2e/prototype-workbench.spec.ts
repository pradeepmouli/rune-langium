// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { expect, test } from '@playwright/test';

const source = `namespace demo
type Party:
  name string (1..1)`;

test('creates a prototype from the shared workspace type picker', async ({ page }) => {
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

  await expect(page.getByTestId('prototype-grid').getByRole('row', { name: /Acme.*demo\.Party/ })).toBeVisible();
  const inspector = page.getByTestId('prototype-perspective');
  await expect(inspector.getByRole('heading', { name: 'Acme' })).toBeVisible();
  await expect(inspector.getByLabel('Instance payload')).toContainText('{}');
});
