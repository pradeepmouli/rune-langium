// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Buffer } from 'node:buffer';
import { checkout as test, expect } from '../fixtures.js';

const WORKSPACE_FILE_NAME = 'party.rosetta';
const WORKSPACE_FILE_CONTENT = 'namespace test\ntype Party:\n  name string (1..1)\n';

async function openWorkspaceAndImport(page: import('@playwright/test').Page): Promise<void> {
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
}

const FORMAT_LABELS = ['JSON Schema', 'OpenAPI', 'SQL DDL', 'XSD'] as const;
type FormatLabel = (typeof FORMAT_LABELS)[number];

/**
 * Switches the Import dialog's Format field to `label`, assuming the
 * dialog is currently showing its post-reopen default (JSON Schema — see
 * ImportDialog.tsx's `useEffect` on `[open]`).
 *
 * FINDING (this session, confirmed live against a rebuilt local prod
 * bundle, recorded as evidence.softFinding('KI-import-format-select-click',
 * ...) in the test body below): the Format field is a base-ui `Select`
 * (`role="combobox"` trigger + `role="listbox"`/`role="option"` popup, NOT
 * a native `<select>` — `selectOption()` does not apply here). Clicking an
 * option directly with a real pointer click DOES NOT WORK inside this
 * dialog — `document.elementFromPoint()` at an option's on-screen center
 * resolves to the dialog's own body `<div>` underneath, not the option
 * (confirmed live via evaluate; not a Playwright actionability quirk — a
 * real mouse click would hit the same wrong element). Root cause: the
 * Select's Positioner renders with `position: fixed; z-index: auto`
 * nested INSIDE the dialog's own portal container instead of escaping to
 * a higher stacking context, so the dialog body (painted later in that
 * shared stacking context) intercepts the click. Keyboard-driven
 * selection (open the trigger, then ArrowDown × N + Enter) works
 * reliably and is what this helper uses. Filed as
 * https://github.com/pradeepmouli/rune-langium/issues/396.
 */
async function selectImportFormat(page: import('@playwright/test').Page, label: FormatLabel): Promise<void> {
  const targetIndex = FORMAT_LABELS.indexOf(label);
  await page.getByLabel('Format:').click();
  // The popup listbox mounts asynchronously after the trigger's click
  // handler fires — pressing ArrowDown before it has attached its keydown
  // listener (or before the highlighted-option state has settled between
  // successive presses) is a silent no-op. Confirmed live and via the real
  // Playwright test runner: this raced intermittently even after waiting
  // for the listbox to be visible, so each key press gets its own short
  // settle delay too (a manual/MCP-driven session, with natural inter-call
  // latency, never hit this race at all).
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(150);
  for (let i = 0; i < targetIndex; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
  }
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Format:')).toHaveText(label, { timeout: 10000 });
}

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

/**
 * A DIFFERENT fixture from JSON_SCHEMA_SOURCE above, used only for the
 * "adjust one import option" sub-assertion (Step 4). Confirmed live this
 * session (and matches `packages/codegen/test/import/
 * json-schema-reader.test.ts`'s own `includeUnreferencedDefs` cases
 * exactly) that JSON_SCHEMA_SOURCE's single standalone `Widget` def is
 * NOT a case the option's reachability filter changes: a def with no
 * incoming AND no outgoing `$ref` is itself a "root" and stays even with
 * `includeUnreferencedDefs: false`. Only a def reachable ONLY through an
 * isolated reference cycle among other never-otherwise-referenced defs
 * (here, `OrphanA`/`OrphanB`, which reference only each other) is
 * actually dropped — `Root`/`Referenced` stay either way. Toggling the
 * option off on THIS fixture visibly changes the type count from 4 to 2,
 * which is what Step 4 requires demonstrating.
 */
