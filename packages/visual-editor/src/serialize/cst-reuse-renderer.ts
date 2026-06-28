// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CST-reuse `.rosetta` renderer (option B).
 *
 * Per node: if its subtree is clean (has a $cstRange and no pendingEditPatch at
 * or under it), slice the original bytes; else regenerate via the render-core,
 * recursing into children (each child reuses if clean). Untouched content is
 * never re-rendered. Replaces serializeModel + mergeSerializedIntoSource.
 */

import { renderNode, type RenderChild, type DehydratedNode } from '@rune-langium/codegen/rosetta';
import type { TypeGraphNode } from '../types.js';
import { type DirtyIndex, isSubtreeDirty } from './dirty-paths.js';

interface CstRange { offset: number; end: number }

function cstRange(node: unknown): CstRange | undefined {
  return (node as { $cstRange?: CstRange }).$cstRange;
}

export interface RenderArgs {
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

export function renderNamespace(args: RenderArgs): string {
  const { nodes, originalSource, dirty, forceDirtyNodeIds } = args;

  // Per-node recursive renderer (closes over originalSource + dirty + nodeId).
  function makeRender(nodeId: string) {
    const render = (child: DehydratedNode, dataPath: (string | number)[]): string => {
      const range = cstRange(child);
      const forced = dataPath.length === 0 && (forceDirtyNodeIds?.has(nodeId) ?? false);
      const subtreeDirty = forced || isSubtreeDirty(dirty, nodeId, dataPath);
      // A reused slice that is a CHILD (dataPath.length > 0) gets re-composed by
      // the parent renderer, which re-applies the block's indent via `indentBlock`.
      // Normalize the slice to RELATIVE indentation first so the parent's pad
      // lands uniformly — otherwise continuation lines keep their ABSOLUTE source
      // indentation and get over-indented (+2 per edit) → byte drift. Top-level
      // elements (dataPath.length === 0) are placed verbatim and must stay
      // byte-identical, so they are never normalized.
      const isChild = dataPath.length > 0;
      if (range && !subtreeDirty) {
        return reuseSlice(originalSource, range, isChild); // clean → reuse
      }
      // Dirty or new → regenerate. renderChild recurses with extended dataPath.
      const renderChild: RenderChild = (c) => {
        const idx = childIndex(child, c, dataPath);
        return render(c, idx);
      };
      const generated = renderNode(child, renderChild);
      if (generated !== null) return generated;
      if (range) return reuseSlice(originalSource, range, isChild); // unimplemented but had bytes
      // Brand-new node of an unimplemented $type — no bytes to slice and no
      // renderer to regenerate it. Degrade gracefully: return '' so this node is
      // absent from the output rather than crashing the source-sync effect.
      console.warn(
        `[cst-reuse] skipping new node of unimplemented $type "${(child as { $type: string }).$type}" — renderNode returned null and no $cstRange`
      );
      return '';
    };
    return render;
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
    const render = makeRender(n.id);
    parts.push(render(n.data as unknown as DehydratedNode, []));
    cursor = range.end;
  }
  if (cursor < originalSource.length) parts.push(originalSource.slice(cursor));

  // New top-level nodes (no $cstRange) → append at the namespace tail.
  // Filter out empty strings: a fresh node whose $type is unimplemented returns
  // '' from the render closure (graceful skip) and must not appear in output.
  const fresh = nodes.filter((n) => cstRange(n.data) === undefined);
  if (fresh.length > 0) {
    let body = parts.join('');
    if (!body.endsWith('\n')) body += '\n';
    const additions = fresh
      .map((n) => {
        const render = makeRender(n.id);
        return render(n.data as unknown as DehydratedNode, []);
      })
      .filter((s) => s !== '');
    if (additions.length > 0) {
      return body + '\n' + additions.join('\n\n') + '\n';
    }
    return body;
  }

  return parts.join('');
}

/**
 * Slice a clean/unimplemented subtree from the baseline source. A top-level
 * element is returned verbatim (byte-identical placement). A child slice is
 * normalized to RELATIVE indentation (see {@link normalizeReusedSlice}) so the
 * parent renderer's `indentBlock` re-applies the level uniformly.
 */
function reuseSlice(source: string, range: CstRange, isChild: boolean): string {
  const slice = source.slice(range.offset, range.end);
  return isChild ? normalizeReusedSlice(slice, source, range.offset) : slice;
}

/**
 * Strip the node's own source base-column indentation from every continuation
 * line of a reused CST slice, so the slice composes like freshly-rendered
 * RELATIVE text: line 0 sits at column 0 (the slice starts at the node's first
 * token), and continuation lines are indented relative to it. The parent
 * renderer then re-applies the block's indent uniformly via `indentBlock`.
 *
 * Without this, a reused multi-line child (e.g. a `condition` body) keeps its
 * ABSOLUTE source indentation on continuation lines; `indentBlock` adds the
 * parent level on top, over-indenting every continuation line by the parent pad
 * (+2) on each edit — valid but NOT byte-for-byte `.rosetta`.
 *
 * The base column is the leading whitespace of the baseline line that contains
 * `offset`. Single-line slices need no normalization.
 *
 * NOTE — 2-space indent assumption: this function strips the base-column indent
 * based on the ACTUAL leading whitespace of the containing source line, not a
 * fixed constant. However, render-core's `indentBlock` always pads with 2 spaces
 * per level, matching the Rosetta convention. If the original source used a
 * different indent width (e.g. 4 spaces), the stripped slice is re-indented at
 * 2 spaces per level on regeneration — strictly better than the prior
 * accumulating +2 drift, and acceptable for the Rosetta style convention.
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
 * The render-core hands us the child object; we locate it among the parent's
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
  // Child not found in a known array (should not happen for rendered children);
  // fall back to the parent path so the child inherits the parent's dirtiness.
  return parentPath;
}

const CHILD_ARRAY_KEYS = [
  'attributes', 'conditions', 'annotations', 'references',
  'synonyms', 'enumSynonyms', 'labels', 'ruleReferences', 'enumValues',
  'inputs', 'operations', 'shortcuts', 'postConditions', 'parameters'
];
