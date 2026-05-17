// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * EnumNode — Custom ReactFlow node for Rune DSL `RosettaEnumeration` types.
 *
 * Two rendering variants:
 *   - `variant === 'structure'`: structure-view context. Reads `data.values`
 *     (StructureEnumNode.values: ReadonlyArray<string>). Renders each value
 *     as a row. Enums are terminal — no expansion, no cells, no chevrons.
 *   - default (graph view): reads `data.enumValues` with summary count.
 */

import { memo } from 'react';
import { Handle } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { AnyGraphNode } from '../../types.js';
import type { StructureEnumNode } from '../../types/structure-view.js';
import { NodeKindBadge } from './NodeKindBadge.js';
import { getHandlePositions, useNavigation } from './NavigationContext.js';

// ---------------------------------------------------------------------------
// Structure-variant helpers (Phase 14e/A)
// ---------------------------------------------------------------------------

interface StructureEnumNodeData extends StructureEnumNode {
  readonly variant: 'structure';
}

function isStructureEnum(d: unknown): d is StructureEnumNodeData {
  return typeof d === 'object' && d !== null && (d as { variant?: unknown }).variant === 'structure';
}

export const EnumNode = memo(function EnumNode({ data, selected }: NodeProps) {
  const d = data as unknown as AnyGraphNode;
  const { layoutDirection } = useNavigation();
  const handles = getHandlePositions(layoutDirection);

  // -------------------------------------------------------------------------
  // Structure variant — reads data.values (ReadonlyArray<string>) emitted by
  // the adapter (StructureEnumNode). Enums are read-only and terminal: no
  // cells, no chevrons, just the value list for shape display.
  // -------------------------------------------------------------------------
  if (isStructureEnum(data)) {
    const values = data.values as ReadonlyArray<string>;
    return (
      <div className={`rune-node rune-node-enum rune-node-enum--structure${selected ? ' rune-node-selected' : ''}`}>
        <Handle type="target" position={handles.target} />
        <div className="rune-node-header">
          <NodeKindBadge kind="enum" />
          <span>{data.name}</span>
        </div>
        <div className="rune-node-rows">
          {values.map((value) => (
            <div key={value} className="rune-node-row" data-attr={value}>
              <span className="rune-cell-name">{value}</span>
            </div>
          ))}
        </div>
        <Handle type="source" position={handles.source} />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Default graph variant — reads data.enumValues (pre-existing behavior).
  // -------------------------------------------------------------------------
  const members = ((d as any).enumValues ?? []) as any[];
  const summary = members.length === 0 ? 'No values' : `${members.length} value${members.length === 1 ? '' : 's'}`;

  return (
    <div className={`rune-node rune-node-enum${selected ? ' rune-node-selected' : ''}`} data-summary={summary}>
      <Handle type="target" position={handles.target} />
      <div className="rune-node-header">
        <NodeKindBadge kind="enum" />
        <span>{d.name}</span>
      </div>
      <div className="rune-node-summary">{summary}</div>
      <div className="rune-node-body">
        {members.length > 0 && (
          <div className="rune-node-members">
            {members.map((member: any) => (
              <div key={member.name} className="rune-node-member">
                <span className="rune-node-member-name">{member.name}</span>
              </div>
            ))}
          </div>
        )}
        {(d as any).errors?.length > 0 && (
          <div className="rune-node-errors">
            {((d as any).errors as any[]).map((err: any, i: number) => (
              <div key={`${err.ruleId ?? 'err'}:${err.message}:${i}`}>{err.message}</div>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={handles.source} />
    </div>
  );
});