const JSON_SCHEMA_TOGGLE_SOURCE = JSON.stringify({
  $id: 'https://example.com/schemas/toggle.json',
  $defs: {
    Root: { type: 'object', properties: { child: { $ref: '#/$defs/Referenced' } } },
    Referenced: { type: 'object', properties: { x: { type: 'string' } } },
    OrphanA: { type: 'object', properties: { link: { $ref: '#/$defs/OrphanB' } } },
    OrphanB: { type: 'object', properties: { link: { $ref: '#/$defs/OrphanA' } } }
  }
});

const OPENAPI_SOURCE = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Party Service', version: '1.0.0' },
  paths: {},
  components: {
    schemas: {
      Party: {
        type: 'object',
        required: ['partyId'],
        properties: {
          partyId: { type: 'string' },
          partyName: { type: 'string', nullable: true }
        }
      }
    }
  }
});

const SQL_SOURCE = 'CREATE TABLE party (id INT PRIMARY KEY, party_name TEXT NOT NULL, nickname TEXT)';

const XSD_SOURCE = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="Party">
    <xs:sequence>
      <xs:element name="partyId" type="xs:string" minOccurs="1" maxOccurs="1"/>
      <xs:element name="partyName" type="xs:string" minOccurs="0"/>
    </xs:sequence>
    <xs:attribute name="version" type="xs:string"/>
  </xs:complexType>
