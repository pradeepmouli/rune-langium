// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * SSoT disjointness guard for node-projection's `export * from generated/domain`.
 *
 * WHY this exists:
 * node-projection.ts re-exports the generated domain surface as the write SSoT
 * via `export * from '../generated/domain.js'`. TypeScript's `export *` gives
 * LOCAL exports precedence over star-re-exported ones — so if the grammar /
 * domain-surfaces.json ever generates a symbol whose name collides with a
 * node-projection LOCAL export (e.g. `makeNodeId`, `parseEdgeId`,
 * `getMemberArray`), the local export silently shadows the generated accessor.
 * No TS error is raised, and `domain.ts` carries `// @ts-nocheck`, so the
 * compiler will never flag the divergence either. A consumer importing that
 * name from node-projection would silently get the local implementation, never
 * the generated accessor — a silent SSoT divergence.
 *
 * This test converts that silent divergence into a RED test at generation time:
 * it asserts the generated module exports none of node-projection's hand-written
 * local names.
 *
 * LIMITATION: runtime `Object.keys(gen)` only sees VALUE exports, not type-only
 * ones (`Ref`, the `*Domain` interfaces, `EdgeKind`). That is acceptable — the
 * value accessors are the SSoT surface that matters for shadowing; a type-only
 * collision cannot shadow a value accessor at runtime.
 */

import { describe, it, expect } from 'vitest';
import * as gen from '../../src/generated/domain.js';

/**
 * node-projection's OWN hand-written export names (NOT coming from the
 * `export *`). Verified against `src/store/node-projection.ts`.
 *
 * Type-only exports that cannot appear in runtime `Object.keys(gen)` are listed
 * here for completeness but do not affect the runtime assertion: `EdgeKind`
 * (re-exported type).
 */
const LOCAL_EXPORTS: readonly string[] = [
  // V1 — id builders
  'makeNodeId',
  'nameFromNodeId',
  'splitNodeId',
  // V3 — edge-id builders
  'makeEdgeId',
  'parseEdgeId',
  // V2 — metadata field set + AST projection
  'GRAPH_METADATA_KEYS',
  'stripGraphMetadata',
  'astRelevantProjection',
  'withGraphMetadata',
  // V4 — member-array accessors (MEMBER_FIELD_BY_KIND is module-private, not exported)
  'getMemberArray',
  'ensureMemberArray',
  'forEachMember',
  // V5/V6 — array↔Map derivation
  'toNodesById',
  'nodesFromMap',
  'toEdgesById',
  'edgesFromMap',
  // Node-kind resolution (re-exported from model-helpers)
  'resolveNodeKind',
  // Type-only re-export (cannot appear at runtime; listed for documentation)
  'EdgeKind'
];

describe('node-projection / generated domain export disjointness (SSoT guard)', () => {
  it('the generated domain surface exports none of node-projection local names', () => {
    const collisions = Object.keys(gen).filter((k) => LOCAL_EXPORTS.includes(k));
    expect(collisions).toEqual([]);
  });
});
