// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Buffer } from 'node:buffer';
import { expect, type Page } from '@playwright/test';
import { referenceFiles } from '../../../../packages/codegen/test/helpers/cdm-reference.js';
import { typeNavigationButton } from './type-navigation.js';

export async function loadPinnedFunction(page: Page) {
  await page.goto('./');
  await page.locator('input[type="file"][accept=".rosetta"]').setInputFiles(
    referenceFiles().map(({ uri, content }) => ({
      name: uri.split('/').at(-1)!,
      mimeType: 'text/plain',
      buffer: Buffer.from(content)
    }))
  );
  await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('namespace-search').fill('Abs');
  await typeNavigationButton(page, 'cdm.base.math.Abs', 'RosettaFunction').click();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  // Local LSP/router notices are dismissible; they must not trap keyboard focus during editing.
  while (await page.getByRole('button', { name: 'Dismiss notification', exact: true }).count())
    await page.getByRole('button', { name: 'Dismiss notification', exact: true }).first().click();
  await expect(page.getByTestId('implementation-editor')).toBeVisible();
}

export async function openBuilder(page: Page) {
  await page.getByTestId('implementation-editor').locator('.cm-content').press('ControlOrMeta+End');
  await page
    .getByRole('region', { name: 'Function implementation' })
    .getByRole('button', { name: 'Builder', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Expression builder' });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((el) =>
        el.getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running')
      )
    )
    .toBe(true);
  return dialog;
}
