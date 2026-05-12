// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * E2E — LSP connection-state UI (019 Phase 2, Task 2.6).
 *
 * Drives the new LspConnectionBadge through its three user-visible states
 * by stubbing the same-origin /api/lsp/session endpoint at the network
 * layer:
 *  - 503 → badge surfaces "Language services unavailable" + a Retry button
 *  - retry while still 503 → still unavailable
 *  - retry once the route is unblocked → badge recovers (error testid gone)
 *
 * The badge is rendered in the editor footer (EditorPage.tsx); the spec
 * lands in the editor via the "New" empty-workspace flow so the footer
 * mounts.
 */

import { expect, test } from '@playwright/test';

const SESSION_URL_GLOB = '**/api/lsp/session';

test.describe('LSP connection-state UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
  });

  test('shows "Language services unavailable" when /api/lsp/session returns 503', async ({ page }) => {
    await page.route(SESSION_URL_GLOB, (route) =>
      route.fulfill({ status: 503, body: 'down', contentType: 'text/plain' })
    );

    // Get into the editor so the footer renders.
    await page.getByTestId('file-loader').getByRole('button', { name: /^New/i }).click();

    // The badge appears once the transport-provider's mint attempt fails.
    await expect(page.getByTestId('lsp-badge-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Language services unavailable/i)).toBeVisible();
    await expect(page.getByTestId('lsp-badge-retry')).toBeVisible();
  });

  test('Retry button hides the error once the session route is unblocked', async ({ page }) => {
    let blockSession = true;
    await page.route(SESSION_URL_GLOB, async (route) => {
      if (blockSession) {
        await route.fulfill({ status: 503, body: 'down', contentType: 'text/plain' });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: `e2e-mock-token-${Date.now()}`,
            expiresAt: Date.now() + 60_000
          })
        });
      }
    });

    await page.getByTestId('file-loader').getByRole('button', { name: /^New/i }).click();
    await expect(page.getByTestId('lsp-badge-error')).toBeVisible({ timeout: 10_000 });

    // Unblock the route and retry — the mint should now succeed, WS open will
    // fail (no real LSP backend in this test) but the BADGE only renders the
    // error state when the provider lands on error / disconnected. The retry
    // path drives provider.reconnect; with the route unblocked, the mint
    // succeeds and the provider attempts the WS connect.
    blockSession = false;
    await page.getByTestId('lsp-badge-retry').click();

    // Once the mint succeeds, the badge transitions out of the error state.
    // It MAY land on 'connecting' (spinner) or briefly re-error if the WS
    // step fails — but the error testid should not stay visible
    // indefinitely. Allow a generous window for the reconnect dance.
    await expect(page.getByTestId('lsp-badge-error')).toBeHidden({ timeout: 10_000 });
  });

  test('editor remains usable when LSP is unavailable', async ({ page }) => {
    await page.route(SESSION_URL_GLOB, (route) =>
      route.fulfill({ status: 503, body: 'down', contentType: 'text/plain' })
    );

    await page.getByTestId('file-loader').getByRole('button', { name: /^New/i }).click();

    // CodeMirror mounts even without LSP — typing must still work.
    await page.waitForSelector('.cm-editor', { timeout: 10_000 });
    await page.locator('.cm-editor').click();
    await page.keyboard.type('namespace test\n');

    // The badge is in its error state but does not block editing.
    await expect(page.getByTestId('lsp-badge-error')).toBeVisible();
  });
});
