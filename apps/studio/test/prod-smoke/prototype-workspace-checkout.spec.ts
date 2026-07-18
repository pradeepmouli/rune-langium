// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Validated live end-to-end (both against `pnpm dev` and a real production
 * build served via `vite preview`): workspace load, rail-prototype, New
 * Instance creation, the worker-backed schema round trip, field editing, tab
 * switching, and the Inspector's Raw JSON all confirmed correct against real
 * rendered DOM. Two real bugs were found and fixed this way:
 *   - `getByRole('textbox', { name: 'Name' })` substring-matched the
 *     sidebar's "New instance name" input — `exact: true` is required.
 *   - An unscoped `getByText('"Acme"')` matched two elements: the Inspector
 *     tab's Raw JSON AND the Fields tab's own still-mounted (hidden, not
 *     unmounted) "Sample data" preview — scoped to the Inspector tabpanel.
 *
 * Under plain `pnpm dev` (no Cloudflare Pages Functions), the codegen worker
 * crashed on this flow; under a real production build (`vite preview`) it
 * did not — this workspace never uses the curated-bundle-hydration path
 * `/api/parse` exists for, so the crash was a `pnpm dev`-only artifact, not
 * a feature dependency on Pages Functions. See
 * `test/prod-ux/journeys/j12-import-dialog.spec.ts` (formerly
 * `schema-import-checkout.spec.ts`, absorbed into J12) for a related,
 * confirmed dev-mode-only bug (an unrelated Node-builtin import that a
 * production build's tree-shaking correctly eliminates).
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
    // Scoped to the Inspector tabpanel — base-ui Tabs keeps inactive panels
    // (including FormPreviewPanel's own "Sample data" JSON preview on the
    // Fields tab, which shows the same value) mounted-but-hidden rather than
    // unmounted, so an unscoped page-wide text match hits both.
    const inspectorPanel = page.getByRole('tabpanel', { name: 'Inspector' });
    await expect(inspectorPanel.getByRole('heading', { name: 'Raw JSON' })).toBeVisible({ timeout: 10000 });
    await expect(inspectorPanel.getByText('"Acme"', { exact: false })).toBeVisible({ timeout: 10000 });

    // The instance also appears in the explorer list under its given name —
    // proving createInstance + the sidebar's list rendering share the same
    // store state the form/inspector round trip just wrote to.
    await expect(page.getByRole('button', { name: INSTANCE_NAME })).toBeVisible();
  });
});
