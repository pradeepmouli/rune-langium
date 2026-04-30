// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { test, expect, type Page } from '@playwright/test';

const PREVIEW_MODEL = `namespace preview.alpha
version "1.0.0"

enum Side:
  Buy
  Sell

type Party:
  legalName string (1..1)

type Trade:
  tradeId string (1..1)
  side Side (1..1)
  party Party (1..1)
  aliases string (1..2)
`;

const DUPLICATE_ALPHA_MODEL = `namespace preview.alpha
version "1.0.0"

type Trade:
  alphaOnly string (1..1)
`;

const DUPLICATE_BETA_MODEL = `namespace preview.beta
version "1.0.0"

type Trade:
  betaOnly string (1..1)
`;

const PREVIEW_MODEL_UPDATED = `namespace preview.alpha
version "1.0.0"

enum Side:
  Buy
  Sell

type Party:
  legalName string (1..1)

type Trade:
  tradeId string (1..1)
  side Side (1..1)
  party Party (1..1)
  aliases string (1..2)
  settlementDate string (0..1)
`;

const PREVIEW_MODEL_DELETED = `namespace preview.alpha
version "1.0.0"

enum Side:
  Buy
  Sell

type Party:
  legalName string (1..1)
`;

const PREVIEW_MODEL_RENAMED = `namespace preview.alpha
version "1.0.0"

enum Side:
  Buy
  Sell

type Party:
  legalName string (1..1)

type RenamedTrade:
  tradeId string (1..1)
  side Side (1..1)
  party Party (1..1)
  aliases string (1..2)
`;

async function installPreviewWorkerMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    const realSendBeacon = navigator.sendBeacon?.bind(navigator);
    const realXhrOpen = XMLHttpRequest.prototype.open;
    const realXhrSend = XMLHttpRequest.prototype.send;

    (
      window as unknown as {
        __previewTestState: {
          clipboard: string;
          networkEvents: string[];
          resetNetwork(): void;
        };
      }
    ).__previewTestState = {
      clipboard: '',
      networkEvents: [],
      resetNetwork() {
        this.networkEvents = [];
      }
    };

    window.fetch = async (...args) => {
      (
        window as unknown as { __previewTestState: { networkEvents: string[] } }
      ).__previewTestState.networkEvents.push(`fetch:${String(args[0])}`);
      return realFetch(...args);
    };

    if (realSendBeacon) {
      navigator.sendBeacon = (url, data) => {
        (
          window as unknown as { __previewTestState: { networkEvents: string[] } }
        ).__previewTestState.networkEvents.push(`beacon:${String(url)}`);
        return realSendBeacon(url, data);
      };
    }

    XMLHttpRequest.prototype.open = function (...args) {
      (
        window as unknown as { __previewTestState: { networkEvents: string[] } }
      ).__previewTestState.networkEvents.push(`xhr:${String(args[1])}`);
      return realXhrOpen.apply(this, args as Parameters<typeof realXhrOpen>);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      return realXhrSend.apply(this, args as Parameters<typeof realXhrSend>);
    };

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (
            window as unknown as { __previewTestState: { clipboard: string } }
          ).__previewTestState.clipboard = value;
        }
      }
    });

    const baseAlphaFields = [
      { path: 'tradeId', label: 'tradeId', kind: 'string', required: true },
      {
        path: 'side',
        label: 'side',
        kind: 'enum',
        required: true,
        enumValues: [
          { value: 'Buy', label: 'Buy' },
          { value: 'Sell', label: 'Sell' }
        ]
      },
      {
        path: 'party',
        label: 'party',
        kind: 'object',
        required: true,
        children: [
          {
            path: 'party.legalName',
            label: 'legalName',
            kind: 'string',
            required: true
          }
        ]
      },
      {
        path: 'aliases',
        label: 'aliases',
        kind: 'array',
        required: true,
        cardinality: { min: 1, max: 2 },
        children: [{ path: 'aliases[]', label: 'aliases item', kind: 'string', required: true }]
      }
    ];

    function schemaForFiles(
      files: Array<{ uri: string; content: string }>,
      targetId: string
    ): { kind: 'result'; schema: unknown } | { kind: 'stale'; reason: string; message: string } {
      const content = files.map((file) => file.content).join('\n');

      if (content.includes('type StaleSentinel:') && targetId === 'preview.alpha.Trade') {
        return {
          kind: 'stale',
          reason: 'parse-error',
          message: 'Fix model errors to refresh the form preview.'
        };
      }

      if (targetId === 'preview.alpha.RenamedTrade' && content.includes('type RenamedTrade:')) {
        return {
          kind: 'result',
          schema: {
            schemaVersion: 1,
            targetId,
            title: 'RenamedTrade',
            status: 'ready',
            fields: baseAlphaFields
          }
        };
      }

      if (targetId === 'preview.alpha.Trade' && content.includes('settlementDate string')) {
        return {
          kind: 'result',
          schema: {
            schemaVersion: 1,
            targetId,
            title: 'Trade',
            status: 'ready',
            fields: [
              ...baseAlphaFields,
              {
                path: 'settlementDate',
                label: 'Settlement date',
                kind: 'string',
                required: false
              }
            ]
          }
        };
      }

      if (targetId === 'preview.alpha.Trade' && content.includes('type Trade:')) {
        return {
          kind: 'result',
          schema: {
            schemaVersion: 1,
            targetId,
            title: 'Alpha Trade Preview',
            status: 'ready',
            fields: baseAlphaFields
          }
        };
      }

      if (targetId === 'preview.beta.Trade' && content.includes('preview.beta')) {
        return {
          kind: 'result',
          schema: {
            schemaVersion: 1,
            targetId,
            title: 'Trade',
            status: 'ready',
            fields: [{ path: 'betaOnly', label: 'betaOnly', kind: 'string', required: true }]
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
      readonly url = 'preview-worker-mock';

      constructor() {
        super();
      }

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

async function resetPreviewNetworkState(page: Page) {
  await page.evaluate(() => {
    (
      window as unknown as { __previewTestState: { resetNetwork(): void } }
    ).__previewTestState.resetNetwork();
  });
}

async function readPreviewClipboard(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __previewTestState: { clipboard: string } }).__previewTestState
        .clipboard
  );
}

async function readPreviewNetworkEvents(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __previewTestState: { networkEvents: string[] } }).__previewTestState
        .networkEvents
  );
}

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

