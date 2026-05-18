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

import React, { useMemo } from 'react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { AdapterDocument } from '../adapters/structure-graph-adapter.js';
import { buildStructureGraph } from '../adapters/structure-graph-adapter.js';
import { layoutStructureGraph } from '../layout/structure-layout.js';
import { nodeTypes } from './nodes/index.js';
import type { StructureExpansionKey, StructureRow } from '../types/structure-view.js';

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
}

const EMPTY_EXPANSION_MAP: ReadonlyMap<string, boolean> = new Map();

interface StructureFlowInnerProps {
  readonly focusedTypeId: string;
  readonly adapterDoc: AdapterDocument;
  readonly expansionMap: ReadonlyMap<string, boolean>;
  readonly cellComponents?: StructureCellComponents;
  readonly onToggleExpansion?: (key: StructureExpansionKey) => void;
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
  onToggleExpansion
}: StructureFlowInnerProps): React.ReactElement {
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
    if (!needsInjection) {
      return { nodes: result.nodes as Node[], edges: result.edges as Edge[] };
    }
    const injectedNodes = result.nodes.map((n) => {
      if (n.type === 'data') return { ...n, data: { ...n.data, cellComponents, expansionMap, onToggleExpansion } };
      if (n.type === 'choice') return { ...n, data: { ...n.data, cellComponents, expansionMap, onToggleExpansion } };
      if (n.type === 'structureBase') return { ...n, data: { ...n.data, expansionMap, onToggleExpansion } };
      return n;
    });
    return { nodes: injectedNodes as Node[], edges: result.edges as Edge[] };
  }, [focusedTypeId, adapterDoc, expansionMap, cellComponents, onToggleExpansion]);

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
  onToggleExpansion
}: StructureViewProps): React.ReactElement {
  if (!focusedTypeId || !adapterDoc) {
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
      />
    </ReactFlowProvider>
  );
}
