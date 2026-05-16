// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Layout: StructureGraphInput → React Flow nodes/edges.
 *
 * Strategy: a node's body is a 2-column flow (rows left, expansions right);
 * expansions are React Flow children with `parentId` set, positioned in the
 * right-hand column. Layout is performed in two passes: (1) size every node
 * bottom-up from its row count and expansions; (2) walk top-down placing each
 * node so each expansion vertically aligns with its source row.
 *
 * Containment is rendered exclusively via React Flow `parentId` +
 * `extent: 'parent'` — no explicit `Edge` records are emitted in Phase 3. If a
 * future phase introduces non-containment edges (e.g., cross-tree handles
 * rendered as a separate edge type), revisit the returned `edges` array.
 *
 * See docs/superpowers/specs/2026-05-12-structure-view-design.md § 3.
 */

import type { Edge, Node } from '@xyflow/react';
import type {
  StructureBaseContainer,
  StructureChoiceNode,
  StructureDataNode,
  StructureGraphInput,
  StructureNode
} from '../types/structure-view.js';

/**
 * Single source of truth for Structure View layout constants.
 *
 * **If you change a value here, mirror it in the CSS custom properties
 * declared in `src/styles.css` (the `:root` block near the top of the
 * Structure View section).  The unit test
 * `test/layout/structure-css-ssot.test.ts` enforces parity and will
 * fail CI if the two drift apart.**
 */
export const STRUCTURE_LAYOUT_CONSTANTS = {
  ROW_HEIGHT: 28,
  HEADER_HEIGHT: 28,
  COL_WIDTH: 260,
  COL_GAP: 32,
  ROW_GAP: 8,
  /** Padding inside a base GroupContainer's yellow border. */
  BASE_PADDING: 16
} as const;

// Internal aliases — keep call sites inside this module readable.
const { ROW_HEIGHT, HEADER_HEIGHT, COL_WIDTH, COL_GAP, ROW_GAP, BASE_PADDING } = STRUCTURE_LAYOUT_CONSTANTS;

interface SizedNode {
  width: number;
  height: number;
  /** attrName → vertical center of the row inside the node body. */
  rowOffsets: Map<string, number>;
}

/**
 * Simulate `placeDataChildren` / `placeBaseChildren`'s placement walk to compute
 * the bottom of the right-hand column. The placement pass advances `yCursor` to
 * `max(rowTop, yCursor)` so a late-row expansion can land below the simple-sum
 * height; sizing must mirror that math, otherwise children render outside the
 * parent's extent (see review must-fix #6 / #7).
 */
function simulateColumnHeight(
  expansions: ReadonlyMap<string, string>,
  rowOffsets: ReadonlyMap<string, number>,
  input: StructureGraphInput,
  sizes: Map<string, SizedNode>,
  sizing: Set<string>,
  /** Initial yCursor — HEADER_HEIGHT for data nodes, BASE_PADDING+HEADER_HEIGHT
   *  for base containers (whose placement pass starts there to match CSS padding). */
  initialYCursor: number = HEADER_HEIGHT
): number {
  let yCursor = initialYCursor;
  for (const [attrName, childId] of expansions) {
    const child = input.nodes.get(childId);
    if (!child) continue;
    const childSize = sizeOf(child, sizes, input, sizing);
    if (!childSize) continue;
    const rowCenter = rowOffsets.get(attrName);
    const rowTop = rowCenter !== undefined ? rowCenter - ROW_HEIGHT / 2 : yCursor;
    const childY = Math.max(rowTop, yCursor);
    yCursor = childY + childSize.height + ROW_GAP;
  }
  // No trailing gap once the last child has been placed; clamp to HEADER_HEIGHT
  // so an empty expansions map still reserves a header strip.
  return Math.max(HEADER_HEIGHT, yCursor - ROW_GAP);
}

