// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * StructureView — assembles the Structure View by composing:
 *   - `buildStructureGraph`  (Phase 2 adapter)
 *   - `layoutStructureGraph` (Phase 3 layout)
 *   - React Flow for rendering the resulting nodes
 *
 * Renders an empty-state message when `focusedTypeId` or `adapterDoc` is absent.
 * Phase 8 will inject editable cell components via `cellComponents`; this phase
 * renders the read-only structure with React Flow's custom node renderers registered
 * in `nodes/index.ts` (DataNode, ChoiceNode, GroupContainerNode, StructureBase).
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

export interface StructureViewProps {
  /** Canonical node id of the type to focus (e.g. `'cdm.trade::Trade'`). */
  readonly focusedTypeId: string | undefined;
  /** In-memory document representation produced by the studio's store adapter. */
  readonly adapterDoc: AdapterDocument | undefined;
  /** Expansion state; when undefined the view renders all nodes collapsed. */
  readonly expansionMap?: ReadonlyMap<string, boolean>;
}

const EMPTY_EXPANSION_MAP: ReadonlyMap<string, boolean> = new Map();

interface StructureFlowInnerProps {
  readonly focusedTypeId: string;
  readonly adapterDoc: AdapterDocument;
  readonly expansionMap: ReadonlyMap<string, boolean>;
}

/**
 * Inner ReactFlow renderer — kept separate so the ReactFlowProvider wraps the
 * whole subtree without the empty-state check logic needing to know about it.
 */
function StructureFlowInner({ focusedTypeId, adapterDoc, expansionMap }: StructureFlowInnerProps): React.ReactElement {
  const { nodes, edges } = useMemo(() => {
    const input = buildStructureGraph(adapterDoc, {
      focusedTypeId,
      expansionMap
    });
    // layoutStructureGraph returns LayoutResult: { nodes: ReadonlyArray<Node>, edges: ReadonlyArray<Edge> }
    // where Node/Edge are from @xyflow/react. Spreading to mutable arrays satisfies ReactFlow's prop type.
    const result = layoutStructureGraph(input);
    return { nodes: result.nodes as Node[], edges: result.edges as Edge[] };
  }, [focusedTypeId, adapterDoc, expansionMap]);

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
 * Shows a read-only expanded structure graph for the focused type.  When
 * `focusedTypeId` or `adapterDoc` is missing an empty-state placeholder is
 * rendered instead.
 *
 * An unsupported-root state is shown when `focusedTypeId` resolves to a
 * non-Data node (Choice, Enum, Function) or no longer exists in `adapterDoc`.
 * This prevents a blank canvas when `buildStructureGraph` returns an empty
 * node map for anything other than a Data root (Finding 2, PR #182 Codex review).
 */
export function StructureView({ focusedTypeId, adapterDoc, expansionMap }: StructureViewProps): React.ReactElement {
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
      />
    </ReactFlowProvider>
  );
}
