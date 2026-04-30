// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HOME_URL?: string;
  readonly VITE_DOCS_URL?: string;
  readonly VITE_GITHUB_URL?: string;
  readonly VITE_BASE_URL?: string;
  // ── 014 (Studio Production Readiness) — see contracts/studio-config.md ──
  /** LSP host base URL. Studio appends `/ws/<sessionToken>` at runtime. */
  readonly VITE_LSP_WS_URL?: string;
  /** HTTP endpoint for `POST /lsp/session` (token mint); derived from LSP WS URL when omitted. */
  readonly VITE_LSP_SESSION_URL?: string;
  /** When `'false'`, disables Studio's remote language-service connection attempts. */
  readonly VITE_ENABLE_LSP?: string;
  /** Telemetry POST endpoint; derived from `location.origin` when omitted. */
  readonly VITE_TELEMETRY_ENDPOINT?: string;
  /** When `'true'`, enables telemetry emits for the build; defaults to disabled. */
  readonly VITE_ENABLE_TELEMETRY?: string;
  /** When `'false'`, hides and disables the GitHub auth-backed workspace flow. */
  readonly VITE_ENABLE_GITHUB_AUTH?: string;
  /** When `'false'`, hides and disables the curated reference-model mirror UI. */
  readonly VITE_ENABLE_CURATED_MIRROR?: string;
  /** When `'true'`, enables developer-only status copy and dev-mode hints. */
  readonly VITE_DEV_MODE?: string;
  /** When `'true'`, re-enables the legacy `cors.isomorphic-git.org` clone fallback (FR-019). */
  readonly VITE_LEGACY_GIT_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
