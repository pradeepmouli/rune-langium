// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Playwright E2E test — Code Generation Flow.
 *
 * Uses page.route() to mock the codegen service HTTP endpoint,
 * enabling full end-to-end testing of:
 * 1. Successful code generation with file output and preview
 * 2. Language selection and switching
 * 3. Error handling (service errors, validation errors)
 * 4. Generate button states (disabled when service unavailable)
 * 5. Cancel during generation
 * 6. File list navigation and code preview
 * 7. Download buttons
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CODEGEN_MODEL = `namespace codegen.test
version "1.0.0"

type Trade:
  tradeId string (1..1)
  quantity int (1..1)
  price number (0..1)

enum TradeStatus:
  Pending
  Confirmed
  Settled
`;

const MOCK_JAVA_RESULT = {
  files: [
    {
      path: 'com/codegen/test/Trade.java',
      content: [
        'package com.codegen.test;',
        '',
        'public class Trade {',
        '    private String tradeId;',
        '    private int quantity;',
        '    private Double price;',
        '',
        '    public String getTradeId() { return tradeId; }',
        '    public void setTradeId(String tradeId) { this.tradeId = tradeId; }',
        '}'
      ].join('\n')
    },
    {
      path: 'com/codegen/test/TradeStatus.java',
      content: [
        'package com.codegen.test;',
        '',
        'public enum TradeStatus {',
        '    PENDING,',
        '    CONFIRMED,',
        '    SETTLED',
        '}'
      ].join('\n')
    }
  ],
  errors: [],
  warnings: []
};

const MOCK_TYPESCRIPT_RESULT = {
  files: [
    {
      path: 'codegen/test/Trade.ts',
      content: [
        'export interface Trade {',
        '  tradeId: string;',
        '  quantity: number;',
        '  price?: number;',
        '}'
      ].join('\n')
    },
    {
      path: 'codegen/test/TradeStatus.ts',
      content: [
        'export enum TradeStatus {',
        "  Pending = 'Pending',",
        "  Confirmed = 'Confirmed',",
        "  Settled = 'Settled',",
        '}'
      ].join('\n')
    }
  ],
  errors: [],
  warnings: []
};

const MOCK_RESULT_WITH_ERRORS = {
  errors: [
    {
      sourceFile: 'codegen.test',
      construct: 'Trade',
      message: 'Unsupported type reference: CustomType'
    },
    {
      sourceFile: 'codegen.test',
      construct: 'TradeStatus',
      message: 'Enum values must be uppercase'
    }
  ]
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadModel(page: Page) {
  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles({
    name: 'trade.rosetta',
    mimeType: 'text/plain',
    buffer: Buffer.from(CODEGEN_MODEL)
  });
  await page.waitForSelector('[data-testid="editor-page"]', { timeout: 15000 });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 10000 });
}

/** Mock the codegen service as available and returning the given result. */
async function mockCodegenService(
  page: Page,
  result: object,
  { status = 200, delay = 100 }: { status?: number; delay?: number } = {}
) {
  // Mock the OPTIONS (availability check) endpoint
  await page.route('**/api/generate', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204 });
      return;
    }

    if (route.request().method() === 'POST') {
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(result)
      });
      return;
    }

    await route.continue();
  });
}

/** Mock the codegen service as unavailable. */
async function mockCodegenServiceUnavailable(page: Page) {
  await page.route('**/api/generate', async (route) => {
    await route.abort('connectionrefused');
  });
}

