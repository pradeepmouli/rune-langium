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
import type { StructureRow } from '../types/structure-view.js';

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
}

const EMPTY_EXPANSION_MAP: ReadonlyMap<string, boolean> = new Map();

interface StructureFlowInnerProps {
  readonly focusedTypeId: string;
  readonly adapterDoc: AdapterDocument;
  readonly expansionMap: ReadonlyMap<string, boolean>;
  readonly cellComponents?: StructureCellComponents;
}

/**
 * Inner ReactFlow renderer — kept separate so the ReactFlowProvider wraps the
 * whole subtree without the empty-state check logic needing to know about it.
 */
function StructureFlowInner({
  focusedTypeId,
  adapterDoc,
  expansionMap,
  cellComponents
}: StructureFlowInnerProps): React.ReactElement {
  const { nodes, edges } = useMemo(() => {
    const input = buildStructureGraph(adapterDoc, {
      focusedTypeId,
      expansionMap
    });
    // layoutStructureGraph returns LayoutResult: { nodes: ReadonlyArray<Node>, edges: ReadonlyArray<Edge> }
    // where Node/Edge are from @xyflow/react. Spreading to mutable arrays satisfies ReactFlow's prop type.
    const result = layoutStructureGraph(input);
    if (!cellComponents) {
      return { nodes: result.nodes as Node[], edges: result.edges as Edge[] };
    }
    // Inject cellComponents into the data payload of 'data'-typed nodes so that
    // DataNode's structure variant renders editable cells instead of plain spans.
    // 'choice' nodes (ChoiceNode structure variant) use StructureChoiceArm arms
    // which carry only typeName/typeKind — no attrName or cardinality — so they
    // don't participate in the name/type/card cellComponents contract.
    // 'groupContainer' nodes (GroupContainerNode) also have no cell-injection API.
    const injectedNodes = result.nodes.map((n) =>
      n.type === 'data' ? { ...n, data: { ...n.data, cellComponents } } : n
    );
    return { nodes: injectedNodes as Node[], edges: result.edges as Edge[] };
  }, [focusedTypeId, adapterDoc, expansionMap, cellComponents]);

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
 * An unsupported-root state is shown when `focusedTypeId` resolves to a
 * non-Data node (Choice, Enum, Function) or no longer exists in `adapterDoc`.
 * This prevents a blank canvas when `buildStructureGraph` returns an empty
 * node map for anything other than a Data root (Finding 2, PR #182 Codex review).
 */
export function StructureView({
  focusedTypeId,
  adapterDoc,
  expansionMap,
  cellComponents
}: StructureViewProps): React.ReactElement {
  if (!focusedTypeId || !adapterDoc) {
    return (
      <div data-testid="structure-empty-state">Select a type from the Namespace Explorer to view its structure.</div>
    );
  }

  // Detect unsupported root upfront — cheaper than building+laying out an empty
  // graph and gives a precise, user-friendly message instead of a blank canvas.
  const rootNode = adapterDoc.nodes.find((n) => n.id === focusedTypeId);
  if (!rootNode) {
    return (
      <div data-testid="structure-unsupported-root-state">
        The selected type is no longer available. Select a Data type from the Namespace Explorer.
      </div>
    );
  }
  if (rootNode.$type !== 'Data') {
    return (
      <div data-testid="structure-unsupported-root-state">
        Structure View shows the shape of Data types. Select a Data type from the Namespace Explorer.
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
      />
    </ReactFlowProvider>
  );
}
