// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * GenericNode — Custom ReactFlow node for secondary Rune DSL constructs.
 *
 * Shared component for record, typeAlias, basicType, and annotation nodes.
 * Displays type name, kind badge, members (if any), parent reference,
 * and validation errors.
 */

import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { AnyGraphNode, TypeKind } from '../../types.js';
import {
  AST_TYPE_TO_NODE_TYPE,
  getTypeRefText,
  formatCardinality,
  getRefText
} from '../../adapters/model-helpers.js';
import { useNavigation, resolveTypeNodeId } from './NavigationContext.js';
import { NodeKindBadge } from './NodeKindBadge.js';

const KIND_CSS: Record<string, string> = {
  func: 'rune-node-func',
  record: 'rune-node-record',
  typeAlias: 'rune-node-typealias',
  basicType: 'rune-node-basictype',
  annotation: 'rune-node-annotation'
};

export const GenericNode = memo(function GenericNode({ data, selected }: NodeProps) {
  const d = data as unknown as AnyGraphNode;
  const kind = (AST_TYPE_TO_NODE_TYPE[d.$type] ?? 'data') as TypeKind;
  const kindCss = KIND_CSS[kind] ?? '';
  const parentName = getRefText((d as any).superType);
  const { onNavigateToType, allNodeIds } = useNavigation();
  // For functions, show inputs as members; otherwise show attributes/features
  const members = (
    kind === 'func'
      ? ((d as any).inputs ?? [])
      : ((d as any).attributes ?? (d as any).features ?? [])
  ) as any[];

  const handleTypeClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.preventDefault();
      onNavigateToType?.(nodeId);
    },
    [onNavigateToType]
  );

  const outputTypeName = kind === 'func' ? getTypeRefText((d as any).output?.typeCall) : undefined;
  const outputTargetId = outputTypeName ? resolveTypeNodeId(outputTypeName, allNodeIds) : undefined;
  const parentTargetId = parentName ? resolveTypeNodeId(parentName, allNodeIds) : undefined;

  return (
    <div className={`rune-node ${kindCss}${selected ? ' rune-node-selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="rune-node-header">
        <NodeKindBadge kind={kind} />
        <span>{d.name}</span>
      </div>
      <div className="rune-node-body">
        {parentName && (
          <div className="rune-node-parent">
            <span className="rune-node-parent-label">→ </span>
            {parentTargetId && onNavigateToType ? (
              <button
                type="button"
                className="nodrag nopan"
                data-navigable
                onClick={(e) => handleTypeClick(e, parentTargetId)}
              >
                {parentName}
              </button>
            ) : (
              <span>{parentName}</span>
            )}
          </div>
        )}
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
        {kind === 'func' && (d as any).output && (
          <div className="rune-node-members" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="rune-node-member">
              <span className="rune-node-member-name">output</span>
              {outputTargetId && onNavigateToType ? (
                <button
                  type="button"
                  className="rune-node-member-type nodrag nopan"
                  data-navigable
                  onClick={(e) => handleTypeClick(e, outputTargetId)}
                >
                  {outputTypeName}
                </button>
              ) : (
                <span className="rune-node-member-type">{outputTypeName}</span>
              )}
            </div>
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
