// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Shared cross-cutting utilities for rune-langium's plain Cloudflare
 * Workers (lsp-worker, codegen-worker, telemetry-worker,
 * curated-mirror-worker). `./log.ts` is the first module here — structured
 * logging that was previously copy-pasted (and drifted) across all four
 * Workers' own `log.ts` files. `./origin.ts` is the second — origin-
 * allowlist matching (with CF Pages preview wildcard support), previously
 * duplicated near-identically across lsp-worker's and telemetry-worker's
 * own `isOriginAllowed`. Future cross-cutting concerns shared by this same
 * fleet belong as sibling modules here, each re-exported below, rather
 * than as another round of per-Worker duplication.
 */

export * from './log.js';
export * from './origin.js';
