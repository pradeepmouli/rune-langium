// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ChoiceNode — Custom ReactFlow node for Rune DSL `Choice` types.
 *
 * Displays choice name and its options (each referencing a type).
 */

import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { AnyGraphNode } from '../../types.js';
import { getTypeRefText } from '../../adapters/model-helpers.js';
import { useNavigation, resolveTypeNodeId } from './NavigationContext.js';

export const ChoiceNode = memo(function ChoiceNode({ data, selected }: NodeProps) {
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
    <div className={`rune-node rune-node-choice${selected ? ' rune-node-selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rune-node-header">
        <span className="rune-node-kind-badge">Choice</span>
        <span>{d.name}</span>
      </div>
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
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});