function sizeData(
  node: StructureDataNode,
  sizes: Map<string, SizedNode>,
  input: StructureGraphInput,
  sizing: Set<string>
): SizedNode {
  const rows = node.rows;
  const rowsHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT;

  const rowOffsets = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    rowOffsets.set(rows[i].attrName, HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2);
  }

  let childrenWidth = 0;
  for (const [, childId] of node.expansions) {
    const child = input.nodes.get(childId);
    if (!child) continue;
    const childSize = sizeOf(child, sizes, input, sizing);
    if (!childSize) continue;
    childrenWidth = Math.max(childrenWidth, childSize.width);
  }

  // Height of the right-hand expansions column matches what the placement pass
  // will actually produce (row-aligned + non-overlapping), not the naive sum.
  const childrenHeight =
    node.expansions.size > 0
      ? simulateColumnHeight(node.expansions, rowOffsets, input, sizes, sizing) - HEADER_HEIGHT
      : 0;

  const width = childrenWidth > 0 ? COL_WIDTH + COL_GAP + childrenWidth : COL_WIDTH;
  const height = Math.max(rowsHeight, childrenHeight + HEADER_HEIGHT);
  const sized: SizedNode = { width, height, rowOffsets };
  sizes.set(node.id, sized);
  return sized;
}

function sizeChoice(node: StructureChoiceNode, sizes: Map<string, SizedNode>): SizedNode {
  // StructureChoiceArm uses typeName as the row key (arms have no attrName —
  // their identity IS the referenced type).
  const rowOffsets = new Map<string, number>();
  for (let i = 0; i < node.options.length; i++) {
    rowOffsets.set(node.options[i].typeName, HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2);
  }
  const sized: SizedNode = {
    width: COL_WIDTH,
    height: HEADER_HEIGHT + node.options.length * ROW_HEIGHT,
    rowOffsets
  };
  sizes.set(node.id, sized);
  return sized;
}

function sizeBase(
  node: StructureBaseContainer,
  sizes: Map<string, SizedNode>,
  input: StructureGraphInput,
  sizing: Set<string>
): SizedNode {
  const child = input.nodes.get(node.childNodeId);
  const childSize = child
    ? (sizeOf(child, sizes, input, sizing) ?? { width: COL_WIDTH, height: HEADER_HEIGHT, rowOffsets: new Map() })
    : { width: COL_WIDTH, height: HEADER_HEIGHT, rowOffsets: new Map() };

  const baseRowsHeight = HEADER_HEIGHT + node.baseRows.length * ROW_HEIGHT;

  // Base containers can carry their own `expansions` (spec §3.2: containment
  // is uniform across inheritance and type-reference). Each expansion is
  // placed in the right-hand column aligned with the corresponding base row.
  //
  // Row centers must include BASE_PADDING (top) so expansion children placed
  // at rowOffsets.get(attrName) align with the visually-rendered rows — the
  // CSS applies `padding: 16px` (BASE_PADDING) inside .rune-graph-group--base,
  // pushing every rendered row down by that amount relative to the node origin.
  const rowOffsets = new Map<string, number>();
  for (let i = 0; i < node.baseRows.length; i++) {
    rowOffsets.set(node.baseRows[i].attrName, BASE_PADDING + HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2);
  }

  let expansionsWidth = 0;
  for (const [, expChildId] of node.expansions) {
    const expChild = input.nodes.get(expChildId);
    if (!expChild) continue;
    const expSize = sizeOf(expChild, sizes, input, sizing);
    if (!expSize) continue;
    expansionsWidth = Math.max(expansionsWidth, expSize.width);
  }

  // Mirror the placement pass: late-row expansions can extend below the simple
  // sum of child heights because each child is placed at max(rowTop, yCursor).
  // The simulation starts at BASE_PADDING + HEADER_HEIGHT to match the updated
  // placeBaseChildren yCursor (which was bumped to account for CSS top padding).
  // simulateColumnHeight returns the absolute y-bottom from the node origin, so
  // rightColumnHeight is that value directly — no further adjustment needed.
  const rightColumnHeight =
    node.expansions.size > 0
      ? simulateColumnHeight(node.expansions, rowOffsets, input, sizes, sizing, BASE_PADDING + HEADER_HEIGHT)
      : BASE_PADDING + HEADER_HEIGHT;

  // The base container wraps:
  //  - the base rows (top section, inside top padding)
  //  - the derived child below the base rows (+ ROW_GAP separator)
  //  - expansions positioned in a right-hand column next to the base rows
  // leftColumnHeight is the content height from the node origin (before adding
  // BASE_PADDING bottom). The +BASE_PADDING accounts for the gap between the
  // last base row and the derived child, mirroring placeBaseChildren's
  // y: HEADER_HEIGHT + baseRows.length*ROW_HEIGHT + BASE_PADDING for the child.
  const leftColumnHeight = baseRowsHeight + childSize.height + BASE_PADDING;
  const innerHeight = Math.max(leftColumnHeight, rightColumnHeight);
  const innerWidth =
    expansionsWidth > 0
      ? Math.max(COL_WIDTH, childSize.width) + COL_GAP + expansionsWidth
      : Math.max(COL_WIDTH, childSize.width);

  const sized: SizedNode = {
    width: innerWidth + BASE_PADDING * 2,
    height: innerHeight + BASE_PADDING * 2,
    rowOffsets
  };
  sizes.set(node.id, sized);
  return sized;
}

