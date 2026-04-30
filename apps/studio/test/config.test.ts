// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T009/T011 — Studio config singleton (014-studio-prod-ready Phase 2).
 *
 * Verifies the Zod-validated config from `apps/studio/src/config.ts`
 * per `specs/014-studio-prod-ready/contracts/studio-config.md`:
 *
 *  (a) production defaults route to `wss://www.daikonic.dev/rune-studio/api/lsp`
 *  (b) dev defaults route to `ws://localhost:3001`
 *  (c) override via `VITE_LSP_WS_URL` wins
 *  (d) malformed URL throws at module load
 *  (e) `legacyGitPathEnabled` defaults to `false`
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface StudioEnv {
  readonly DEV?: boolean;
  readonly PROD?: boolean;
  readonly MODE?: string;
  readonly VITE_LSP_WS_URL?: string;
  readonly VITE_LSP_SESSION_URL?: string;
  readonly VITE_ENABLE_LSP?: string;
  readonly VITE_TELEMETRY_ENDPOINT?: string;
  readonly VITE_ENABLE_TELEMETRY?: string;
  readonly VITE_ENABLE_GITHUB_AUTH?: string;
  readonly VITE_ENABLE_CURATED_MIRROR?: string;
  readonly VITE_DEV_MODE?: string;
  readonly VITE_LEGACY_GIT_PATH?: string;
  readonly VITE_HOME_URL?: string;
  readonly VITE_DOCS_URL?: string;
  readonly VITE_GITHUB_URL?: string;
  readonly VITE_BASE_URL?: string;
}

/**
 * Re-import config.ts in isolation with a fresh `import.meta.env`.
 *
 * vitest caches modules by path, so we use `vi.resetModules()` between
 * cases. The dynamic `import('../src/config.ts')` re-evaluates the
 * module under the current stubbed env so each assertion sees a
 * fresh validation pass.
 */
async function loadConfig(env: StudioEnv): Promise<typeof import('../src/config.js')> {
  vi.resetModules();
  // Vite-compatible: stubEnv mutates import.meta.env without redefining the
  // descriptor (vi.stubGlobal('import.meta.env', ...) doesn't apply on dynamic
  // imports because import.meta is per-module). We replace the env entirely
  // by setting our own VITE_* values + DEV/PROD flags.
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    // vitest's stubEnv only accepts string values; coerce booleans for DEV/PROD.
    vi.stubEnv(k, typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));
  }
  return await import('../src/config.js');
}

describe('studio config singleton (014 T009/T011)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('(a) production defaults route LSP to wss://www.daikonic.dev/rune-studio/api/lsp', async () => {
    const { config } = await loadConfig({
      DEV: false,
      PROD: true,
      MODE: 'production'
    });
    expect(config.lspWsUrl).toBe('wss://www.daikonic.dev/rune-studio/api/lsp');
    expect(config.lspEnabled).toBe(true);
    expect(config.devMode).toBe(false);
  });

  it('(b) dev defaults route LSP to ws://localhost:3001', async () => {
    const { config } = await loadConfig({
      DEV: true,
      PROD: false,
      MODE: 'development'
    });
    expect(config.lspWsUrl).toBe('ws://localhost:3001');
    expect(config.lspEnabled).toBe(true);
    expect(config.devMode).toBe(true);
  });

  it('(c) VITE_LSP_WS_URL override wins over the default', async () => {
    const { config } = await loadConfig({
      DEV: false,
      PROD: true,
      MODE: 'production',
      VITE_LSP_WS_URL: 'wss://custom.example/lsp'
    });
    expect(config.lspWsUrl).toBe('wss://custom.example/lsp');
  });

  it('(d) malformed URL throws at module load', async () => {
    await expect(
      loadConfig({
        DEV: true,
        PROD: false,
        MODE: 'development',
        VITE_LSP_WS_URL: 'not-a-url'
      })
    ).rejects.toThrow();
  });

  it('(e) legacyGitPathEnabled defaults to false', async () => {
    const { config } = await loadConfig({
      DEV: false,
      PROD: true,
      MODE: 'production'
    });
    expect(config.legacyGitPathEnabled).toBe(false);
    expect(config.telemetryEnabled).toBe(false);
    expect(config.githubAuthEnabled).toBe(true);
    expect(config.curatedMirrorEnabled).toBe(true);
  });

  it('(f) VITE_ENABLE_TELEMETRY toggles telemetry emits for the build', async () => {
    const { config } = await loadConfig({
      DEV: false,
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_TELEMETRY: 'true'
    });
    expect(config.telemetryEnabled).toBe(true);
  });

  it('(g) VITE_ENABLE_LSP=false disables remote language services', async () => {
    const { config } = await loadConfig({
      DEV: false,
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_LSP: 'false'
    });
    expect(config.lspEnabled).toBe(false);
  });

  it('(h) service switches can disable GitHub auth and curated mirror independently', async () => {
    const { config } = await loadConfig({
      DEV: false,
      PROD: true,
      MODE: 'production',
      VITE_ENABLE_GITHUB_AUTH: 'false',
      VITE_ENABLE_CURATED_MIRROR: 'false'
    });
    expect(config.githubAuthEnabled).toBe(false);
    expect(config.curatedMirrorEnabled).toBe(false);
  });
});
