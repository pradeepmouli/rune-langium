// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Studio build-time configuration (014-studio-prod-ready Phase 2 / T009).
 *
 * Vite reads `VITE_*` vars at build time via `import.meta.env`. This module
 * validates the relevant vars with Zod the first time it loads — a typo or
 * missing required value crashes the bundle at module-init rather than
 * silently degrading at runtime.
 *
 * See `specs/014-studio-prod-ready/contracts/studio-config.md` for the full
 * contract. New env vars added by feature 014:
 *
 *   - `VITE_LSP_WS_URL`         WebSocket base for the LSP host (FR-021)
 *   - `VITE_LSP_SESSION_URL`    HTTP endpoint for `POST /lsp/session`
 *   - `VITE_TELEMETRY_ENDPOINT` (already shipped in 012)
 *   - `VITE_ENABLE_LSP`         deployment-level switch for remote LSP
 *   - `VITE_ENABLE_TELEMETRY`   deployment-level switch for telemetry emits
 *   - `VITE_ENABLE_GITHUB_AUTH` deployment-level switch for GitHub auth flow
 *   - `VITE_ENABLE_CURATED_MIRROR` deployment-level switch for curated mirror UI
 *   - `VITE_DEV_MODE`           gates dev-only status copy (FR-014)
 *   - `VITE_LEGACY_GIT_PATH`    re-enables the legacy isomorphic-git fallback
 *                               (FR-019; production builds default `false`)
 */

import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const wsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith('ws://') || u.startsWith('wss://'), {
    message: 'must start with ws:// or wss://'
  });

const httpUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
    message: 'must start with http:// or https://'
  });

/** Coerce a `'true' | 'false' | undefined` string to a boolean with a default. */
function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

/** Convert a ws(s):// URL to its http(s):// counterpart for the session POST. */
function deriveSessionUrl(ws: string): string {
  return ws.startsWith('wss://')
    ? ws.replace(/^wss:\/\//, 'https://').replace(/\/lsp\/?$/, '/lsp/session')
    : ws.replace(/^ws:\/\//, 'http://').replace(/\/lsp\/?$/, '/lsp/session');
}

// ────────────────────────────────────────────────────────────────────────────
// Env extraction
// ────────────────────────────────────────────────────────────────────────────

const env = import.meta.env;
// Use MODE as the authoritative signal (DEV/PROD can both report true under
// vitest where stubEnv toggles one without clearing the other).
const isProd = env.MODE === 'production' || (env.PROD === true && env.MODE !== 'development');
const isDev = env.MODE === 'development' || (env.DEV === true && env.MODE !== 'production');

const PROD_LSP_WS_URL = 'wss://www.daikonic.dev/rune-studio/api/lsp';
const DEV_LSP_WS_URL = 'ws://localhost:3001';

const lspWsDefault = isProd ? PROD_LSP_WS_URL : DEV_LSP_WS_URL;
const lspWsUrl = env.VITE_LSP_WS_URL ?? lspWsDefault;
const lspSessionUrl = env.VITE_LSP_SESSION_URL ?? deriveSessionUrl(lspWsUrl);

const origin = typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin;
const telemetryEndpoint = env.VITE_TELEMETRY_ENDPOINT ?? `${origin}/api/telemetry/v1/event`;
const lspEnabled = boolFromEnv(env.VITE_ENABLE_LSP, true);
const telemetryEnabled = boolFromEnv(env.VITE_ENABLE_TELEMETRY, false);
const githubAuthEnabled = boolFromEnv(env.VITE_ENABLE_GITHUB_AUTH, true);
const curatedMirrorEnabled = boolFromEnv(env.VITE_ENABLE_CURATED_MIRROR, true);

// VITE_DEV_MODE override; otherwise mirror import.meta.env.DEV.
const devMode = env.VITE_DEV_MODE !== undefined ? boolFromEnv(env.VITE_DEV_MODE, isDev) : isDev;

const legacyGitPathEnabled = boolFromEnv(env.VITE_LEGACY_GIT_PATH, false);

// ────────────────────────────────────────────────────────────────────────────
// Schema + parse
// ────────────────────────────────────────────────────────────────────────────

const ConfigSchema = z
  .object({
    lspWsUrl: wsUrl,
    lspSessionUrl: httpUrl,
    telemetryEndpoint: httpUrl,
    lspEnabled: z.boolean(),
    telemetryEnabled: z.boolean(),
    githubAuthEnabled: z.boolean(),
    curatedMirrorEnabled: z.boolean(),
    devMode: z.boolean(),
    legacyGitPathEnabled: z.boolean()
  })
  .strict();

export type StudioRuntimeConfig = z.infer<typeof ConfigSchema>;

/**
 * Validated config singleton. Throws (at module-init) if any var is malformed.
 * Importers SHOULD pull `config` and never re-read `import.meta.env` directly.
 */
export const config: StudioRuntimeConfig = ConfigSchema.parse({
  lspWsUrl,
  lspSessionUrl,
  telemetryEndpoint,
  lspEnabled,
  telemetryEnabled,
  githubAuthEnabled,
  curatedMirrorEnabled,
  devMode,
  legacyGitPathEnabled
});

// ────────────────────────────────────────────────────────────────────────────
// Legacy nav-link config (kept for back-compat with App.tsx).
// New code SHOULD import `config` above instead.
// ────────────────────────────────────────────────────────────────────────────

const navOrigin = typeof window === 'undefined' ? '' : window.location.origin;

export const studioConfig = {
  homeUrl: env.VITE_HOME_URL || `${navOrigin}/`,
  docsUrl: env.VITE_DOCS_URL || `${navOrigin}/docs/`,
  githubUrl: env.VITE_GITHUB_URL || 'https://github.com/pradeepmouli/rune-langium'
};