function sizeOf(
  node: StructureNode,
  sizes: Map<string, SizedNode>,
  input: StructureGraphInput,
  sizing: Set<string>
): SizedNode | undefined {
  const cached = sizes.get(node.id);
  if (cached) return cached;
  // Cycle protection: if we re-enter the same node while still sizing it,
  // return a stable placeholder AND cache it so the placement pass can emit
  // the node consistently with the sized body. Phase 2's adapter can emit
  // cyclic expansion maps (self-references / mutual references) when the
  // user expands across recursive structures.
  //
  // Caching is load-bearing: the parent's `childrenHeight`/`expansionsHeight`
  // math already includes this placeholder's height, so the placement pass
  // must find the same SizedNode under `sizes.get(node.id)` — otherwise we
  // reserve space for a child that never gets placed.
  if (sizing.has(node.id)) {
    const placeholder: SizedNode = { width: COL_WIDTH, height: HEADER_HEIGHT, rowOffsets: new Map() };
    sizes.set(node.id, placeholder);
    return placeholder;
  }
  sizing.add(node.id);
  try {
    if (node.kind === 'data') return sizeData(node, sizes, input, sizing);
    if (node.kind === 'choice') return sizeChoice(node, sizes);
    return sizeBase(node, sizes, input, sizing);
  } finally {
    sizing.delete(node.id);
  }
}

export interface LayoutResult {
  readonly nodes: ReadonlyArray<Node>;
  readonly edges: ReadonlyArray<Edge>;
}

/**
 * Compose a per-edge instance id used as the React Flow node id when an
 * expansion target is reachable from multiple owner rows.
 *
 * Phase 13 / Finding 2 (spec 020): the previous implementation deduped on
 * canonical node id (first-encounter-wins), which silently dropped the second
 * and subsequent placements when a schema had `buyer: Party` AND
 * `seller: Party` both expanded. The dropped row reserved its vertical slot
 * but rendered nothing — a blank gap in the column.
 *
 * Real schemas (CDM, FpML) routinely reference the same type from multiple
 * rows. Per the spec's row-level expansion contract each expanded row should
 * visibly drill into its own copy of the target. We satisfy this by giving
 * each placement a unique instance id (`ownerInstanceId::attrName::targetId`)
 * while the `data` payload still references the shared canonical node.
 *
 * The owner side uses the SAME instance id when nesting deeper: this keeps
 * grandchild ids stable per ancestor path (`A::a::B::x::C` vs `A::b::B::x::C`)
 * so React Flow's parentId chain remains a tree.
 */
