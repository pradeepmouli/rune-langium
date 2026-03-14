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
import type { AnyGraphNode } from '../../types.js';
import {
  AST_TYPE_TO_NODE_TYPE,
  getTypeRefText,
  formatCardinality,
  getRefText
} from '../../adapters/model-helpers.js';

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
  const d = data as unknown as AnyGraphNode;
  const kind = AST_TYPE_TO_NODE_TYPE[d.$type] ?? 'data';
  const kindLabel = KIND_LABELS[kind] ?? kind;
  const kindCss = KIND_CSS[kind] ?? '';
  const parentName = getRefText((d as any).superType);
  const members = ((d as any).attributes ?? (d as any).features ?? []) as any[];

  return (
    <div className={`rune-node ${kindCss}${selected ? ' rune-node-selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rune-node-header">
        <span className="rune-node-kind-badge">{kindLabel}</span>
        <span>{d.name}</span>
      </div>
      <div className="rune-node-body">
        {parentName && (
          <div className="rune-node-parent">
            <span className="rune-node-parent-label">→ </span>
            <span>{parentName}</span>
          </div>
        )}
        {members.length > 0 && (
          <div className="rune-node-members">
            {members.map((member: any) => {
              const typeName = getTypeRefText(member.typeCall);
              const card = formatCardinality(member.card);
              return (
                <div
                  key={member.name}
                  className={`rune-node-member${member.override ? ' rune-node-member-override' : ''}`}
                >
                  <span className="rune-node-member-name">{member.name}</span>
                  {typeName && <span className="rune-node-member-type">{typeName}</span>}
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
