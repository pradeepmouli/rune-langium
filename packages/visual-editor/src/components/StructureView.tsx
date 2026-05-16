// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * StructureView — assembles the Structure View by composing:
 *   - `buildStructureGraph`  (Phase 2 adapter)
 *   - `layoutStructureGraph` (Phase 3 layout)
 *   - React Flow for rendering the resulting nodes
 *
 * Renders an empty-state message when `focusedTypeId` or `document` is absent.
 * Phase 8 will inject editable cell components via `cellComponents`; this phase
 * renders the read-only structure with React Flow's default node renderers.
 *
 * @module
 */

import React, { useMemo } from 'react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { AdapterDocument } from '../adapters/structure-graph-adapter.js';
import { buildStructureGraph } from '../adapters/structure-graph-adapter.js';
import { layoutStructureGraph } from '../layout/structure-layout.js';

export interface StructureViewProps {
  /** Canonical node id of the type to focus (e.g. `'cdm.trade::Trade'`). */
  readonly focusedTypeId: string | undefined;
  /** In-memory document representation produced by the studio's store adapter. */
  readonly document: AdapterDocument | undefined;
  /** Expansion state; when undefined the view renders all nodes collapsed. */
  readonly expansionMap?: ReadonlyMap<string, boolean>;
}

const EMPTY_EXPANSION_MAP: ReadonlyMap<string, boolean> = new Map();

interface StructureFlowInnerProps {
  readonly focusedTypeId: string;
  readonly document: AdapterDocument;
  readonly expansionMap: ReadonlyMap<string, boolean>;
}

/**
 * Inner ReactFlow renderer — kept separate so the ReactFlowProvider wraps the
 * whole subtree without the empty-state check logic needing to know about it.
 */
function StructureFlowInner({ focusedTypeId, document, expansionMap }: StructureFlowInnerProps): React.ReactElement {
  const { nodes, edges } = useMemo(() => {
    const input = buildStructureGraph(document, {
      focusedTypeId,
      expansionMap
    });
    return layoutStructureGraph(input);
  }, [focusedTypeId, document, expansionMap]);

  return (
    <div data-testid="structure-view-flow" style={{ width: '100%', height: '100%', minHeight: 320 }}>
      <ReactFlow
        nodes={nodes as import('@xyflow/react').Node[]}
        edges={edges as import('@xyflow/react').Edge[]}
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
 * `focusedTypeId` or `document` is missing an empty-state placeholder is
 * rendered instead.
 */
export function StructureView({ focusedTypeId, document, expansionMap }: StructureViewProps): React.ReactElement {
  if (!focusedTypeId || !document) {
    return (
      <div data-testid="structure-empty-state">Select a type from the Namespace Explorer to view its structure.</div>
    );
  }

  return (
    <ReactFlowProvider>
      <StructureFlowInner
        focusedTypeId={focusedTypeId}
        document={document}
        expansionMap={expansionMap ?? EMPTY_EXPANSION_MAP}
      />
    </ReactFlowProvider>
  );
}