function makeInstanceId(parentInstanceId: string, attrName: string, targetCanonicalId: string): string {
  return `${parentInstanceId}::${attrName}::${targetCanonicalId}`;
}

/**
 * Convert a `StructureGraphInput` into React Flow nodes for the Structure View.
 *
 * Containment is encoded via `parentId` + `extent: 'parent'`. Two-pass layout:
 * size every node first (bottom-up), then place top-down so expansions align
 * with their source row.
 *
 * Instance ids for duplicate references (Phase 13 / Finding 2): when an owner
 * has multiple expansions pointing to the same canonical target, each
 * placement gets a unique React Flow node id of the form
 * `parentInstanceId::attrName::canonicalTargetId`. The root carries its
 * canonical id verbatim; instance ids extend only when an expansion needs
 * disambiguation downstream. The `data` payload still references the shared
 * `StructureNode`, so cell rendering and downstream consumers see the same
 * underlying type — only the React Flow node identity differs.
 *
 * Cycle protection: a recursion `path: Set<canonicalId>` carries the chain of
 * ancestors. If an expansion target is already in `path`, placement is
 * skipped (yCursor still advances) — this prevents infinite recursion when
 * the graph has self-references / mutual references. Sibling references
 * (target NOT on the current path but already placed elsewhere) DO get a new
 * instance, satisfying the row-level expansion contract.
 */
