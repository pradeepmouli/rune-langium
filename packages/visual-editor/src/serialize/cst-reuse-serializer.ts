// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CST-reuse `.rosetta` serializer (option B).
 *
 * Per node: if its subtree is clean (has a $cstRange and no pendingEditPatch at
 * or under it), slice the original bytes; else regenerate via the emit-core,
 * recursing into children (each child reuses if clean). Untouched content is
 * never re-emitted. Replaces serializeModel + mergeSerializedIntoSource.
 */

import { emitNode, type EmitChild, type DehydratedNode } from '@rune-langium/codegen/rosetta';
import type { TypeGraphNode } from '../types.js';
import { type DirtyIndex, isSubtreeDirty } from './dirty-paths.js';

interface CstRange { offset: number; end: number }

function cstRange(node: unknown): CstRange | undefined {
  return (node as { $cstRange?: CstRange }).$cstRange;
}

export interface SerializeArgs {
  nodes: TypeGraphNode[];
  originalSource: string;
  dirty: DirtyIndex;
  /**
   * Node ids forced to regenerate regardless of patches — used when an edit
   * lives off the node's `data` subtree (e.g. an `extends` change carried on an
   * EDGE, not a `nodes` patch). See Task 6's inheritance handling.
   */
  forceDirtyNodeIds?: ReadonlySet<string>;
}

export function serializeNamespaceToSource(args: SerializeArgs): string {
  const { nodes, originalSource, dirty, forceDirtyNodeIds } = args;

  // Per-node recursive serializer (closes over originalSource + dirty + nodeId).
  function makeSerialize(nodeId: string) {
    const serialize = (child: DehydratedNode, dataPath: (string | number)[]): string => {
      const range = cstRange(child);
      const forced = dataPath.length === 0 && (forceDirtyNodeIds?.has(nodeId) ?? false);
      const subtreeDirty = forced || isSubtreeDirty(dirty, nodeId, dataPath);
      if (range && !subtreeDirty) {
        return originalSource.slice(range.offset, range.end); // clean → reuse
      }
      // Dirty or new → regenerate. emitChild recurses with extended dataPath.
      const emitChild: EmitChild = (c) => {
        const idx = childIndex(child, c, dataPath);
        return serialize(c, idx);
      };
      const generated = emitNode(child, emitChild);
      if (generated !== null) return generated;
      if (range) return originalSource.slice(range.offset, range.end); // unimplemented but had bytes
      throw new Error(
        `cannot serialize new node of unimplemented $type ${(child as { $type: string }).$type}`
      );
    };
    return serialize;
  }

  // Top-level elements that exist in the baseline (have a $cstRange), sorted by
  // source offset, drive the assembly. Gaps between them (header, comments,
  // non-graph elements like functions) are copied verbatim.
  const placed = nodes
    .map((n) => ({ n, range: cstRange(n.data) }))
    .filter((x): x is { n: TypeGraphNode; range: CstRange } => x.range !== undefined)
    .sort((a, b) => a.range.offset - b.range.offset);

  const parts: string[] = [];
  let cursor = 0;
  for (const { n, range } of placed) {
    if (range.offset > cursor) parts.push(originalSource.slice(cursor, range.offset));
    const serialize = makeSerialize(n.id);
    parts.push(serialize(n.data as unknown as DehydratedNode, []));
    cursor = range.end;
  }
  if (cursor < originalSource.length) parts.push(originalSource.slice(cursor));

  // New top-level nodes (no $cstRange) → append at the namespace tail.
  const fresh = nodes.filter((n) => cstRange(n.data) === undefined);
  if (fresh.length > 0) {
    let body = parts.join('');
    if (!body.endsWith('\n')) body += '\n';
    const additions = fresh.map((n) => {
      const serialize = makeSerialize(n.id);
      return serialize(n.data as unknown as DehydratedNode, []);
    });
    return body + '\n' + additions.join('\n\n') + '\n';
  }

  return parts.join('');
}

/**
 * Compute the dataPath segment for a child relative to its parent's dataPath.
 * The emit-core hands us the child object; we locate it among the parent's
 * known child arrays to build the patch-comparable path.
 */
function childIndex(
  parent: DehydratedNode,
  child: DehydratedNode,
  parentPath: (string | number)[]
): (string | number)[] {
  const p = parent as unknown as Record<string, unknown[]>;
  for (const key of CHILD_ARRAY_KEYS) {
    const arr = p[key];
    if (Array.isArray(arr)) {
      const i = arr.indexOf(child);
      if (i >= 0) return [...parentPath, key, i];
    }
  }
  // Child not found in a known array (should not happen for emitted children);
  // fall back to the parent path so the child inherits the parent's dirtiness.
  return parentPath;
}

const CHILD_ARRAY_KEYS = [
  'attributes', 'conditions', 'annotations', 'references',
  'synonyms', 'enumSynonyms', 'labels', 'ruleReferences', 'enumValues'
];
