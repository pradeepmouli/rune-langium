// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Model fixtures
// ---------------------------------------------------------------------------

const TYPE_ALIAS_MODEL = `namespace preview.alias
version "1.0.0"

typeAlias Price: number

type Order:
  amount Price (1..1)
  description string (1..1)
`;

const CHOICE_MODEL = `namespace preview.choice
version "1.0.0"

type CashTransfer:
  amount number (1..1)
  currency string (1..1)

type SecurityTransfer:
  security string (1..1)
  quantity number (1..1)

choice Transfer:
  CashTransfer
  SecurityTransfer
`;

const FUNCTION_MODEL = `namespace preview.func
version "1.0.0"

func AddAmounts:
  inputs:
    a number (1..1)
    b number (1..1)
  output:
    result number (1..1)
  set result:
    a + b
`;

// ---------------------------------------------------------------------------
// Worker mock — mirrors the pattern used in form-preview.spec.ts, extended to
// handle typeAlias, choice, and function schemas.
// ---------------------------------------------------------------------------

async function installExtendedPreviewWorkerMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    function schemaForFiles(
      files: Array<{ uri: string; content: string }>,
      targetId: string
    ): { kind: 'result'; schema: unknown } | { kind: 'stale'; reason: string; message: string } {
      const content = files.map((file) => file.content).join('\n');

      // T083 — Type alias: Order type whose "amount" field resolves via Price alias
      if (targetId === 'preview.alias.Order' && content.includes('typeAlias Price')) {
        return {
          kind: 'result',
          schema: {
            schemaVersion: 1,
            targetId,
            title: 'Order',
            status: 'ready',
            fields: [
              { path: 'amount', label: 'amount', kind: 'number', required: true },
              { path: 'description', label: 'description', kind: 'string', required: true }
            ]
          }
        };
      }

      // T083 — Choice: Transfer discriminated union schema
      if (targetId === 'preview.choice.Transfer' && content.includes('choice Transfer')) {
        return {
          kind: 'result',
          schema: {
            schemaVersion: 1,
            targetId,
            kind: 'choice',
            title: 'Transfer',
            status: 'ready',
            fields: [
              {
                path: 'CashTransfer',
                label: 'CashTransfer',
                kind: 'object',
                required: false,
                children: [
                  { path: 'CashTransfer.amount', label: 'amount', kind: 'number', required: true },
                  {
                    path: 'CashTransfer.currency',
                    label: 'currency',
                    kind: 'string',
                    required: true
                  }
                ]
              },
              {
                path: 'SecurityTransfer',
                label: 'SecurityTransfer',
                kind: 'object',
                required: false,
                children: [
                  {
                    path: 'SecurityTransfer.security',
                    label: 'security',
                    kind: 'string',
                    required: true
                  },
                  {
                    path: 'SecurityTransfer.quantity',
                    label: 'quantity',
                    kind: 'number',
                    required: true
                  }
                ]
              }
            ]
          }
        };
      }

      // T084 — Function: AddAmounts input/output schema
      if (targetId === 'preview.func.AddAmounts' && content.includes('func AddAmounts')) {
        return {
          kind: 'result',
          schema: {
            schemaVersion: 1,
            targetId,
            kind: 'function',
            title: 'AddAmounts',
            status: 'ready',
            fields: [
              { path: 'a', label: 'a', kind: 'number', required: true },
              { path: 'b', label: 'b', kind: 'number', required: true }
            ]
          }
        };
      }

      return {
        kind: 'stale',
        reason: files.length > 0 ? 'unsupported-target' : 'no-files',
        message: files.length > 0 ? 'No schema available' : 'No files loaded'
      };
    }

    class PreviewWorkerMock extends EventTarget implements Worker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      private previewFiles: Array<{ uri: string; content: string }> = [];
      private lastRequestId: string | undefined;
      readonly url = 'preview-worker-mock-extended';

      postMessage(message: unknown): void {
        const payload = message as {
          type?: string;
          targetId?: string;
          requestId?: string;
          files?: Array<{ uri: string; content: string }>;
        };

        if (payload.type === 'preview:setFiles') {
          this.previewFiles = payload.files ?? [];
          this.lastRequestId = payload.requestId;
          return;
        }

        if (payload.type === 'preview:generate' && payload.targetId) {
          this.lastRequestId = payload.requestId;
          const outcome = schemaForFiles(this.previewFiles, payload.targetId);
          const event = new MessageEvent('message', {
            data:
              outcome.kind === 'result'
                ? {
                    type: 'preview:result',
                    targetId: payload.targetId,
                    requestId: this.lastRequestId,
                    schema: outcome.schema
                  }
                : {
                    type: 'preview:stale',
                    targetId: payload.targetId,
                    requestId: this.lastRequestId,
                    reason: outcome.reason,
                    message: outcome.message
                  }
          });
          setTimeout(() => {
            this.dispatchEvent(event);
            this.onmessage?.(event);
          }, 0);
        }
      }

      terminate(): void {}

      dispatchEvent(event: Event): boolean {
        return super.dispatchEvent(event);
      }
    }

    (
      window as unknown as {
        __runeStudioTestApi?: {
          createCodegenWorker?(): Worker;
        };
      }
    ).__runeStudioTestApi = {
      ...(
        window as unknown as {
          __runeStudioTestApi?: {
            createCodegenWorker?(): Worker;
          };
        }
      ).__runeStudioTestApi,
      createCodegenWorker: () => new PreviewWorkerMock()
    };
  });
}

