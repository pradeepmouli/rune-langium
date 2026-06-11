// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Shared test helper for the Phase 3 `node.meta` sibling: builds a minimal
 * GraphNodeMeta for synthetic TypeGraphNode fixtures so every test's
 * makeNode-style builder conforms to the node contract without repeating
 * the default field set.
 */

import type { GraphNodeMeta } from '../../src/types.js';

export function testMeta(namespace: string, overrides: Partial<GraphNodeMeta> = {}): GraphNodeMeta {
  return {
    namespace,
    errors: [],
    hasExternalRefs: false,
    ...overrides
  };
}
