// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Playwright E2E test — Codegen Targets Table (018 Phase 0 Task 0.14).
 *
 * End-to-end verification of:
 *   1. Targets table renders only the IMPLEMENTED_TARGETS rows
 *      (Zod, TypeScript, JSON Schema) — not the four pending ones.
 *   2. The View → viewer → ← Targets → table round-trip.
 *   3. The Download flow: clicking [Download] dispatches POST
 *      `/api/codegen` and triggers a browser download event. The
 *      Pages Function response is mocked via `page.route()` so the
 *      test stays self-contained (no `wrangler pages dev` required).
 */

import { test, expect, type Page } from '@playwright/test';

async function openBlankWorkspace(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForLoadState('domcontentloaded');
  const loader = page.getByTestId('file-loader');
  await expect(loader).toBeVisible();
  await loader.getByRole('button', { name: /^New/i }).click();
  await expect(page.getByTestId('dock-shell')).toBeVisible({ timeout: 10_000 });
}

/**
 * Activate the Code tab in the right-hand preview pane so the
 * CodegenTargetsTable is visible (it's behind a tab in the dock shell
 * by default).
 */
async function openCodePreviewTab(page: Page): Promise<void> {
  await page.locator('.dv-tab', { hasText: 'Code' }).first().click();
  await expect(page.getByTestId('codegen-targets-table')).toBeVisible({ timeout: 5_000 });
}

test.describe('Codegen Targets Table (018 Phase 0)', () => {
  test('renders only the IMPLEMENTED_TARGETS rows', async ({ page }) => {
    await openBlankWorkspace(page);
    await openCodePreviewTab(page);

    // 3 implemented rows are present.
    await expect(page.getByTestId('codegen-targets-table__row-zod')).toBeVisible();
    await expect(page.getByTestId('codegen-targets-table__row-typescript')).toBeVisible();
    await expect(page.getByTestId('codegen-targets-table__row-json-schema')).toBeVisible();

    // 4 pending rows are absent.
    await expect(page.getByTestId('codegen-targets-table__row-sql')).toHaveCount(0);
    await expect(page.getByTestId('codegen-targets-table__row-markdown')).toHaveCount(0);
    await expect(page.getByTestId('codegen-targets-table__row-excel')).toHaveCount(0);
    await expect(page.getByTestId('codegen-targets-table__row-graphql')).toHaveCount(0);

    // Namespace-contract rows show both buttons.
    await expect(page.getByTestId('codegen-targets-table__view-zod')).toBeVisible();
    await expect(page.getByTestId('codegen-targets-table__download-zod')).toBeVisible();
  });

  test('Preview round-trip on Zod', async ({ page }) => {
    await openBlankWorkspace(page);
    await openCodePreviewTab(page);

    await page.getByTestId('codegen-targets-table__view-zod').click();
    await expect(page.getByTestId('codegen-back-to-targets')).toBeVisible();
    await expect(page.getByTestId('codegen-active-target')).toContainText('Zod');
    // Status flips to "Generated (Zod)" once the in-browser worker
    // finishes — give it a few seconds for the cold start.
    await expect(page.getByTestId('codegen-status')).toContainText(/Generated/i, { timeout: 10_000 });

    await page.getByTestId('codegen-back-to-targets').click();
    await expect(page.getByTestId('codegen-targets-table')).toBeVisible();
  });

  test('Download triggers a network request and a download event', async ({ page }) => {
    await openBlankWorkspace(page);
    await openCodePreviewTab(page);

    // Mock the Pages Function so this test doesn't require wrangler.
    // Returns a single text artifact with Content-Disposition headers
    // matching what /api/codegen really emits for a one-namespace
    // workspace.
    await page.route('**/api/codegen', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        headers: { 'Content-Disposition': 'attachment; filename="example.zod.ts"' },
        body: 'export const Example = {};\n'
      });
    });

    const [download, request] = await Promise.all([
      page.waitForEvent('download'),
      page.waitForRequest((r) => r.url().includes('/api/codegen') && r.method() === 'POST'),
      page.getByTestId('codegen-targets-table__download-zod').click()
    ]);

    expect(request.url()).toContain('/api/codegen');
    const body = request.postDataJSON() as { target: string; files: unknown[] };
    expect(body.target).toBe('zod');
    expect(Array.isArray(body.files)).toBe(true);
    expect(download.suggestedFilename()).toBe('example.zod.ts');
  });
});
