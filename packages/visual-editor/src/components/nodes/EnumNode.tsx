// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * EnumNode — Custom ReactFlow node for Rune DSL `RosettaEnumeration` types.
 *
 * Displays enum name and its values.
 */

import { memo } from 'react';
import { Handle } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { AnyGraphNode } from '../../types.js';
import { NodeKindBadge } from './NodeKindBadge.js';
import { getHandlePositions, useNavigation } from './NavigationContext.js';

export const EnumNode = memo(function EnumNode({ data, selected }: NodeProps) {
  const d = data as unknown as AnyGraphNode;
  const members = ((d as any).enumValues ?? []) as any[];
  const { layoutDirection } = useNavigation();
  const handles = getHandlePositions(layoutDirection);
  const summary =
    members.length === 0
      ? 'No values'
      : `${members.length} value${members.length === 1 ? '' : 's'}`;

  return (
    <div
      className={`rune-node rune-node-enum${selected ? ' rune-node-selected' : ''}`}
      data-summary={summary}
    >
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
              <div key={i}>{err.message}</div>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={handles.source} />
    </div>
  );
});
