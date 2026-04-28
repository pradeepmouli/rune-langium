// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * DataNode — Custom ReactFlow node for Rune DSL `Data` types.
 *
 * Displays type name, attributes with types and cardinalities,
 * and visual indicators for inheritance and validation errors.
 */

import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { AnyGraphNode } from '../../types.js';
import { getTypeRefText, formatCardinality } from '../../adapters/model-helpers.js';
import { useNavigation, resolveTypeNodeId } from './NavigationContext.js';
import { NodeKindBadge } from './NodeKindBadge.js';

export const DataNode = memo(function DataNode({ data, selected }: NodeProps) {
  const d = data as unknown as AnyGraphNode;
  const members = ((d as any).attributes ?? []) as any[];
  const { onNavigateToType, allNodeIds } = useNavigation();

  const handleTypeClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.preventDefault();
      onNavigateToType?.(nodeId);
    },
    [onNavigateToType]
  );

  return (
    <div className={`rune-node rune-node-data${selected ? ' rune-node-selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rune-node-header">
        <NodeKindBadge kind="data" />
        <span>{d.name}</span>
      </div>
      <div className="rune-node-body">
        {members.length > 0 && (
          <div className="rune-node-members">
            {members.map((member: any) => {
              const typeName = getTypeRefText(member.typeCall);
              const card = formatCardinality(member.card);
              const targetId = typeName ? resolveTypeNodeId(typeName, allNodeIds) : undefined;
              return (
                <div
                  key={member.name}
                  className={`rune-node-member${member.override ? ' rune-node-member-override' : ''}`}
                >
                  <span className="rune-node-member-name">{member.name}</span>
                  {typeName &&
                    (targetId && onNavigateToType ? (
                      <button
                        type="button"
                        className="rune-node-member-type nodrag nopan"
                        data-navigable
                        onClick={(e) => handleTypeClick(e, targetId)}
                      >
                        {typeName}
                      </button>
                    ) : (
                      <span className="rune-node-member-type">{typeName}</span>
                    ))}
                  {card && <span className="rune-node-member-cardinality">{card}</span>}
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
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});
