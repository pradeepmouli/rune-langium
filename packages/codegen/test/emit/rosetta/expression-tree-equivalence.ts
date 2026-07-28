// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Relocated to `src/emit/rosetta/expression-tree-equivalence.ts` so
 * production code (`LanguageLensEditor`'s no-op-blur detection) can import
 * it too — `src/` must never depend on `test/`. Re-exported here unchanged
 * so existing test imports don't need to move.
 */
export * from '../../../src/emit/rosetta/expression-tree-equivalence.js';
