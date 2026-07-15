// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Production smoke coverage for the pre-existing schema import feature
 * (spec 021 Phase 4, `components/ImportDialog.tsx`) — imports an external
 * JSON Schema / OpenAPI / SQL DDL / XSD source as new Rune model types.
 * This is a DIFFERENT feature from the Prototype Workspace's instance-data
 * bundle import (`prototype-workspace-checkout.spec.ts`): this one produces
 * `.rune` type definitions from a schema; that one imports/exports instance
 * *data* conforming to already-loaded types. See ImportDialog.tsx's module
 * doc for the distinction.
 *
 * JSON Schema is used here (not SQL/XSD/OpenAPI) because its reader has no
 * WASM-asset-loading step — the smallest, fastest, most deterministic format
 * to smoke-test the dialog's real preview → parse-check → confirm pipeline.
 */

import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

const WORKSPACE_FILE_NAME = 'party.rosetta';
const WORKSPACE_FILE_CONTENT = 'namespace test\ntype Party:\n  name string (1..1)\n';
const IMPORT_NAMESPACE = 'smoke';
// Named types come from `$defs` entries, not a bare top-level schema — the
// reader only extracts types it can name (packages/codegen/src/import/
// sources/json-schema-reader.ts), confirmed against
// packages/codegen/test/import/json-schema-reader.test.ts's own fixtures.
const JSON_SCHEMA_SOURCE = JSON.stringify({
  $id: 'https://example.com/schemas/widget.json',
  $defs: {
    Widget: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    }
  }
});

test.describe('schema import checkout smoke', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('imports a JSON Schema source as a new workspace file via the real importModel pipeline', async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/Rune Studio/);
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

    const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
    await fileInput.setInputFiles([
      { name: WORKSPACE_FILE_NAME, mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE_FILE_CONTENT) }
    ]);
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('import-dialog')).toBeVisible({ timeout: 10000 });

    // Format defaults to JSON Schema — no selector interaction needed.
    await page.getByTestId('import-dialog__source').fill(JSON_SCHEMA_SOURCE);
    await page.getByTestId('import-dialog__namespace').fill(IMPORT_NAMESPACE);
    await page.getByRole('button', { name: 'Preview' }).click();

    // Real importModel() execution — no mocking in a prod-smoke run — must
    // produce exactly the one `Widget` type this schema declares, and the
    // dialog's own re-parse check (a direct client-side `parse()` call, not
    // the /api/parse Pages Function) must pass for Confirm to enable.
    await expect(page.getByTestId('import-dialog__summary')).toContainText('1 type(s)', { timeout: 15000 });
    await expect(page.getByTestId('import-dialog__preview')).toContainText('type Widget', { timeout: 5000 });
    await expect(page.getByTestId('import-dialog__confirm')).toBeEnabled();

    await page.getByTestId('import-dialog__confirm').click();
    await expect(page.getByTestId('import-dialog')).not.toBeVisible({ timeout: 10000 });
  });
});
