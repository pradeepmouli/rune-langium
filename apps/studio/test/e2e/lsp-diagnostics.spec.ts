// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T045 — LSP diagnostics latency e2e (014-studio-prod-ready, US3, SC-005).
 *
 * Mocks the CF LSP worker's HTTP + WebSocket surface so the test is hermetic:
 *
 *   POST /api/lsp/session   → 200 { token, expiresAt }   (intercepted)
 *   WS   /api/lsp/ws/<tok>  → handled by an injected stub that responds to
 *                              `initialize` with the documented capabilities
 *                              and emits canned `publishDiagnostics`,
 *                              `hover`, `completion` results when the
 *                              corresponding requests / `didOpen` arrive.
 *
 * The assertions are on the *latency budgets* + DOM rendering (SC-005):
 *
 *   (a) Within 2s of typing a deliberate typo, a Problems-panel entry
 *       MUST appear.
 *   (b) Within 1s of hovering a known type, a tooltip MUST appear.
 *   (c) Within 1s of pressing Ctrl-Space, a completion list MUST appear.
 *
 * The stub does NOT exercise real langium parsing — that's covered by
 * apps/lsp-worker/test (T037 + T038). This e2e is a smoke test on the
 * Studio side of the wire.
 *
 * The whole spec is skipped until the workspace + editor mount path is
 * fully wired through the new transport-provider Step 3 (T044). The
 * current Studio still loads via the legacy dev-WS first; once a curated
 * model is open + the editor pane visible, Step 3 will run on a fresh
 * tab whose dev WS connection refuses (matches the production posture).
 */

import { test, expect, type Page, type Route } from '@playwright/test';

const SESSION_URL_GLOB = '**/api/lsp/session';
const WS_URL_GLOB = '**/api/lsp/ws/**';

interface MockState {
  sessionMintCount: number;
  wsConnections: number;
}

async function installLspMocks(page: Page): Promise<MockState> {
  const state: MockState = { sessionMintCount: 0, wsConnections: 0 };

  // Mock the session-mint endpoint.
  await page.route(SESSION_URL_GLOB, async (route: Route) => {
    state.sessionMintCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: `e2e-mock-token-${state.sessionMintCount}`,
        expiresAt: Date.now() + 60_000
      })
    });
  });

  // Inject a fake WebSocket that responds to LSP messages with canned
  // notifications. Runs in the page context so `new WebSocket(url)` is
  // intercepted before any code creates one.
  await page.addInitScript(() => {
    const RealWS = window.WebSocket;
    class StubWS extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readyState = 0;
      url: string;
      protocol = '';
      bufferedAmount = 0;
      extensions = '';
      binaryType: BinaryType = 'blob';

      onopen: ((e: Event) => void) | null = null;
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      onclose: ((e: CloseEvent) => void) | null = null;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        if (!this.url.includes('/api/lsp/ws/')) {
          // Not our concern — defer to the real implementation.
          return new RealWS(url) as unknown as StubWS;
        }
        // Fire 'open' on the next microtask so `transport.subscribe(...)`
        // has a chance to attach before the first message lands.
        queueMicrotask(() => {
          this.readyState = 1;
          this.dispatchEvent(new Event('open'));
          this.onopen?.(new Event('open'));
        });
      }

      send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        try {
          const text =
            typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
          const msg = JSON.parse(text) as {
            jsonrpc?: string;
            id?: number | string;
            method?: string;
            params?: { textDocument?: { uri?: string } };
          };
          if (msg.method === 'initialize' && typeof msg.id !== 'undefined') {
            this.fakeReply(msg.id, {
              capabilities: {
                textDocumentSync: { openClose: true, change: 1 },
                hoverProvider: true,
                completionProvider: { triggerCharacters: ['.', ':'] },
                definitionProvider: true
              }
            });
            return;
          }
          if (msg.method === 'textDocument/didOpen') {
            // After a brief delay (so the latency budget assertion is
            // meaningful), publish a canned diagnostic.
            setTimeout(() => {
              this.fakeNotify('textDocument/publishDiagnostics', {
                uri: msg.params?.textDocument?.uri ?? 'file:///e2e.rosetta',
                diagnostics: [
                  {
                    range: {
                      start: { line: 0, character: 0 },
                      end: { line: 0, character: 5 }
                    },
                    severity: 1,
                    message: 'Mock LSP diagnostic — typo detected',
                    source: 'rune-dsl',
                    code: 'mock-1'
                  }
                ]
              });
            }, 50);
            return;
          }
          if (msg.method === 'textDocument/hover' && typeof msg.id !== 'undefined') {
            this.fakeReply(msg.id, {
              contents: { kind: 'markdown', value: 'Mock hover for known type' }
            });
            return;
          }
          if (msg.method === 'textDocument/completion' && typeof msg.id !== 'undefined') {
            this.fakeReply(msg.id, {
              isIncomplete: false,
              items: [
                { label: 'string', kind: 7 },
                { label: 'date', kind: 7 }
              ]
            });
            return;
          }
          if (typeof msg.id !== 'undefined') {
            // Unknown request — null result so the LSP client doesn't hang.
            this.fakeReply(msg.id, null);
          }
        } catch {
          /* ignore */
        }
      }

      private fakeReply(id: number | string, result: unknown): void {
        this.fakePush({ jsonrpc: '2.0', id, result });
      }
      private fakeNotify(method: string, params: unknown): void {
        this.fakePush({ jsonrpc: '2.0', method, params });
      }
      private fakePush(payload: unknown): void {
        const data = JSON.stringify(payload);
        const ev = new MessageEvent('message', { data });
        queueMicrotask(() => {
          this.dispatchEvent(ev);
          this.onmessage?.(ev);
        });
      }

      close(): void {
        this.readyState = 3;
        const ev = new CloseEvent('close', { code: 1000, reason: 'normal', wasClean: true });
        this.dispatchEvent(ev);
        this.onclose?.(ev);
      }
    }
    (window as unknown as { WebSocket: typeof StubWS }).WebSocket = StubWS;
  });

  return state;
}

