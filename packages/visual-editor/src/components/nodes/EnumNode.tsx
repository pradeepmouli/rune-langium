/**
 * EnumNode — Custom ReactFlow node for Rune DSL `RosettaEnumeration` types.
 *
 * Displays enum name and its values.
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { TypeNodeData } from '../../types.js';

export const EnumNode = memo(function EnumNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TypeNodeData;

  return (
    <div className={`rune-node rune-node-enum${selected ? ' rune-node-selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rune-node-header">
        <span className="rune-node-kind-badge">Enum</span>
        <span>{nodeData.name}</span>
      </div>
      <div className="rune-node-body">
        {nodeData.members.length > 0 && (
          <div className="rune-node-members">
            {nodeData.members.map((member) => (
              <div key={member.name} className="rune-node-member">
                <span className="rune-node-member-name">{member.name}</span>
              </div>
            ))}
          </div>
        )}
        {nodeData.errors.length > 0 && (
          <div className="rune-node-errors">
            {nodeData.errors.map((err, i) => (
              <div key={i}>{err.message}</div>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});
