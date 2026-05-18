// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * StructureView — assembles the Structure View by composing:
 *   - `buildStructureGraph`  (Phase 2 adapter)
 *   - `layoutStructureGraph` (Phase 3 layout)
 *   - React Flow for rendering the resulting nodes
 *
 * Renders an empty-state message when `focusedTypeId` or `adapterDoc` is absent.
 * Accepts an optional `cellComponents` prop (Phase 5/8) that is injected into the
 * data payload of `'data'`-typed nodes returned by layoutStructureGraph so that
 * DataNode's structure variant renders editable cells instead of plain spans.
 * Choice nodes (arms are type references, not attribute rows) and GroupContainerNode
 * (base-type wrap) do not participate in the cellComponents contract.
 *
 * @module
 */

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { AdapterDocument } from '../adapters/structure-graph-adapter.js';
import { buildStructureGraph } from '../adapters/structure-graph-adapter.js';
import { layoutStructureGraph } from '../layout/structure-layout.js';
import { nodeTypes } from './nodes/index.js';
import type { StructureExpansionKey, StructureRow } from '../types/structure-view.js';

/**
 * Compare two arrays element-wise. Falls back to a per-element equality
 * function (defaults to `Object.is`) — used for `rows` arrays where the
 * adapter emits fresh `StructureRow` arrays per pass but the individual
 * rows are simple records that should be compared structurally.
 */