async function openExportDialog(page: Page) {
  const exportCodeBtn = page.locator('button', { hasText: 'Export Code' });
  await exportCodeBtn.click();
  await page.waitForTimeout(500);
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  return dialog;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Code Generation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await loadModel(page);
  });

  test('Generate button should be disabled when service is unavailable', async ({ page }) => {
    await mockCodegenServiceUnavailable(page);
    const dialog = await openExportDialog(page);

    // Wait for service availability check to complete
    await page.waitForTimeout(1500);

    // Service unavailable warning should show
    await expect(dialog.getByText(/not available/i)).toBeVisible({ timeout: 5000 });

    // Generate button should be disabled
    const generateBtn = dialog.locator('button', { hasText: 'Generate' });
    await expect(generateBtn).toBeDisabled();
  });

  test('Generate button should be enabled when service is available', async ({ page }) => {
    await mockCodegenService(page, MOCK_JAVA_RESULT);
    const dialog = await openExportDialog(page);

    // Wait for service availability check
    await page.waitForTimeout(1000);

    // Generate button should be enabled
    const generateBtn = dialog.locator('button', { hasText: 'Generate' });
    await expect(generateBtn).toBeEnabled({ timeout: 5000 });
  });

  test('should generate Java code and display file list', async ({ page }) => {
    await mockCodegenService(page, MOCK_JAVA_RESULT);
    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    // Click Generate
    const generateBtn = dialog.locator('button', { hasText: 'Generate' });
    await generateBtn.click();

    // Wait for results
    await expect(dialog.getByText('2 file(s)')).toBeVisible({ timeout: 10000 });

    // File list should show both generated files (use button role to avoid matching path header)
    await expect(dialog.getByRole('button', { name: 'Trade.java' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'TradeStatus.java' })).toBeVisible();
  });

  test('should show code preview for selected file', async ({ page }) => {
    await mockCodegenService(page, MOCK_JAVA_RESULT);
    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    // Generate
    const generateBtn = dialog.locator('button', { hasText: 'Generate' });
    await generateBtn.click();
    await expect(dialog.getByText('2 file(s)')).toBeVisible({ timeout: 10000 });

    // First file should be auto-selected — check code preview
    const codePreview = dialog.locator('pre');
    await expect(codePreview).toContainText('public class Trade');
    await expect(codePreview).toContainText('private String tradeId');
  });

  test('should switch code preview when clicking different files', async ({ page }) => {
    await mockCodegenService(page, MOCK_JAVA_RESULT);
    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    // Generate
    await dialog.locator('button', { hasText: 'Generate' }).click();
    await expect(dialog.getByText('2 file(s)')).toBeVisible({ timeout: 10000 });

    // Click on TradeStatus.java in file list
    await dialog.getByText('TradeStatus.java').click();
    await page.waitForTimeout(300);

    // Code preview should now show enum content
    const codePreview = dialog.locator('pre');
    await expect(codePreview).toContainText('public enum TradeStatus');
    await expect(codePreview).toContainText('PENDING');
  });

  test('should show full file path in code preview header', async ({ page }) => {
    await mockCodegenService(page, MOCK_JAVA_RESULT);
    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    await dialog.locator('button', { hasText: 'Generate' }).click();
    await expect(dialog.getByText('2 file(s)')).toBeVisible({ timeout: 10000 });

    // Full path should be shown in preview header
    await expect(dialog.getByText('com/codegen/test/Trade.java')).toBeVisible();
  });

  test('should show Download and Download all buttons after generation', async ({ page }) => {
    await mockCodegenService(page, MOCK_JAVA_RESULT);
    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    await dialog.locator('button', { hasText: 'Generate' }).click();
    await expect(dialog.getByText('2 file(s)')).toBeVisible({ timeout: 10000 });

    // Download all button
    await expect(dialog.locator('button', { hasText: 'Download all' })).toBeVisible();

    // Individual download button (for selected file)
    await expect(dialog.locator('button', { hasText: 'Download' }).last()).toBeVisible();
  });

  test('should generate TypeScript when language is changed', async ({ page }) => {
    // Route based on request body language
    await page.route('**/api/generate', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204 });
        return;
      }
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() ?? '{}');
        const result = body.language === 'typescript' ? MOCK_TYPESCRIPT_RESULT : MOCK_JAVA_RESULT;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(result)
        });
        return;
      }
      await route.continue();
    });

    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    // Open the language selector and pick TypeScript
    const trigger = dialog.locator('button[role="combobox"]');
    await trigger.click();
    await page.waitForTimeout(300);

    const tsOption = page.getByRole('option', { name: 'TypeScript' });
    await tsOption.click();
    await page.waitForTimeout(300);

    // Generate
    await dialog.locator('button', { hasText: 'Generate' }).click();
    await expect(dialog.getByText('2 file(s)')).toBeVisible({ timeout: 10000 });

    // Should show TypeScript files (use button role to avoid matching path header)
    await expect(dialog.getByRole('button', { name: 'Trade.ts' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'TradeStatus.ts' })).toBeVisible();

    // Code preview should show TypeScript content
    const codePreview = dialog.locator('pre');
    await expect(codePreview).toContainText('export interface Trade');
  });

  test('should display generation errors', async ({ page }) => {
    await mockCodegenService(page, MOCK_RESULT_WITH_ERRORS, { status: 422 });
    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    // Generate
    await dialog.locator('button', { hasText: 'Generate' }).click();
    await page.waitForTimeout(1000);

    // Should show error count
    await expect(dialog.getByText(/2 error/)).toBeVisible({ timeout: 10000 });

    // Should show error messages
    await expect(dialog.getByText('Unsupported type reference: CustomType')).toBeVisible();
    await expect(dialog.getByText('Enum values must be uppercase')).toBeVisible();
  });

  test('should show error message on service failure', async ({ page }) => {
    await mockCodegenService(page, { message: 'Internal Server Error' }, { status: 500 });
    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    // Generate
    await dialog.locator('button', { hasText: 'Generate' }).click();
    await page.waitForTimeout(1000);

    // Should show error state
    await expect(dialog.getByText(/service error/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show Cancel button during generation', async ({ page }) => {
    // Use a long delay to keep the dialog in generating state
    await mockCodegenService(page, MOCK_JAVA_RESULT, { delay: 10000 });
    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    // Click Generate
    await dialog.locator('button', { hasText: 'Generate' }).click();

    // Should show generating state with Cancel button
    await expect(dialog.getByText(/Generating.*code/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('button', { hasText: 'Cancel' })).toBeVisible();

    // Generate button should not be visible during generation
    await expect(dialog.locator('button', { hasText: 'Generate' })).not.toBeVisible();
  });

  test('Cancel should abort generation and return to idle', async ({ page }) => {
    await mockCodegenService(page, MOCK_JAVA_RESULT, { delay: 10000 });
    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    // Start generation
    await dialog.locator('button', { hasText: 'Generate' }).click();
    await expect(dialog.locator('button', { hasText: 'Cancel' })).toBeVisible({ timeout: 5000 });

    // Cancel
    await dialog.locator('button', { hasText: 'Cancel' }).click();
    await page.waitForTimeout(500);

    // Should return to idle — Generate button visible again
    await expect(dialog.locator('button', { hasText: 'Generate' })).toBeVisible({ timeout: 5000 });

    // No file list or error should be shown
    await expect(dialog.getByText(/file\(s\)/)).not.toBeVisible();
  });

  test('should show "no exportable constructs" for empty result', async ({ page }) => {
    await mockCodegenService(page, { files: [], errors: [], warnings: [] });
    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    await dialog.locator('button', { hasText: 'Generate' }).click();
    await page.waitForTimeout(1000);

    await expect(dialog.getByText(/no files generated/i)).toBeVisible({ timeout: 10000 });
  });

  test('language selector should list all supported languages', async ({ page }) => {
    await mockCodegenService(page, MOCK_JAVA_RESULT);
    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    // Open the language selector dropdown
    const trigger = dialog.locator('button[role="combobox"]');
    await trigger.click();
    await page.waitForTimeout(300);

    // Should show all known languages
    await expect(page.getByRole('option', { name: 'Java' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'TypeScript' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Scala' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Kotlin' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'C#' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Go' })).toBeVisible();
  });

  test('dialog should reset state when reopened', async ({ page }) => {
    await mockCodegenService(page, MOCK_JAVA_RESULT);

    // First open: generate code
    let dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);
    await dialog.locator('button', { hasText: 'Generate' }).click();
    await expect(dialog.getByText('2 file(s)')).toBeVisible({ timeout: 10000 });

    // Close dialog
    await dialog.locator('button', { hasText: 'Close' }).click();
    await page.waitForTimeout(300);

    // Reopen — should be in idle state, no files shown
    dialog = await openExportDialog(page);
    await page.waitForTimeout(500);
    await expect(dialog.getByText(/file\(s\)/)).not.toBeVisible();
    await expect(dialog.locator('button', { hasText: 'Generate' })).toBeVisible();
  });

  test('should send correct language in generate request', async ({ page }) => {
    let capturedLanguage = '';
    await page.route('**/api/generate', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204 });
        return;
      }
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() ?? '{}');
        capturedLanguage = body.language;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_JAVA_RESULT)
        });
        return;
      }
      await route.continue();
    });

    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    // Default language should be Java
    await dialog.locator('button', { hasText: 'Generate' }).click();
    await expect(dialog.getByText('2 file(s)')).toBeVisible({ timeout: 10000 });

    expect(capturedLanguage).toBe('java');
  });

  test('should send model files in generate request', async ({ page }) => {
    let capturedFiles: Array<{ path: string; content: string }> = [];
    await page.route('**/api/generate', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204 });
        return;
      }
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() ?? '{}');
        capturedFiles = body.files;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_JAVA_RESULT)
        });
        return;
      }
      await route.continue();
    });

    const dialog = await openExportDialog(page);
    await page.waitForTimeout(1000);

    await dialog.locator('button', { hasText: 'Generate' }).click();
    await expect(dialog.getByText('2 file(s)')).toBeVisible({ timeout: 10000 });

    // Should have sent .rosetta file(s) containing the model
    expect(capturedFiles.length).toBeGreaterThanOrEqual(1);
    // Files use namespace-based paths. The user model should be present.
    const userFile = capturedFiles.find(
      (f: { path: string; content: string }) => f.path === 'codegen.test'
    );
    expect(userFile).toBeTruthy();
    expect(userFile!.content).toBeTruthy();
  });
});
