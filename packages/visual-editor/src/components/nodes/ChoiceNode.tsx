// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ChoiceNode — Custom ReactFlow node for Rune DSL `Choice` types.
 *
 * Displays choice name and its options (each referencing a type).
 *
 * Two rendering variants:
 *   - `variant === 'structure'`: structure-view context, reads `data.options`
 *     (ReadonlyArray<StructureRow>) emitted by layoutStructureGraph. Mirrors
 *     how DataNode handles its structure variant (Phase 6 Finding 4).
 *   - default (graph view): reads `data.attributes`, renders navigable handles.
 */

import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { AnyGraphNode } from '../../types.js';
import type { StructureChoiceNode, StructureChoiceArm } from '../../types/structure-view.js';
import { getTypeRefText } from '../../adapters/model-helpers.js';
import { getHandlePositions, useNavigation, resolveTypeNodeId } from './NavigationContext.js';
import { NodeKindBadge } from './NodeKindBadge.js';

// ---------------------------------------------------------------------------
// Structure-variant helpers
// ---------------------------------------------------------------------------

interface StructureChoiceNodeData extends StructureChoiceNode {
  readonly variant: 'structure';
}

function isStructureChoice(d: unknown): d is StructureChoiceNodeData {
  return typeof d === 'object' && d !== null && (d as { variant?: unknown }).variant === 'structure';
}

export const ChoiceNode = memo(function ChoiceNode({ data, selected, id }: NodeProps) {
  const d = data as unknown as AnyGraphNode;
  const { onNavigateToType, allNodeIds, layoutDirection } = useNavigation();
  const handles = getHandlePositions(layoutDirection);

  // -------------------------------------------------------------------------
  // Structure variant — reads data.options (StructureChoiceArm[]) from the
  // adapter. Arms have only a typeName and typeKind — no attrName or
  // cardinality (a choice arm IS a type, not an attribute).
  // TODO(Phase 10) visual tightening: gradient/shadow/font polish.
  // -------------------------------------------------------------------------
  if (isStructureChoice(data)) {
    const options = data.options as ReadonlyArray<StructureChoiceArm>;
    return (
      <div className={`rune-node rune-node-choice rune-node-choice--structure${selected ? ' rune-node-selected' : ''}`}>
        <Handle type="target" position={handles.target} />
        <div className="rune-node-header">
          <NodeKindBadge kind="choice" />
          <span>{data.name}</span>
        </div>
        <div className="rune-node-rows">
          {options.map((arm: StructureChoiceArm) => (
            <div key={arm.typeName} className="rune-node-row" data-attr={arm.typeName}>
              <span className="rune-cell-type-chip">{arm.typeName || '?'}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={arm.typeName}
                className="rune-row-handle"
                data-testid={`choice-arm-handle-${arm.typeName}`}
              />
            </div>
          ))}
        </div>
        <Handle type="source" position={handles.source} />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Default graph variant — reads data.attributes (existing behavior).
  // -------------------------------------------------------------------------
  const members = ((d as any).attributes ?? []) as any[];
  const summary = members.length === 0 ? 'No options' : `${members.length} option${members.length === 1 ? '' : 's'}`;

  const handleTypeClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.preventDefault();
      onNavigateToType?.(nodeId);
    },
    [onNavigateToType]
  );

  return (
    <div className={`rune-node rune-node-choice${selected ? ' rune-node-selected' : ''}`} data-summary={summary}>
      <Handle type="target" position={handles.target} />
      <div className="rune-node-header">
        <NodeKindBadge kind="choice" />
        <span>{d.name}</span>
      </div>
      <div className="rune-node-summary">{summary}</div>
      <div className="rune-node-body">
        {members.length > 0 && (
          <div className="rune-node-members">
            {members.map((member: any, i: number) => {
              const typeName = getTypeRefText(member.typeCall);
              const displayName = typeName ?? member.name;
              const targetId = typeName ? resolveTypeNodeId(typeName, allNodeIds) : undefined;
              return (
                <div key={typeName ?? member.name ?? i} className="rune-node-member">
                  {targetId && onNavigateToType ? (
                    <button
                      type="button"
                      className="rune-node-member-name nodrag nopan"
                      data-navigable
                      onClick={(e) => handleTypeClick(e, targetId)}
                    >
                      {displayName}
                    </button>
                  ) : (
                    <span className="rune-node-member-name">{displayName}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {(d as any).errors?.length > 0 && (
          <div className="rune-node-errors">
            {((d as any).errors as any[]).map((err: any, i: number) => (
              <div key={i}>{err.message}</div>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={handles.source} />
    </div>
  );
});