test.describe('LSP diagnostics latency (T045)', () => {
  // The studio's editor surface needs a workspace open before the LSP
  // path engages. The full open-workspace + open-editor + Step-3-engaged
  // flow is composed across phases 3+5+7; on the current branch state
  // the start-page surface is the entry point and the rest of the
  // pipeline is partially wired. We mark this spec as skipped at the
  // suite level until the upstream E2E harness exposes a deterministic
  // route into the editor with the CF LSP transport active.
  //
  // Once the harness is in place (tracked alongside T044b's status
  // surface), drop the .skip() and the test will run end-to-end against
  // the page.route() / WebSocket stubs above.
  test.skip(true, 'T045 e2e harness gating — see comment + tasks.md');

  test('diagnostic appears within 2s of typing a typo (SC-005)', async ({ page }) => {
    const state = await installLspMocks(page);
    await page.goto('./');
    // Drive the workspace into the editor, type "tradse Trade:", then:
    const start = Date.now();
    await page.waitForSelector('[data-testid="problems-panel"] [role="row"]', {
      timeout: 2000
    });
    expect(Date.now() - start).toBeLessThanOrEqual(2000);
    expect(state.sessionMintCount).toBeGreaterThan(0);
  });

  test('hover tooltip appears within 1s', async ({ page }) => {
    await installLspMocks(page);
    await page.goto('./');
    const start = Date.now();
    await page.locator('[data-testid="hover-tooltip"]').waitFor({ timeout: 1000 });
    expect(Date.now() - start).toBeLessThanOrEqual(1000);
  });

  test('completion list appears within 1s of Ctrl-Space', async ({ page }) => {
    await installLspMocks(page);
    await page.goto('./');
    const start = Date.now();
    await page.keyboard.press('Control+Space');
    await page.locator('[data-testid="completion-list"]').waitFor({ timeout: 1000 });
    expect(Date.now() - start).toBeLessThanOrEqual(1000);
  });
});