</xs:schema>`;

test.describe('J12 — Import dialog (inbound codegen)', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J12 imports JSON Schema, OpenAPI, SQL, and XSD sources, one after another', async ({ page, evidence }) => {
    await openWorkspaceAndImport(page);

    evidence.softFinding(
      'KI-import-format-select-click',
      "ImportDialog.tsx's Format <Select> (base-ui) cannot be operated with a real pointer click on its options " +
        "inside this dialog — the popup's Positioner renders position:fixed/z-index:auto nested inside the " +
        "dialog's own portal container, so the dialog body intercepts the click at the option's on-screen " +
        'location (confirmed live via document.elementFromPoint, not a Playwright actionability artifact). ' +
        'Keyboard-driven selection (open trigger, ArrowDown, Enter) works and is used throughout this journey. ' +
        'Tracked in https://github.com/pradeepmouli/rune-langium/issues/396.'
    );

    // --- JSON Schema — format defaults to it, no selector interaction needed.

    // "Adjust one import option" sub-assertion (Step 4): toggle
    // includeUnreferencedDefs off and confirm the summary's type count
    // changes. Uses JSON_SCHEMA_TOGGLE_SOURCE, not the absorbed
    // JSON_SCHEMA_SOURCE below — see that constant's doc comment.
    await page.getByTestId('import-dialog__source').fill(JSON_SCHEMA_TOGGLE_SOURCE);
    await page.getByTestId('import-dialog__namespace').fill('smoke.jsonschema.toggle');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__summary')).toContainText('4 type(s)', { timeout: 15000 });

    // FINDING (this session, confirmed live): the z2f-generated checkbox
    // for includeUnreferencedDefs renders UNCHECKED whenever the dialog's
    // local `formatOptions` state has never touched this field (it's
    // initialized to `{}`, not the Zod schema's resolved defaults) — even
    // though the EFFECTIVE value `importModel()` uses is `true` (the
    // schema's own `.default(true)`), matching the "4 type(s)" result
    // above. A first click sets the field explicitly to `true` (visually
    // and behaviorally unchanged); a SECOND click is required to reach an
    // explicit `false`. `.setChecked(false)` would incorrectly no-op here
    // (it trusts the already-"false"-looking aria-checked), so this uses
    // two direct clicks with explicit aria-checked assertions instead.
    const includeUnreferencedDefsCheckbox = page.getByLabel('Include Unreferenced Defs');
    await includeUnreferencedDefsCheckbox.click();
    await expect(includeUnreferencedDefsCheckbox).toHaveAttribute('aria-checked', 'true');
    await includeUnreferencedDefsCheckbox.click();
    await expect(includeUnreferencedDefsCheckbox).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__summary')).toContainText('2 type(s)', { timeout: 15000 });
    await expect(page.getByTestId('import-dialog__preview')).toContainText('type Root', { timeout: 5000 });
    await evidence.checkpoint('import-option-toggled');

    // Absorbed from test/prod-smoke/schema-import-checkout.spec.ts. The
    // leftover includeUnreferencedDefs:false from the toggle check above
    // is harmless here — Widget has no incoming or outgoing $ref, so it's
    // kept as a root regardless of the option (confirmed live + against
    // json-schema-reader.test.ts's own "keeps a standalone def" case).
    await page.getByTestId('import-dialog__source').fill(JSON_SCHEMA_SOURCE);
    await page.getByTestId('import-dialog__namespace').fill('smoke.jsonschema');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__summary')).toContainText('1 type(s)', { timeout: 15000 });
    await expect(page.getByTestId('import-dialog__preview')).toContainText('type Widget', { timeout: 5000 });
    await expect(page.getByTestId('import-dialog__confirm')).toBeEnabled();
    await page.getByTestId('import-dialog__confirm').click();
    await expect(page.getByTestId('import-dialog')).not.toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('json-schema-imported');

    // Confirm the imported type is real and navigable — same pattern every
    // other journey uses for a post-mutation existence check.
    const namespaceSearch = page.getByTestId('namespace-search');
    await namespaceSearch.fill('Widget');
    await expect(page.getByTestId('ns-type-nav-smoke.jsonschema.Widget')).toBeVisible({ timeout: 15000 });

    // Reopen for OpenAPI — this is where state-reset-between-formats matters:
    // a prior format's error/summary/preview must not leak into this run.
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('import-dialog')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('import-dialog__summary')).toHaveCount(0);
    await expect(page.getByTestId('import-dialog__error')).toHaveCount(0);

    await selectImportFormat(page, 'OpenAPI');
    await page.getByTestId('import-dialog__source').fill(OPENAPI_SOURCE);
    await page.getByTestId('import-dialog__namespace').fill('smoke.openapi');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__summary')).toContainText('1 type(s)', { timeout: 15000 });
    await expect(page.getByTestId('import-dialog__preview')).toContainText('type Party', { timeout: 5000 });
    await page.getByTestId('import-dialog__confirm').click();
    await expect(page.getByTestId('import-dialog')).not.toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('openapi-imported');

    // SQL — exercises the tree-sitter WASM grammar-fetch path (PR #390's
    // `?url` asset loading in the deployed bundle) and the SQL-specific
    // required-namespace validation.
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('import-dialog')).toBeVisible({ timeout: 10000 });
    await selectImportFormat(page, 'SQL DDL');
    await page.getByTestId('import-dialog__source').fill(SQL_SOURCE);
    // Deliberately leave namespace blank first to confirm SQL's required-
    // namespace validation fires, then fill it — exercises the dialog's own
    // error-then-recover path, not just the happy path.
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__error')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('import-dialog__namespace').fill('smoke.sql');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__summary')).toContainText('1 type(s)', { timeout: 20000 });
    await expect(page.getByTestId('import-dialog__preview')).toContainText('type Party', { timeout: 5000 });
    await page.getByTestId('import-dialog__confirm').click();
    await expect(page.getByTestId('import-dialog')).not.toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('sql-imported');

    // XSD.
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('import-dialog')).toBeVisible({ timeout: 10000 });
    await selectImportFormat(page, 'XSD');
    await page.getByTestId('import-dialog__source').fill(XSD_SOURCE);
    await page.getByTestId('import-dialog__namespace').fill('smoke.xsd');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-dialog__summary')).toContainText('1 type(s)', { timeout: 15000 });
    await expect(page.getByTestId('import-dialog__preview')).toContainText('type Party', { timeout: 5000 });
    await page.getByTestId('import-dialog__confirm').click();
    await expect(page.getByTestId('import-dialog')).not.toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('xsd-imported');
  });
});
