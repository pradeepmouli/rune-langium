/**
 * GenericNode — Custom ReactFlow node for secondary Rune DSL constructs.
 *
 * Shared component for record, typeAlias, basicType, and annotation nodes.
 * Displays type name, kind badge, members (if any), parent reference,
 * and validation errors.
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { TypeNodeData } from '../../types.js';

const KIND_LABELS: Record<string, string> = {
  record: 'Record',
  typeAlias: 'Alias',
  basicType: 'Basic',
  annotation: 'Annotation'
};

const KIND_CSS: Record<string, string> = {
  record: 'rune-node-record',
  typeAlias: 'rune-node-typealias',
  basicType: 'rune-node-basictype',
  annotation: 'rune-node-annotation'
};

export const GenericNode = memo(function GenericNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TypeNodeData;
  const kindLabel = KIND_LABELS[nodeData.kind] ?? nodeData.kind;
  const kindCss = KIND_CSS[nodeData.kind] ?? '';

  return (
    <div className={`rune-node ${kindCss}${selected ? ' rune-node-selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rune-node-header">
        <span className="rune-node-kind-badge">{kindLabel}</span>
        <span>{nodeData.name}</span>
      </div>
      <div className="rune-node-body">
        {nodeData.parentName && (
          <div className="rune-node-parent">
            <span className="rune-node-parent-label">→ </span>
            <span>{nodeData.parentName}</span>
          </div>
        )}
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
