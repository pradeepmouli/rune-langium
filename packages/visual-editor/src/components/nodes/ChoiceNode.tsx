/**
 * ChoiceNode — Custom ReactFlow node for Rune DSL `Choice` types.
 *
 * Displays choice name and its options (each referencing a type).
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { TypeNodeData } from '../../types.js';

export const ChoiceNode = memo(function ChoiceNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TypeNodeData;

  return (
    <div className={`rune-node rune-node-choice${selected ? ' rune-node-selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rune-node-header">
        <span className="rune-node-kind-badge">Choice</span>
        <span>{nodeData.name}</span>
      </div>
      <div className="rune-node-body">
        {nodeData.members.length > 0 && (
          <div className="rune-node-members">
            {nodeData.members.map((member) => (
              <div key={member.name} className="rune-node-member">
                <span className="rune-node-member-name">{member.typeName ?? member.name}</span>
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