function arraysEqual<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>, eq: (x: T, y: T) => boolean = Object.is): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!eq(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Shallow equality of two records (string-keyed). Used for individual
 * `StructureRow` / `StructureChoiceArm` objects whose fields are MOSTLY
 * primitive but include one known nested object: `astRange: { start, end }`.
 *
 * The adapter rebuilds `astRange` per pass with fresh `{ start, end }` objects
 * even when the parsed values are unchanged, so an `Object.is` walk would
 * treat every row as "changed" and trigger the all-visible-node rerender
 * fan-out the Phase 14c fix is supposed to prevent. `astRange` is compared
 * structurally (start === start && end === end); everything else stays
 * `Object.is` (strict primitive equality).
 *
 * If a future row field adds another nested object, extend this comparator
 * the same way `node.data` is extended above.
 */
function shallowRecordEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const av = ao[k];
    const bv = bo[k];
    if (Object.is(av, bv)) continue;
    if (k === 'astRange') {
      // `{ start, end }` — adapter rebuilds the object per pass; compare by value.
      if (!av || !bv || typeof av !== 'object' || typeof bv !== 'object') return false;
      const ar = av as { start?: unknown; end?: unknown };
      const br = bv as { start?: unknown; end?: unknown };
      if (!Object.is(ar.start, br.start) || !Object.is(ar.end, br.end)) return false;
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Compare two `ReadonlyMap<string, string>` instances by content. Used
 * for the `expansions` map on `StructureDataNode`/`StructureChoiceNode`/
 * `StructureBaseContainer` which is rebuilt each adapter pass even when
 * content is unchanged.
 */
function mapEqual(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false;
  }
  return true;
}

/**
 * Structural equality for a Structure View `node.data` payload. Walks the
 * shape the adapter+layout produce (StructureDataNode | StructureChoiceNode |
 * StructureBaseContainer | StructureEnumNode plus the layout's wrappers:
 * `variant: 'structure'`, `instancePath: readonly string[]`, and the
 * StructureFlowInner-injected `cellComponents`, `expansionMap`, and
 * `onToggleExpansion`).
 *
 * Returns `true` when content is unchanged so the caller can preserve the
 * previous node reference. React Flow shallow-compares `node.data` for its
 * memo cache, so reference preservation lets the per-node memo skip
 * re-rendering unchanged DataNode/ChoiceNode/GroupContainerNode instances.
 *
 * Trade-off: this comparator is bespoke for the StructureView node shape.
 * It does NOT generalize to arbitrary `unknown` payloads. If a future
 * adapter adds a field to StructureNode (e.g. a new nested object), the
 * comparator falls through to `Object.is` for that field and the worst
 * case is more frequent identity changes (correctness preserved; perf
 * benefit regresses). Adding a field to the equality walk here is the
 * targeted follow-up when that happens.
 */
function shallowEqualData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const av = ao[k];
    const bv = bo[k];
    if (Object.is(av, bv)) continue;
    // Special-case the known-nested fields the adapter+layout rebuild per
    // pass. Everything else falls through to Object.is (strict identity).
    if (k === 'rows' || k === 'baseRows' || k === 'options') {
      if (!Array.isArray(av) || !Array.isArray(bv)) return false;
      if (!arraysEqual(av, bv, shallowRecordEqual)) return false;
      continue;
    }
    if (k === 'values') {
      // Enum value names: array of strings.
      if (!Array.isArray(av) || !Array.isArray(bv)) return false;
      if (!arraysEqual(av, bv, Object.is)) return false;
      continue;
    }
    if (k === 'expansions') {
      if (!(av instanceof Map) || !(bv instanceof Map)) return false;
      if (!mapEqual(av as ReadonlyMap<string, string>, bv as ReadonlyMap<string, string>)) return false;
      continue;
    }
    if (k === 'instancePath') {
      // Array of React Flow instance ids (strings).
      if (!Array.isArray(av) || !Array.isArray(bv)) return false;
      if (!arraysEqual(av, bv, Object.is)) return false;
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Identity-preserving merge of a fresh layout result into the previous
 * one (Phase 14c, Approach B). For each new node, if a previous node with
 * the same `id` exists AND its `data` payload is shallow-equal to the new
 * one, return the previous node object reference. Otherwise return the
 * new node as-is.
 *
 * React Flow shallow-compares `node.data` per node for memoization
 * decisions, so preserving the previous `data` reference where content
 * is unchanged stops the cascade where every keystroke re-renders every
 * visible DataNode.
 *
 * O(n) using a Map index over the previous nodes (no quadratic scan).
 */
function preserveNodeIdentities(prev: ReadonlyArray<Node>, next: ReadonlyArray<Node>): Node[] {
  if (prev.length === 0) return next as Node[];
  const prevById = new Map<string, Node>();
  for (const n of prev) prevById.set(n.id, n);
  return next.map((n) => {
    const p = prevById.get(n.id);
    if (!p) return n;
    // Compare top-level fields React Flow inspects for re-render decisions.
    // Position changes legitimately mean layout moved; preserve identity
    // only when position + parent + extent + size + data all match.
    if (
      p.position.x !== n.position.x ||
      p.position.y !== n.position.y ||
      p.parentId !== n.parentId ||
      p.extent !== n.extent ||
      p.type !== n.type ||
      (p as { initialWidth?: number }).initialWidth !== (n as { initialWidth?: number }).initialWidth ||
      (p as { initialHeight?: number }).initialHeight !== (n as { initialHeight?: number }).initialHeight
    ) {
      return n;
    }
    return shallowEqualData(p.data, n.data) ? p : n;
  });
}

/** Shape injected into DataNode's structure-variant `data.cellComponents`. */
export interface StructureCellComponents {
  readonly name?: React.ComponentType<{ value: string; nodeId: string; attrName: string }>;
  readonly type?: React.ComponentType<{
    typeName: string;
    typeKind: StructureRow['typeKind'];
    nodeId: string;
    attrName: string;
  }>;
  readonly card?: React.ComponentType<{ value: string; nodeId: string; attrName: string }>;
}

export interface StructureViewProps {
  /** Canonical node id of the type to focus (e.g. `'cdm.trade::Trade'`). */
  readonly focusedTypeId: string | undefined;
  /** In-memory document representation produced by the studio's store adapter. */
  readonly adapterDoc: AdapterDocument | undefined;
  /** Expansion state; when undefined the view renders all nodes collapsed. */
  readonly expansionMap?: ReadonlyMap<string, boolean>;
  /**
   * Editable cell components for the structure variant of DataNode (Phase 5/8).
   * When provided, `name`, `type`, and `card` slots replace the read-only spans
   * in each attribute row. Memoize the object at the call site to avoid
   * prop-identity churn on every render.
   */
  readonly cellComponents?: StructureCellComponents;
  /**
   * Row-level expand/collapse handler (spec 020 Phase 13, Finding 1). When
   * provided, each Data/Choice-typed row in the rendered DataNode shows an
   * expansion chevron that calls this with the row's StructureExpansionKey.
   * Wire this to `useStructureViewStore.toggleExpansion` in the studio so
   * the click flips the relevant entry in `expansionMap`.
   */
  readonly onToggleExpansion?: (key: StructureExpansionKey) => void;
  /**
   * When `focusedTypeId` is undefined because the user selected a type whose
   * kind isn't supported in Structure View (Function / TypeAlias / Record /
   * Annotation), pass the selected type's name and kind here so the empty
   * state can render actionable guidance instead of the generic prompt
   * (e2e-batch fix #10). When the user has selected nothing or a supported
   * kind, leave this undefined.
   */
  readonly unsupportedSelectedType?: { name: string; kind: string };
  /**
   * Selection sync (e2e-batch fix #3): fired when the user clicks any node in
   * the rendered Structure tree. Receives the canonical type id (e.g.
   * `'cdm.trade::Trade'`) — NOT the per-instance React Flow node id, so the
   * receiver can write straight to a single `selectedNodeId` slice that the
   * Graph / Source / Inspector also read from. EditorPage wires this to
   * `useEditorStore.selectNode`.
   */
  readonly onNodeSelect?: (canonicalTypeId: string) => void;
}

const EMPTY_EXPANSION_MAP: ReadonlyMap<string, boolean> = new Map();

interface StructureFlowInnerProps {
  readonly focusedTypeId: string;
  readonly adapterDoc: AdapterDocument;
  readonly expansionMap: ReadonlyMap<string, boolean>;
  readonly cellComponents?: StructureCellComponents;
  readonly onToggleExpansion?: (key: StructureExpansionKey) => void;
  readonly onNodeSelect?: (canonicalTypeId: string) => void;
}

/**
 * Inner ReactFlow renderer — kept separate so the ReactFlowProvider wraps the
 * whole subtree without the empty-state check logic needing to know about it.
 */
function StructureFlowInner({
  focusedTypeId,
  adapterDoc,
  expansionMap,
  cellComponents,
  onToggleExpansion,
  onNodeSelect
}: StructureFlowInnerProps): React.ReactElement {
  // Phase 14c (Approach B): keep the previous useMemo result so we can
  // identity-preserve unchanged nodes across re-renders. React Flow shallow-
  // compares `node.data` per node for memoization; producing fresh object
  // identities every layout pass — which is what the adapter+layout+injection
  // stack does — busts that memo cache for every visible node, even when
  // the underlying content is unchanged. Preserving the previous node
  // reference where the data shallow-equals the new one limits the
  // re-render fan-out to the actually-changed nodes.
  const prevNodesRef = useRef<ReadonlyArray<Node>>([]);
  const { nodes, edges } = useMemo(() => {
    const input = buildStructureGraph(adapterDoc, {
      focusedTypeId,
      expansionMap
    });
    // layoutStructureGraph returns LayoutResult: { nodes: ReadonlyArray<Node>, edges: ReadonlyArray<Edge> }
    // where Node/Edge are from @xyflow/react. Spreading to mutable arrays satisfies ReactFlow's prop type.
    const result = layoutStructureGraph(input);
    // Inject cellComponents AND row-expansion plumbing into the data payload of
    // 'data'-typed nodes so that DataNode's structure variant renders editable
    // cells and the per-row expand/collapse chevron (Finding 1).
    //
    // Phase 14e/B: 'choice' nodes now ALSO receive cellComponents +
    // expansionMap + onToggleExpansion. ChoiceNode's structure variant renders
    // a TypePickerCell per arm (drop target so the arm's type can be retyped)
    // AND an expansion chevron for arms whose target is Data or Choice. Arms
    // targeting terminal kinds (Enum / Builtin / Unresolved) render a spacer
    // for visual alignment but no chevron — there's no subtree to drill into.
    //
    // 'structureBase' nodes (GroupContainerNode base-type branch) also receive
    // expansionMap + onToggleExpansion so inherited Data/Choice rows can be
    // expanded/collapsed (Codex P2, PR #191). cellComponents is NOT injected —
    // base rows are read-only inherited rows; editable cells on base rows would
    // be a separate scope decision (spec §5 does not include inline-editing of
    // inherited attributes in Phase 13).
    const needsInjection = cellComponents !== undefined || onToggleExpansion !== undefined;
    const freshNodes: Node[] = needsInjection
      ? (result.nodes.map((n) => {
          if (n.type === 'data') return { ...n, data: { ...n.data, cellComponents, expansionMap, onToggleExpansion } };
          if (n.type === 'choice')
            return { ...n, data: { ...n.data, cellComponents, expansionMap, onToggleExpansion } };
          if (n.type === 'structureBase') return { ...n, data: { ...n.data, expansionMap, onToggleExpansion } };
          return n;
        }) as Node[])
      : (result.nodes as Node[]);

    // Reuse previous node references where the new node's data is shallow-
    // equal to the previous one. This lets React Flow's per-node memo skip
    // re-rendering the unchanged DataNode/ChoiceNode/GroupContainerNode
    // instances even though the upstream layout produced a fresh array.
    //
    // NOTE: this useMemo READS prevNodesRef but does NOT write it. The write
    // happens in useLayoutEffect below — committing the cache only AFTER
    // React has committed the render. Mutating the ref inside useMemo would
    // be unsafe under concurrent rendering / StrictMode: an abandoned
    // render's "stable" output would poison the cache for the next attempt.
    const stableNodes = preserveNodeIdentities(prevNodesRef.current, freshNodes);
    return { nodes: stableNodes, edges: result.edges as Edge[] };
  }, [focusedTypeId, adapterDoc, expansionMap, cellComponents, onToggleExpansion]);

  // Commit the identity-preserving cache only after the render reaches
  // commit phase. Abandoned/discarded renders (StrictMode double-invoke,
  // concurrent priority preemption) never touch the cache.
  useLayoutEffect(() => {
    prevNodesRef.current = nodes;
  }, [nodes]);

  return (
    <div data-testid="structure-view-flow" style={{ width: '100%', height: '100%', minHeight: 320 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        // e2e-batch fix #3: selection sync — clicking any node in the
        // Structure tree writes the OWNER type's canonical id to the shared
        // selection slice. We extract `node.data.id` (the canonical type id
        // stamped by the adapter, e.g. `cdm.trade::Trade`) rather than the
        // React Flow `node.id` (which carries the per-instance suffix like
        // `Trade::buyer::Party` and would not match the explorer / inspector
        // selection contract). Falls back to `node.id` when `data.id` is
        // missing so the click still produces a write.
        onNodeClick={(_, node) => {
          const canonicalId = (node.data as { id?: string } | undefined)?.id ?? node.id;
          onNodeSelect?.(canonicalId);
        }}
      />
    </div>
  );
}

/**
 * StructureView component.
 *
 * Shows the expanded structure graph for the focused type, with optional
 * editable cell components injected via `cellComponents`.  When
 * `focusedTypeId` or `adapterDoc` is missing an empty-state placeholder is
 * rendered instead.
 *
 * Stale-selection state is shown when `focusedTypeId` no longer resolves to
 * any node in `adapterDoc` (e.g. the type was renamed or deleted). Phase 14e/A
 * extends root rendering to Data, Choice, and Enum — only an unknown id falls
 * through to the unsupported-root branch.
 */
export function StructureView({
  focusedTypeId,
  adapterDoc,
  expansionMap,
  cellComponents,
  onToggleExpansion,
  unsupportedSelectedType,
  onNodeSelect
}: StructureViewProps): React.ReactElement {
  if (!focusedTypeId || !adapterDoc) {
    // e2e-batch fix (#10): distinguish "nothing selected" from "selected an
    // unsupported kind (Function / TypeAlias / Record / Annotation)" so the
    // user gets actionable guidance instead of the generic "Select a type"
    // prompt that doesn't explain why their click didn't open anything.
    if (unsupportedSelectedType) {
      return (
        <div data-testid="structure-unsupported-kind-state">
          <p>
            <strong>{unsupportedSelectedType.name}</strong> is a{' '}
            <code>{unsupportedSelectedType.kind ?? 'non-structural'}</code> type and is not supported in Structure View.
          </p>
          <p>Pick a Data, Choice, or Enum type from the Namespace Explorer to see its structure.</p>
        </div>
      );
    }
    return (
      <div data-testid="structure-empty-state">Select a type from the Namespace Explorer to view its structure.</div>
    );
  }

  // Detect stale selections upfront — cheaper than building+laying out an empty
  // graph and gives a precise, user-friendly message instead of a blank canvas.
  // Phase 14e/A: Data, Choice, and Enum roots all render; only an unknown id
  // (deleted/renamed type) reaches the unsupported branch.
  const rootNode = adapterDoc.nodes.find((n) => n.id === focusedTypeId);
  if (!rootNode) {
    return (
      <div data-testid="structure-unsupported-root-state">
        The selected type is no longer available. Select a type from the Namespace Explorer.
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <StructureFlowInner
        focusedTypeId={focusedTypeId}
        adapterDoc={adapterDoc}
        expansionMap={expansionMap ?? EMPTY_EXPANSION_MAP}
        cellComponents={cellComponents}
        onToggleExpansion={onToggleExpansion}
        onNodeSelect={onNodeSelect}
      />
    </ReactFlowProvider>
  );
}
