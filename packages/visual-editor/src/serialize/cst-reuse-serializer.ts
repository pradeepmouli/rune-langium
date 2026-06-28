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
      // A reused slice that is a CHILD (dataPath.length > 0) gets re-composed by
      // the parent emitter, which re-applies the block's indent via `indentBlock`.
      // Normalize the slice to RELATIVE indentation first so the parent's pad
      // lands uniformly — otherwise continuation lines keep their ABSOLUTE source
      // indentation and get over-indented (+2 per edit) → byte drift. Top-level
      // elements (dataPath.length === 0) are placed verbatim and must stay
      // byte-identical, so they are never normalized.
      const isChild = dataPath.length > 0;
      if (range && !subtreeDirty) {
        return reuseSlice(originalSource, range, isChild); // clean → reuse
      }
      // Dirty or new → regenerate. emitChild recurses with extended dataPath.
      const emitChild: EmitChild = (c) => {
        const idx = childIndex(child, c, dataPath);
        return serialize(c, idx);
      };
      const generated = emitNode(child, emitChild);
      if (generated !== null) return generated;
      if (range) return reuseSlice(originalSource, range, isChild); // unimplemented but had bytes
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
 * Slice a clean/unimplemented subtree from the baseline source. A top-level
 * element is returned verbatim (byte-identical placement). A child slice is
 * normalized to RELATIVE indentation (see {@link normalizeReusedSlice}) so the
 * parent emitter's `indentBlock` re-applies the level uniformly.
 */
function reuseSlice(source: string, range: CstRange, isChild: boolean): string {
  const slice = source.slice(range.offset, range.end);
  return isChild ? normalizeReusedSlice(slice, source, range.offset) : slice;
}

/**
 * Strip the node's own source base-column indentation from every continuation
 * line of a reused CST slice, so the slice composes like freshly-emitted
 * RELATIVE text: line 0 sits at column 0 (the slice starts at the node's first
 * token), and continuation lines are indented relative to it. The parent
 * emitter then re-applies the block's indent uniformly via `indentBlock`.
 *
 * Without this, a reused multi-line child (e.g. a `condition` body) keeps its
 * ABSOLUTE source indentation on continuation lines; `indentBlock` adds the
 * parent level on top, over-indenting every continuation line by the parent pad
 * (+2) on each edit — valid but NOT byte-for-byte `.rosetta`.
 *
 * The base column is the leading whitespace of the baseline line that contains
 * `offset`. Single-line slices need no normalization.
 */
function normalizeReusedSlice(slice: string, source: string, offset: number): string {
  if (slice.indexOf('\n') === -1) return slice; // single line — nothing to re-indent
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  let baseCol = 0;
  while (lineStart + baseCol < source.length) {
    const ch = source[lineStart + baseCol];
    if (ch === ' ' || ch === '\t') baseCol++;
    else break;
  }
  if (baseCol === 0) return slice;
  const lines = slice.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    let strip = 0;
    while (strip < baseCol && (line[strip] === ' ' || line[strip] === '\t')) strip++;
    lines[i] = line.slice(strip);
  }
  return lines.join('\n');
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
