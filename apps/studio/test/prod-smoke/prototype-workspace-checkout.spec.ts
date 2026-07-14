// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Validated live against `pnpm dev` (plain Vite, no Pages Functions) for the
 * navigation/selector portion — workspace load, rail-prototype, New Instance
 * creation, tab switching, and label targeting all confirmed correct against
 * real rendered DOM (one real bug was found and fixed this way: `getByRole`
 * substring-matched "Name" against the sidebar's "New instance name" input;
 * `exact: true` below is required).
 *
 * The worker-backed schema round trip (Fields tab resolving past "Generating
 * preview…") could NOT be exercised under plain `pnpm dev`: `/api/parse` and
 * `/api/lsp/session` are Cloudflare Pages Functions unavailable outside
 * `pnpm dev:pages`/`dev:full`, and the codegen worker crashes without them.
 * This is a pre-existing dev-mode gap (confirmed unrelated to this feature —
 * the worker module and all its transitive imports load and transform
 * without error under plain Vite; the crash is a runtime dependency on the
 * Pages Functions layer, not a bug in this branch's code) — exactly why this
 * suite is a `PLAYWRIGHT_PROD_SMOKE`-gated *production* smoke test rather
 * than a unit/integration test. Full end-to-end validation of this file
 * happens on first real run against `pnpm dev:full` or a deployed Studio.
 */

import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

// A small, self-contained fixture (not the CDM corpus) — the Prototype
// perspective's "New Instance" flow takes a plain typeFqn text input, so a
// deterministic one-type model is both sufficient and faster than loading
// CDM just to exercise instance authoring.
const WORKSPACE_FILE_NAME = 'party.rosetta';
const WORKSPACE_FILE_CONTENT = 'namespace test\ntype Party:\n  name string (1..1)\n';
const TYPE_FQN = 'test.Party';
const INSTANCE_NAME = 'My Party';

async function loadWorkspace(page: import('@playwright/test').Page) {
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
}

test.describe('prototype workspace checkout smoke', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('creates an instance, edits a field via the worker-backed schema pipeline, and reflects it in the Inspector', async ({
    page
  }) => {
    await loadWorkspace(page);

    await page.getByTestId('rail-prototype').click();
    await expect(page.getByTestId('prototype-perspective')).toBeVisible({ timeout: 20000 });

    await page.getByLabel('New instance type').fill(TYPE_FQN);
    await page.getByLabel('New instance name').fill(INSTANCE_NAME);
    await page.getByRole('button', { name: 'Create' }).click();

    // Selecting the new instance triggers a preview:generate round trip
    // through the codegen worker (instance-store's dispatchGenerateSchema) —
    // the Fields tab shows a waiting state until the real schema arrives.
    await expect(page.getByRole('tab', { name: 'Fields' })).toBeVisible({ timeout: 15000 });
    // exact: true is load-bearing here — a substring match against "Name"
    // would also match the sidebar's "New instance name" input above it.
    const nameField = page.getByRole('textbox', { name: 'Name', exact: true });
    await expect(nameField).toBeVisible({ timeout: 20000 });

    await nameField.fill('Acme');
    await nameField.blur();

    await page.getByRole('tab', { name: 'Inspector' }).click();
    await expect(page.getByRole('heading', { name: 'Raw JSON' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('"Acme"', { exact: false })).toBeVisible({ timeout: 10000 });

    // The instance also appears in the explorer list under its given name —
    // proving createInstance + the sidebar's list rendering share the same
    // store state the form/inspector round trip just wrote to.
    await expect(page.getByRole('button', { name: INSTANCE_NAME })).toBeVisible();
  });
});
