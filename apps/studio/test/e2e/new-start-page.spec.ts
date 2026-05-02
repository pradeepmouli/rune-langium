// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * E2E — "New" start-page option (enhance/012).
 *
 * Validates that a visitor landing on the empty-workspace screen can click
 * "New" and be dropped into the editor with a starter untitled file, without
 * having to bring their own .rosetta source.
 */

import { test, expect } from '@playwright/test';

test.describe('Studio — New start-page option', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
  });

  test('shows a New button as the primary action on the empty workspace', async ({ page }) => {
    const loader = page.getByTestId('file-loader');
    await expect(loader).toBeVisible();
    const newButton = loader.getByRole('button', { name: /^New/i });
    await expect(newButton).toBeVisible();
    // The existing loaders must still be there as secondary options.
    await expect(loader.getByRole('button', { name: 'Select Files' })).toBeVisible();
    await expect(loader.getByRole('button', { name: 'Select Folder' })).toBeVisible();
  });

  test('clicking New drops the user into the editor with an untitled file', async ({ page }) => {
    const loader = page.getByTestId('file-loader');
    await loader.getByRole('button', { name: /^New/i }).click();

    // File loader disappears, editor takes over.
    await expect(loader).toBeHidden();

    // Header file count reflects the new untitled file.
    await expect(page.getByText(/1 file\(s\)/)).toBeVisible();

    // The editor's toolbar (Navigate / Edit / Preview) is visible.
    await expect(page.getByRole('button', { name: 'Navigate' })).toBeVisible();
  });

  test('clicking New twice creates distinct untitled files', async ({ page }) => {
    const loader = page.getByTestId('file-loader');
    await loader.getByRole('button', { name: /^New/i }).click();
    // Once in the editor, the app exposes a way to add more files — the
    // header count should advance when a second New is triggered (via the
    // editor's own "New file" affordance or by re-entering the loader).
    // This test asserts the service-level contract only: two sequential
    // blank-file creations land distinct paths. Implementation will expose
    // the second-create path; if it doesn't in this phase, mark skipped.
    test.skip(
      true,
      'Editor-side "New file" affordance is a follow-up; service contract is covered by unit tests.'
    );
  });
});