export function layoutStructureGraph(input: StructureGraphInput): LayoutResult {
  const sizes = new Map<string, SizedNode>();
  const sizing = new Set<string>();
  const root = input.nodes.get(input.rootNodeId);
  if (!root) return { nodes: [], edges: [] };

  sizeOf(root, sizes, input, sizing);

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  /**
   * Place a node at the given position.
   *
   * @param instanceId        React Flow id (per-edge instance, may differ from canonical).
   * @param canonicalId       Lookup key in `input.nodes` and `sizes`.
   * @param parentInstanceId  React Flow parent id (undefined at the root).
   * @param position          Position relative to parent (or canvas for root).
   * @param ancestors         Canonical ids of recursion ancestors; used for cycle guard.
   */
  function placeNode(
    instanceId: string,
    canonicalId: string,
    parentInstanceId: string | undefined,
    position: { x: number; y: number },
    ancestors: ReadonlySet<string>
  ): void {
    const n = input.nodes.get(canonicalId);
    if (!n) return;
    const sz = sizes.get(canonicalId);
    if (!sz) return;

    // Base containers emit a Structure-specific node type `'structureBase'`
    // so they do not collide with the existing `'groupContainer'` renderer
    // (which expects `GroupContainerData = { label, nodeCount, scope, ... }`
    // — incompatible with the `StructureBaseContainer` payload we attach).
    nodes.push({
      id: instanceId,
      type: n.kind === 'base' ? 'structureBase' : n.kind,
      position,
      data: { ...n, variant: 'structure' },
      parentId: parentInstanceId,
      extent: parentInstanceId ? 'parent' : undefined,
      width: sz.width,
      height: sz.height
    } as Node);

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(canonicalId);

    // Invariant: StructureChoiceNode is terminal in Phase 1's type (it has
    // `options` rows but no `expansions` field), so the recursion only fans
    // out for 'data' and 'base'. A switch on `n.kind` keeps this exhaustive —
    // if a future phase adds children to Choice, the missing case here will
    // fail the exhaustiveness check below rather than silently dropping them.
    switch (n.kind) {
      case 'data':
        placeDataChildren(n, instanceId, sz, nextAncestors);
        break;
      case 'base':
        placeBaseChildren(n, instanceId, sz, nextAncestors);
        break;
      case 'choice':
        // StructureChoiceNode is terminal — no expansions per type; nothing
        // to recurse. Explicit no-op locks the invariant at the call site.
        break;
      default: {
        const _exhaustive: never = n;
        void _exhaustive;
      }
    }
  }

  function placeDataChildren(
    n: StructureDataNode,
    parentInstanceId: string,
    sz: SizedNode,
    ancestors: ReadonlySet<string>
  ): void {
    // yCursor tracks the running bottom of the children column. Each child is
    // placed at max(rowOffsetY, yCursor) so it aligns with its source row when
    // possible, but never overlaps the previous sibling.
    let yCursor = HEADER_HEIGHT;
    for (const [attrName, childCanonicalId] of n.expansions) {
      const childSize = sizes.get(childCanonicalId);
      if (!childSize) continue;

      const rowCenter = sz.rowOffsets.get(attrName);
      const rowTop = rowCenter !== undefined ? rowCenter - ROW_HEIGHT / 2 : yCursor;
      const childY = Math.max(rowTop, yCursor);

      // Cycle guard: skip placement when the target is already on the
      // recursion path (would infinitely recurse). yCursor still advances so
      // the row's reserved slot stays consistent with the sizing pass.
      if (!ancestors.has(childCanonicalId)) {
        const childInstanceId = makeInstanceId(parentInstanceId, attrName, childCanonicalId);
        placeNode(
          childInstanceId,
          childCanonicalId,
          parentInstanceId,
          { x: COL_WIDTH + COL_GAP, y: childY },
          ancestors
        );
      }

      yCursor = childY + childSize.height + ROW_GAP;
    }
  }

  function placeBaseChildren(
    n: StructureBaseContainer,
    parentInstanceId: string,
    sz: SizedNode,
    ancestors: ReadonlySet<string>
  ): void {
    // 1. The derived child sits inside the yellow border below the base rows.
    //    The derived child is structurally singular per StructureBaseContainer
    //    (one childNodeId), so it does not need per-edge disambiguation; its
    //    instance id uses the attrName-equivalent slot `__derived` to keep it
    //    distinct from any expansion that might point at the same canonical id.
    if (!ancestors.has(n.childNodeId)) {
      const derivedInstanceId = makeInstanceId(parentInstanceId, '__derived', n.childNodeId);
      placeNode(
        derivedInstanceId,
        n.childNodeId,
        parentInstanceId,
        {
          x: BASE_PADDING,
          y: HEADER_HEIGHT + n.baseRows.length * ROW_HEIGHT + BASE_PADDING
        },
        ancestors
      );
    }

    // 2. The base container's own expansions (inherited complex rows the user
    //    expanded) sit in the right-hand column aligned with their base rows.
    const leftColumnWidth = sizes.get(n.childNodeId)?.width ?? COL_WIDTH;
    const rightColumnX = BASE_PADDING + Math.max(COL_WIDTH, leftColumnWidth) + COL_GAP;

    let yCursor = BASE_PADDING + HEADER_HEIGHT;
    for (const [attrName, childCanonicalId] of n.expansions) {
      const childSize = sizes.get(childCanonicalId);
      if (!childSize) continue;

      const rowCenter = sz.rowOffsets.get(attrName);
      const rowTop = rowCenter !== undefined ? rowCenter - ROW_HEIGHT / 2 : yCursor;
      const childY = Math.max(rowTop, yCursor);

      if (!ancestors.has(childCanonicalId)) {
        const childInstanceId = makeInstanceId(parentInstanceId, attrName, childCanonicalId);
        placeNode(childInstanceId, childCanonicalId, parentInstanceId, { x: rightColumnX, y: childY }, ancestors);
      }

      yCursor = childY + childSize.height + ROW_GAP;
    }
  }

  // Root uses its canonical id as its instance id; nested placements extend
  // from there. This preserves the contract that the root React Flow node id
  // === canonical id, which callers and existing tests rely on.
  placeNode(input.rootNodeId, input.rootNodeId, undefined, { x: 0, y: 0 }, new Set());
  return { nodes, edges };
}