// ---------------------------------------------------------------------------
// Shared helpers (same pattern as form-preview.spec.ts)
// ---------------------------------------------------------------------------

async function loadFiles(page: Page, files: Array<{ name: string; content: string }>) {
  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles(
    files.map((file) => ({
      name: file.name,
      mimeType: 'text/plain',
      buffer: Buffer.from(file.content)
    }))
  );
  await page.waitForSelector('[data-testid="editor-page"]', { timeout: 15_000 });
  await page.locator('[data-testid^="ns-type-"]').first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1500);
}

async function selectTypeFromNavigate(page: Page, nodeId: string): Promise<void> {
  const typeRow = page.getByTestId(`ns-type-${nodeId}`);
  await typeRow.waitFor({ state: 'visible', timeout: 10_000 });
  await typeRow.locator('span.truncate').click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Form Preview — Extended Types', () => {
  test.beforeEach(async ({ page }) => {
    await installExtendedPreviewWorkerMock(page);
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
  });

  test('T083: type alias model renders Order type in the preview panel without errors', async ({
    page
  }) => {
    await loadFiles(page, [{ name: 'preview-alias.rosetta', content: TYPE_ALIAS_MODEL }]);

    const previewPanel = page.getByTestId('panel-formPreview');

    // Before selecting a target the panel should show the empty-state message
    await expect(previewPanel).toContainText(
      'Select a type from the graph, file tree, or source editor to preview a generated form.'
    );

    // Select the Order type (which uses the Price typeAlias)
    await selectTypeFromNavigate(page, 'preview.alias::Order');

    // Schema renders without errors — heading and field labels are visible
    await expect(previewPanel.getByRole('heading', { name: 'Order' })).toBeVisible();
    await expect(previewPanel.getByText('preview.alias.Order [Data]')).toBeVisible();
    await expect(previewPanel.getByLabel('amount')).toBeVisible();
    await expect(previewPanel.getByLabel('description')).toBeVisible();
  });

  test('T083: choice model renders Transfer choice panel with option radio controls', async ({
    page
  }) => {
    await loadFiles(page, [{ name: 'preview-choice.rosetta', content: CHOICE_MODEL }]);

    const previewPanel = page.getByTestId('panel-formPreview');

    // Select the Transfer choice type
    await selectTypeFromNavigate(page, 'preview.choice::Transfer');

    // Schema renders without errors
    await expect(previewPanel.getByRole('heading', { name: 'Transfer' })).toBeVisible();
    await expect(previewPanel.getByText('preview.choice.Transfer [Choice]')).toBeVisible();

    // Choice panel shows a "Choose one option" legend
    await expect(previewPanel.getByText('Choose one option')).toBeVisible();

    // Both choice options are listed
    await expect(previewPanel.getByText('CashTransfer', { exact: true })).toBeVisible();
    await expect(previewPanel.getByText('SecurityTransfer', { exact: true })).toBeVisible();
  });

  test('T084: function model shows input fields and a Run button in the preview panel', async ({
    page
  }) => {
    await loadFiles(page, [{ name: 'preview-func.rosetta', content: FUNCTION_MODEL }]);

    const previewPanel = page.getByTestId('panel-formPreview');

    // Select the AddAmounts function
    await selectTypeFromNavigate(page, 'preview.func::AddAmounts');

    // Schema renders without errors
    await expect(previewPanel.getByRole('heading', { name: 'AddAmounts' })).toBeVisible();
    await expect(previewPanel.getByText('preview.func.AddAmounts [RosettaFunction]')).toBeVisible();

    // Input fields derived from the function inputs are visible
    await expect(previewPanel.getByLabel('a')).toBeVisible();
    await expect(previewPanel.getByLabel('b')).toBeVisible();

    // Function schemas render a Run button
    await expect(previewPanel.getByRole('button', { name: 'Run' })).toBeVisible();
  });
});