async function replaceActiveSource(page: Page, content: string) {
  await page.evaluate(async (nextContent) => {
    if (!window.__runeStudioTestApi) {
      throw new Error('Missing rune studio test API');
    }
    await window.__runeStudioTestApi.replaceWorkspaceFiles([
      {
        name: 'preview-alpha.rosetta',
        path: 'preview-alpha.rosetta',
        content: nextContent,
        dirty: true
      }
    ]);
  }, content);
  await page.waitForTimeout(700);
}

async function selectTypeFromNavigate(page: Page, nodeId: string): Promise<void> {
  const typeRow = page.getByTestId(`ns-type-${nodeId}`);
  await typeRow.waitFor({ state: 'visible', timeout: 10_000 });
  await typeRow.locator('span.truncate').click();
}

test.describe('Form Preview', () => {
  test.beforeEach(async ({ page }) => {
    await installPreviewWorkerMock(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('renders the selected type in Preview → Form with nested mapped fields', async ({
    page
  }) => {
    await loadFiles(page, [{ name: 'preview-alpha.rosetta', content: PREVIEW_MODEL }]);

    const previewPanel = page.getByTestId('panel-formPreview');
    await expect(previewPanel).toContainText(
      'Select a type from the graph, file tree, or source editor to preview a generated form.'
    );

    await selectTypeFromNavigate(page, 'preview.alpha::Trade');

    await expect(previewPanel.getByRole('heading', { name: 'Trade' })).toBeVisible();
    await expect(previewPanel.getByText('preview.alpha.Trade [Data]')).toBeVisible();
    await expect(previewPanel.getByLabel('tradeId')).toBeVisible();
    await expect(previewPanel.getByLabel('side')).toBeVisible();
    await expect(previewPanel.getByText('party', { exact: true })).toBeVisible();
    await expect(previewPanel.getByLabel('legalName')).toBeVisible();
  });

  test('uses fully-qualified target identity when duplicate display names exist', async ({
    page
  }) => {
    await loadFiles(page, [
      { name: 'preview-alpha.rosetta', content: DUPLICATE_ALPHA_MODEL },
      { name: 'preview-beta.rosetta', content: DUPLICATE_BETA_MODEL }
    ]);

    const previewPanel = page.getByTestId('panel-formPreview');

    await selectTypeFromNavigate(page, 'preview.alpha::Trade');
    await expect(previewPanel.getByRole('heading', { name: 'Trade' })).toBeVisible();
    await expect(previewPanel.getByText('preview.alpha.Trade [Data]')).toBeVisible();

    await selectTypeFromNavigate(page, 'preview.beta::Trade');
    await expect(previewPanel.getByRole('heading', { name: 'Trade' })).toBeVisible();
    await expect(previewPanel.getByText('preview.beta.Trade [Data]')).toBeVisible();
    await expect(previewPanel.getByLabel('betaOnly')).toBeVisible();
    await expect(previewPanel).not.toContainText('preview.alpha.Trade [Data]');
  });

  test('validates required fields and bounded arrays, then clears errors after valid input', async ({
    page
  }) => {
    await loadFiles(page, [{ name: 'preview-alpha.rosetta', content: PREVIEW_MODEL }]);
    await selectTypeFromNavigate(page, 'preview.alpha::Trade');

    const previewPanel = page.getByTestId('panel-formPreview');
    await previewPanel.getByLabel('tradeId').click();
    await page.keyboard.press('Tab');
    await previewPanel.getByLabel('legalName').click();
    await page.keyboard.press('Tab');

    await expect(previewPanel.getByText(/invalid sample/i)).toBeVisible();
    await expect(previewPanel.getByText(/tradeId is required/i)).toBeVisible();
    await expect(previewPanel.getByText(/legalName is required/i)).toBeVisible();
    await expect(previewPanel.getByText(/add at least 1 aliases item/i)).toBeVisible();

    await previewPanel.getByLabel('tradeId').fill('TRD-100');
    await previewPanel.getByLabel('legalName').fill('Acme Bank');
    await previewPanel.getByRole('button', { name: /add aliases item/i }).click();
    await previewPanel.getByLabel('aliases item 1').fill('Desk alias');

    await expect(previewPanel.getByText(/valid sample/i)).toBeVisible();
    await expect(previewPanel.getByText(/invalid sample/i)).not.toBeVisible();
  });

  test('supports keyboard-only reset and sample-data copy without extra network requests', async ({
    page
  }) => {
    await loadFiles(page, [{ name: 'preview-alpha.rosetta', content: PREVIEW_MODEL }]);
    await selectTypeFromNavigate(page, 'preview.alpha::Trade');
    await resetPreviewNetworkState(page);

    const previewPanel = page.getByTestId('panel-formPreview');
    await previewPanel.getByLabel('tradeId').fill('TRD-200');
    await previewPanel.getByLabel('legalName').fill('Acme Bank');
    await previewPanel.getByRole('button', { name: /add aliases item/i }).click();
    await previewPanel.getByLabel('aliases item 1').fill('Desk alias');

    await expect(previewPanel.getByText(/valid sample/i)).toBeVisible();
    await expect(previewPanel.getByTestId('sample-data-output')).toContainText(
      '"tradeId": "TRD-200"'
    );

    await previewPanel.getByRole('button', { name: /copy sample data/i }).focus();
    await page.keyboard.press('Enter');

    expect(await readPreviewClipboard(page)).toContain('"tradeId": "TRD-200"');
    expect(await readPreviewClipboard(page)).toContain('"Desk alias"');
    expect(await readPreviewNetworkEvents(page)).toEqual([]);

    await previewPanel.getByRole('button', { name: /reset sample/i }).focus();
    await page.keyboard.press('Enter');

    await expect(previewPanel.getByText(/ready to validate sample/i)).toBeVisible();
    await expect(previewPanel.getByTestId('sample-data-output')).toContainText('"tradeId": ""');
    expect(await readPreviewNetworkEvents(page)).toEqual([]);
  });

  test('refreshes the selected preview after valid model changes', async ({ page }) => {
    await loadFiles(page, [{ name: 'preview-alpha.rosetta', content: PREVIEW_MODEL }]);
    await selectTypeFromNavigate(page, 'preview.alpha::Trade');

    const previewPanel = page.getByTestId('panel-formPreview');
    await expect(previewPanel.getByRole('heading', { name: 'Trade' })).toBeVisible();

    await replaceActiveSource(page, PREVIEW_MODEL_UPDATED);
    await selectTypeFromNavigate(page, 'preview.alpha::Trade');
    await expect(previewPanel.getByLabel('Settlement date')).toBeVisible();
  });

  test('returns to the empty state when the selected type is deleted', async ({ page }) => {
    await loadFiles(page, [{ name: 'preview-alpha.rosetta', content: PREVIEW_MODEL }]);
    await selectTypeFromNavigate(page, 'preview.alpha::Trade');

    const previewPanel = page.getByTestId('panel-formPreview');
    await expect(previewPanel.getByRole('heading', { name: 'Trade' })).toBeVisible();

    await replaceActiveSource(page, PREVIEW_MODEL_DELETED);
    await expect(
      previewPanel.getByText(/select a type from the graph, file tree, or source editor/i)
    ).toBeVisible();
    await expect(previewPanel.getByRole('heading', { name: 'Trade' })).not.toBeVisible();
  });

  test('follows the selected preview target when the type is renamed during reload', async ({
    page
  }) => {
    await loadFiles(page, [{ name: 'preview-alpha.rosetta', content: PREVIEW_MODEL }]);
    await selectTypeFromNavigate(page, 'preview.alpha::Trade');

    const previewPanel = page.getByTestId('panel-formPreview');
    await expect(previewPanel.getByRole('heading', { name: 'Trade' })).toBeVisible();

    await replaceActiveSource(page, PREVIEW_MODEL_RENAMED);

    await expect(previewPanel.getByRole('heading', { name: 'RenamedTrade' })).toBeVisible();
    await expect(
      previewPanel.getByText(/select a type from the graph, file tree, or source editor/i)
    ).not.toBeVisible();
  });
});
