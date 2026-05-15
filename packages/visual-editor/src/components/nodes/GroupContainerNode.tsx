// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { Node, NodeProps } from '@xyflow/react';
import type { StructureRow } from '../../types/structure-view.js';

export interface GroupContainerInheritanceData extends Record<string, unknown> {
  scope: 'inheritance';
  label: string;
  description?: string;
  nodeCount: number;
}

export interface GroupContainerBaseTypeData extends Record<string, unknown> {
  scope: 'base-type';
  baseTypeName: string;
  baseRows: ReadonlyArray<StructureRow>;
}

export type GroupContainerData = GroupContainerInheritanceData | GroupContainerBaseTypeData;
export type GroupContainerNodeType = Node<GroupContainerData, 'groupContainer'>;

export function GroupContainerNode({ data }: NodeProps<GroupContainerNodeType>): React.ReactElement {
  if (data.scope === 'inheritance') {
    return (
      <div className="rune-graph-group">
        <div className="rune-graph-group__header">
          <span className="rune-graph-group__title">{data.label}</span>
          <span className="rune-graph-group__meta">{data.nodeCount} types</span>
        </div>
        {data.description ? <div className="rune-graph-group__description">{data.description}</div> : null}
      </div>
    );
  }

  // scope === 'base-type'
  return (
    <div className="rune-graph-group rune-graph-group--base">
      <div className="rune-graph-group__header">
        <span className="rune-graph-group__title">{data.baseTypeName}</span>
        <span className="rune-graph-group__meta">base</span>
      </div>
      <div className="rune-graph-group__base-rows">
        {data.baseRows.map((row) => (
          <div key={row.attrName} className="rune-graph-group__base-row">
            <span className="rune-cell-name">{row.attrName}</span>
            <span className="rune-cell-type-chip rune-cell-type-chip--basic">{row.typeName}</span>
            <span className="rune-cell-card">{row.cardinality}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
