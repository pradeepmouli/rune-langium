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
import { getHandlePositions, useNavigation, resolveTypeNodeId } from './NavigationContext.js';
import { NodeKindBadge } from './NodeKindBadge.js';

export const DataNode = memo(function DataNode({ data, selected, id }: NodeProps) {
  const d = data as unknown as AnyGraphNode;
  const members = ((d as any).attributes ?? []) as any[];
  const { onNavigateToType, allNodeIds, layoutDirection } = useNavigation();
  const handles = getHandlePositions(layoutDirection);
  const summary =
    members.length === 0 ? 'No attributes' : `${members.length} attribute${members.length === 1 ? '' : 's'}`;

  const handleTypeClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.preventDefault();
      onNavigateToType?.(nodeId);
    },
    [onNavigateToType]
  );

  const variant = (data as any).variant as 'graph' | 'structure' | undefined;

  if (variant === 'structure') {
    // TODO(Phase 7): tighten cellComponents prop types once StructureView assembly is in place
    const cellComponents = (data as any).cellComponents as
      | { name?: React.FC<any>; type?: React.FC<any>; card?: React.FC<any> }
      | undefined;
    const NameCell = cellComponents?.name;
    const TypeCell = cellComponents?.type;
    const CardCell = cellComponents?.card;

    return (
      <div className={`rune-node rune-node-data rune-node-data--structure${selected ? ' rune-node-selected' : ''}`}>
        <Handle type="target" position={handles.target} />
        <div className="rune-node-header">
          <NodeKindBadge kind="data" />
          <span>{d.name}</span>
        </div>
        <div className="rune-node-body rune-node-body--two-col">
          <div className="rune-node-rows">
            {members.map((member: any) => (
              <div key={member.name} className="rune-node-row" data-attr={member.name}>
                {NameCell ? (
                  <NameCell value={member.name} nodeId={id} attrName={member.name} />
                ) : (
                  <span className="rune-cell-name">{member.name}</span>
                )}
                {TypeCell ? (
                  <TypeCell typeName={getTypeRefText(member.typeCall)} nodeId={id} attrName={member.name} />
                ) : (
                  <span className="rune-cell-type-chip">{getTypeRefText(member.typeCall)}</span>
                )}
                {CardCell ? (
                  <CardCell value={formatCardinality(member.card)} nodeId={id} attrName={member.name} />
                ) : (
                  <span className="rune-cell-card">{formatCardinality(member.card)}</span>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={member.name}
                  className="rune-row-handle"
                  data-testid={`row-handle-${member.name}`}
                />
              </div>
            ))}
          </div>
          <div className="rune-node-children-slot" data-testid="data-node-children" />
        </div>
        <Handle type="source" position={handles.source} />
      </div>
    );
  }

  return (
    <div className={`rune-node rune-node-data${selected ? ' rune-node-selected' : ''}`} data-summary={summary}>
      <Handle type="target" position={handles.target} />
      <div className="rune-node-header">
        <NodeKindBadge kind="data" />
        <span>{d.name}</span>
      </div>
      <div className="rune-node-summary">{summary}</div>
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
      <Handle type="source" position={handles.source} />
    </div>
  );
});
