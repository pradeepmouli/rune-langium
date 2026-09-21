// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import JSZip from 'jszip';
import { expect, test } from '@playwright/test';

const source = `namespace demo
type Address:
  city string (1..1)
type Party:
  address Address (1..1)`;

async function artifact(): Promise<Buffer> {
  const zip = new JSZip();
  const content = 'export interface Party { address: Address }\n';
  zip.file('demo.ts', content);
  zip.file(
    '.rune/export.json',
    JSON.stringify({
      version: 1,
      target: 'typescript',
      resolvedSelection: {
        explicit: [{ namespace: 'demo', name: 'Party', kind: 'Data' }],
        included: [
          { namespace: 'demo', name: 'Party', kind: 'Data' },
          { namespace: 'demo', name: 'Address', kind: 'Data' }
        ],
        requiredBy: { '["demo","Data","Address"]': ['["demo","Data","Party"]'] }
      },
      files: [{ path: 'demo.ts', kind: 'text', bytes: new TextEncoder().encode(content).byteLength }],
      diagnostics: []
    })
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('selects and previews a captured declaration export', async ({ page }) => {
  await page.route('**/api/codegen', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      artifactEnvelope: 1,
      selection: { declarations: [{ namespace: 'demo', name: 'Party', kind: 'Data' }] }
    });
    await route.fulfill({ status: 200, contentType: 'application/zip', body: await artifact() });
  });
  await page.goto('./');
  await page.locator('input[type="file"][accept=".rosetta"]').setInputFiles({
    name: 'demo.rosetta',
    buffer: Buffer.from(source),
    mimeType: 'text/plain'
  });
  await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('rail-export').click();
  await expect(page.getByTestId('export-perspective')).toBeVisible();
  await page.getByTestId('ns-type-checkbox-demo.Party').click();
  await page.getByRole('button', { name: 'Generate 1 selected' }).click();
  await expect(page.getByTestId('export-artifact-preview')).toBeVisible();
  await expect(page.getByLabel('Generated export code')).toContainText('export interface Party');
  await expect(page.getByTestId('export-selection-summary')).toContainText('2 declarations included');
});
