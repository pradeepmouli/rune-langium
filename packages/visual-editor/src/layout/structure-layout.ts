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
  StructureEnumNode,
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
 * Phase 14e — per-instance StructureNode keying. With the adapter emitting one
 * StructureNode per visible occurrence (`input.nodes` keyed by instance id),
 * each node already represents a unique placement context. Size cache and
 * cycle protection key on instance id directly — no path-aware composite key
 * needed (each instance is its own entry by construction).
 *
 * Kept as a tiny helper for symmetry with the placement pass and to avoid
 * scattering raw `node.instanceId` reads through size lookups.
 */
function makeSizeCacheKey(instanceId: string): string {
  return instanceId;
}

/**
 * Read a node's effective instance id, falling back to canonical id for tests
 * (and other call sites) that construct StructureGraphInput by hand without
 * setting `instanceId`. The adapter always sets `instanceId`; this fallback
 * preserves test ergonomics so unit tests pinning layout geometry don't need
 * to spell out the instance-id discriminator on every fixture.
 */
function nodeInstanceId(node: StructureNode): string {
  return node.instanceId ?? node.id;
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
  for (const [attrName, childInstanceId] of expansions) {
    const child = input.nodes.get(childInstanceId);
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

/**
 * Compute the SizedNode for a Data node by recursing into per-instance
 * expansion children.
 */
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
  for (const [, childInstanceId] of node.expansions) {
    const child = input.nodes.get(childInstanceId);
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
  return { width, height, rowOffsets };
}

function sizeChoice(
  node: StructureChoiceNode,
  sizes: Map<string, SizedNode>,
  input: StructureGraphInput,
  sizing: Set<string>
): SizedNode {
  // StructureChoiceArm uses typeName as the row key (arms have no attrName —
  // their identity IS the referenced type).
  const rowOffsets = new Map<string, number>();
  for (let i = 0; i < node.options.length; i++) {
    rowOffsets.set(node.options[i].typeName, HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2);
  }
  const rowsHeight = HEADER_HEIGHT + node.options.length * ROW_HEIGHT;

  // Phase 14e/B — Choice arms gained expansion. Mirror sizeData: walk the
  // arm expansions, take the widest child, and simulate column height so
  // late-arm expansions get the room they need.
  //
  // Test-fixture fallback: pre-Phase-14e layout fixtures construct Choice nodes
  // by hand without `expansions`. Treat absent as an empty map so legacy
  // fixtures keep working without churn (same approach as `nodeInstanceId`).
  const expansions = node.expansions ?? EMPTY_EXPANSIONS;
  let childrenWidth = 0;
  for (const [, childInstanceId] of expansions) {
    const child = input.nodes.get(childInstanceId);
    if (!child) continue;
    const childSize = sizeOf(child, sizes, input, sizing);
    if (!childSize) continue;
    childrenWidth = Math.max(childrenWidth, childSize.width);
  }

  const childrenHeight =
    expansions.size > 0 ? simulateColumnHeight(expansions, rowOffsets, input, sizes, sizing) - HEADER_HEIGHT : 0;

  const width = childrenWidth > 0 ? COL_WIDTH + COL_GAP + childrenWidth : COL_WIDTH;
  const height = Math.max(rowsHeight, childrenHeight + HEADER_HEIGHT);
  return { width, height, rowOffsets };
}

const EMPTY_EXPANSIONS: ReadonlyMap<string, string> = new Map();

/**
 * Size a read-only Enum node (Phase 14e/A). Mirrors `sizeChoice` for the
 * value-only case (no expansions). Each value renders as a row at ROW_HEIGHT.
 */
function sizeEnum(node: StructureEnumNode): SizedNode {
  const rowOffsets = new Map<string, number>();
  for (let i = 0; i < node.values.length; i++) {
    rowOffsets.set(node.values[i], HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2);
  }
  return {
    width: COL_WIDTH,
    height: HEADER_HEIGHT + node.values.length * ROW_HEIGHT,
    rowOffsets
  };
}

/**
 * Compute the SizedNode for a Base container, recursing into the derived inner
 * child and any per-instance row-level expansions.
 */
function sizeBase(
  node: StructureBaseContainer,
  sizes: Map<string, SizedNode>,
  input: StructureGraphInput,
  sizing: Set<string>
): SizedNode {
  const child = input.nodes.get(node.childNodeId);
  const childSize = child
    ? (sizeOf(child, sizes, input, sizing) ?? {
        width: COL_WIDTH,
        height: HEADER_HEIGHT,
        rowOffsets: new Map()
      })
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
  for (const [, expChildInstanceId] of node.expansions) {
    const expChild = input.nodes.get(expChildInstanceId);
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

  return {
    width: innerWidth + BASE_PADDING * 2,
    height: innerHeight + BASE_PADDING * 2,
    rowOffsets
  };
}

/**
 * Compute (and cache) the size of `node` keyed by its per-instance id.
 *
 * **Cache key:** `node.instanceId` (set by the adapter; for the root this
 * equals the canonical id). The adapter emits one StructureNode per visible
 * occurrence, so each instance is unique by construction — no path-aware
 * composite key needed.
 *
 * **Cycle protection:** `sizing: Set<string>` tracks instance ids currently on
 * the stack. Re-entrant sizing of the same instance id (only possible for
 * malformed inputs where an `expansions` value points back at an ancestor
 * instance id) returns a stable placeholder so the layout doesn't stack-
 * overflow. Well-formed adapter output never re-enters the same instance id.
 */
function sizeOf(
  node: StructureNode,
  sizes: Map<string, SizedNode>,
  input: StructureGraphInput,
  sizing: Set<string>
): SizedNode | undefined {
  const instanceId = nodeInstanceId(node);
  const cacheKey = makeSizeCacheKey(instanceId);
  const cached = sizes.get(cacheKey);
  if (cached) return cached;
  if (sizing.has(instanceId)) {
    const placeholder: SizedNode = { width: COL_WIDTH, height: HEADER_HEIGHT, rowOffsets: new Map() };
    sizes.set(cacheKey, placeholder);
    return placeholder;
  }
  sizing.add(instanceId);
  try {
    let sized: SizedNode;
    if (node.kind === 'data') sized = sizeData(node, sizes, input, sizing);
    else if (node.kind === 'choice') sized = sizeChoice(node, sizes, input, sizing);
    else if (node.kind === 'enum') sized = sizeEnum(node);
    else sized = sizeBase(node, sizes, input, sizing);
    sizes.set(cacheKey, sized);
    return sized;
  } finally {
    sizing.delete(instanceId);
  }
}

export interface LayoutResult {
  readonly nodes: ReadonlyArray<Node>;
  readonly edges: ReadonlyArray<Edge>;
}

// Phase 14e: the adapter now emits per-instance StructureNodes with instance
// ids pre-computed (see `adapterChildInstanceId` in structure-graph-adapter.ts).
// The layout consumes those ids directly — no per-edge id construction here.
// The format matches: `${parentInstanceId}::${attrName}::${targetCanonicalId}`.

/**
 * Convert a `StructureGraphInput` into React Flow nodes for the Structure View.
 *
 * Phase 14e — per-instance materialization. The adapter emits one StructureNode
 * per visible occurrence with pre-computed instance ids; the layout consumes
 * those ids directly:
 *   - `input.nodes` is keyed by instance id (`StructureNode.instanceId`).
 *   - `expansions.values()` are CHILD instance ids — direct lookup keys.
 *   - `StructureBaseContainer.childNodeId` is the inner derived child's
 *     instance id.
 *
 * The React Flow node id == `node.instanceId`; the `data` payload still
 * carries the canonical `.id` so cell renderers and AST-binding consumers
 * see one entry per shared type description.
 *
 * Two-pass layout: size every node first (bottom-up, cycle-guarded), then
 * place top-down so expansion children align with their source row.
 *
 * Cycle protection at placement uses a `Set<instanceId>` of ancestors; well-
 * formed adapter output never re-enters the same instance id (the adapter
 * silently drops cyclic edges in per-instance materialization), but malformed
 * inputs still terminate safely via the guard.
 */
export function layoutStructureGraph(input: StructureGraphInput): LayoutResult {
  const sizes = new Map<string, SizedNode>();
  const sizing = new Set<string>();
  const root = input.nodes.get(input.rootNodeId);
  if (!root) return { nodes: [], edges: [] };

  sizeOf(root, sizes, input, sizing);

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function placeNode(
    instanceId: string,
    parentInstanceId: string | undefined,
    position: { x: number; y: number },
    ancestors: ReadonlySet<string>,
    instanceAncestorPath: readonly string[]
  ): void {
    const n = input.nodes.get(instanceId);
    if (!n) return;
    const sz = sizes.get(makeSizeCacheKey(instanceId));
    if (!sz) return;

    // Dimensions are emitted via THREE channels so all React Flow consumers see
    // a consistent size:
    //  - `style.width/height` — CSS render hint (drives the actual DOM size
    //    before React Flow's auto-measure pass)
    //  - `initialWidth/initialHeight` — RF12-specific initial-only fields read
    //    by `getNodesBounds`, static `fitView`, and other pre-mount dimension
    //    helpers (per RF12 migration docs — top-level `width/height` are now
    //    output-only, populated by RF on measure)
    // After mount, RF populates `node.measured` from the rendered DOM; if CSS
    // drifts from the layout's pre-computed sz, measured wins for parent-extent
    // clamping etc., but initial helpers still get the right answer pre-measure.
    nodes.push({
      id: instanceId,
      type: n.kind === 'base' ? 'structureBase' : n.kind,
      position,
      data: { ...n, variant: 'structure', instancePath: instanceAncestorPath },
      parentId: parentInstanceId,
      extent: parentInstanceId ? 'parent' : undefined,
      initialWidth: sz.width,
      initialHeight: sz.height,
      style: { width: sz.width, height: sz.height }
    } as Node);

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(instanceId);
    const childInstanceAncestorPath = [...instanceAncestorPath, instanceId];

    switch (n.kind) {
      case 'data':
        placeDataChildren(n, sz, nextAncestors, childInstanceAncestorPath);
        break;
      case 'base':
        placeBaseChildren(n, sz, nextAncestors, childInstanceAncestorPath);
        break;
      case 'choice':
        placeChoiceChildren(n, sz, nextAncestors, childInstanceAncestorPath);
        break;
      case 'enum':
        // Phase 14e/A — Enum nodes are terminal; their value list renders
        // as plain rows, no children to place.
        break;
      default: {
        const _exhaustive: never = n;
        void _exhaustive;
      }
    }
  }

  function placeDataChildren(
    n: StructureDataNode,
    sz: SizedNode,
    ancestors: ReadonlySet<string>,
    instanceAncestorPath: readonly string[]
  ): void {
    let yCursor = HEADER_HEIGHT;
    for (const [attrName, childInstanceId] of n.expansions) {
      const childSize = sizes.get(makeSizeCacheKey(childInstanceId));
      if (!childSize) continue;

      const rowCenter = sz.rowOffsets.get(attrName);
      const rowTop = rowCenter !== undefined ? rowCenter - ROW_HEIGHT / 2 : yCursor;
      const childY = Math.max(rowTop, yCursor);

      // Cycle guard: skip placement when the target instance is already on the
      // recursion path (only possible for malformed input — the adapter's
      // SuppressedEdge mechanism prevents this for well-formed graphs).
      if (!ancestors.has(childInstanceId)) {
        placeNode(
          childInstanceId,
          nodeInstanceId(n),
          { x: COL_WIDTH + COL_GAP, y: childY },
          ancestors,
          instanceAncestorPath
        );
      }

      yCursor = childY + childSize.height + ROW_GAP;
    }
  }

  /**
   * Phase 14e/B — Choice arm expansion placement. Mirrors `placeDataChildren`
   * but iterates `node.expansions` keyed by arm typeName (since arms have no
   * attrName). The arm's row center comes from sizeChoice's rowOffsets which
   * also key by typeName, so alignment works the same way.
   */
  function placeChoiceChildren(
    n: StructureChoiceNode,
    sz: SizedNode,
    ancestors: ReadonlySet<string>,
    instanceAncestorPath: readonly string[]
  ): void {
    // Same defensive default as sizeChoice — legacy test fixtures may omit
    // the `expansions` map; treat as empty rather than crashing.
    const expansions = n.expansions ?? EMPTY_EXPANSIONS;
    let yCursor = HEADER_HEIGHT;
    for (const [armTypeName, childInstanceId] of expansions) {
      const childSize = sizes.get(makeSizeCacheKey(childInstanceId));
      if (!childSize) continue;

      const rowCenter = sz.rowOffsets.get(armTypeName);
      const rowTop = rowCenter !== undefined ? rowCenter - ROW_HEIGHT / 2 : yCursor;
      const childY = Math.max(rowTop, yCursor);

      if (!ancestors.has(childInstanceId)) {
        placeNode(
          childInstanceId,
          nodeInstanceId(n),
          { x: COL_WIDTH + COL_GAP, y: childY },
          ancestors,
          instanceAncestorPath
        );
      }

      yCursor = childY + childSize.height + ROW_GAP;
    }
  }

  function placeBaseChildren(
    n: StructureBaseContainer,
    sz: SizedNode,
    ancestors: ReadonlySet<string>,
    instanceAncestorPath: readonly string[]
  ): void {
    // 1. The derived child sits inside the yellow border below the base rows.
    //    `n.childNodeId` is the child's per-instance id (set by the adapter —
    //    `adapterDerivedInstanceId`). For test fixtures constructed without
    //    per-instance ids, this is the canonical id, which is also the key
    //    in `input.nodes` (since `nodeInstanceId` falls back to `id`).
    if (!ancestors.has(n.childNodeId)) {
      placeNode(
        n.childNodeId,
        nodeInstanceId(n),
        {
          x: BASE_PADDING,
          y: HEADER_HEIGHT + n.baseRows.length * ROW_HEIGHT + BASE_PADDING
        },
        ancestors,
        instanceAncestorPath
      );
    }

    // 2. Base container's own row-level expansions (inherited rows the user
    //    expanded) sit in the right-hand column aligned with their base rows.
    const derivedChildSize = sizes.get(makeSizeCacheKey(n.childNodeId));
    const leftColumnWidth = derivedChildSize?.width ?? COL_WIDTH;
    const rightColumnX = BASE_PADDING + Math.max(COL_WIDTH, leftColumnWidth) + COL_GAP;

    let yCursor = BASE_PADDING + HEADER_HEIGHT;
    for (const [attrName, childInstanceId] of n.expansions) {
      const childSize = sizes.get(makeSizeCacheKey(childInstanceId));
      if (!childSize) continue;

      const rowCenter = sz.rowOffsets.get(attrName);
      const rowTop = rowCenter !== undefined ? rowCenter - ROW_HEIGHT / 2 : yCursor;
      const childY = Math.max(rowTop, yCursor);

      if (!ancestors.has(childInstanceId)) {
        placeNode(childInstanceId, nodeInstanceId(n), { x: rightColumnX, y: childY }, ancestors, instanceAncestorPath);
      }

      yCursor = childY + childSize.height + ROW_GAP;
    }
  }

  // Root: its rfId is its own instance id (which equals the canonical id of
  // the outermost wrapper). instanceAncestorPath = [] preserves the root's
  // `data.instancePath = []` contract for back-compat with legacy expansion keys.
  placeNode(input.rootNodeId, undefined, { x: 0, y: 0 }, new Set(), []);
  return { nodes, edges };
}
