/**
 * DataNode — Custom ReactFlow node for Rune DSL `Data` types.
 *
 * Displays type name, attributes with types and cardinalities,
 * and visual indicators for inheritance and validation errors.
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { TypeNodeData } from '../../types.js';

export const DataNode = memo(function DataNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TypeNodeData;

  return (
    <div className={`rune-node rune-node-data${selected ? ' rune-node-selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rune-node-header">
        <span className="rune-node-kind-badge">Data</span>
        <span>{nodeData.name}</span>
      </div>
      <div className="rune-node-body">
        {nodeData.members.length > 0 && (
          <div className="rune-node-members">
            {nodeData.members.map((member) => (
              <div
                key={member.name}
                className={`rune-node-member${member.isOverride ? ' rune-node-member-override' : ''}`}
              >
                <span className="rune-node-member-name">{member.name}</span>
                {member.typeName && (
                  <span className="rune-node-member-type">{member.typeName}</span>
                )}
                {member.cardinality && (
                  <span className="rune-node-member-cardinality">{member.cardinality}</span>
                )}
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
