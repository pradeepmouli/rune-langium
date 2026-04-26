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
  /** Telemetry POST endpoint; derived from `location.origin` when omitted. */
  readonly VITE_TELEMETRY_ENDPOINT?: string;
  /** When `'true'`, enables developer-only status copy and dev-mode hints. */
  readonly VITE_DEV_MODE?: string;
  /** When `'true'`, re-enables the legacy `cors.isomorphic-git.org` clone fallback (FR-019). */
  readonly VITE_LEGACY_GIT_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
