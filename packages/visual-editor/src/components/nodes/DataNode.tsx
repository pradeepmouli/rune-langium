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
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { AnyGraphNode } from '../../types.js';
import type { StructureDataNode, StructureExpansionKey, StructureRow } from '../../types/structure-view.js';
import { expansionKey } from '../../types/structure-view.js';
import { getTypeRefText, formatCardinality } from '../../adapters/model-helpers.js';
import { getHandlePositions, useNavigation, resolveTypeNodeId } from './NavigationContext.js';
import { NodeKindBadge } from './NodeKindBadge.js';

// ---------------------------------------------------------------------------
// Structure-variant types (Finding 4)
// ---------------------------------------------------------------------------

interface StructureNodeData extends StructureDataNode {
  readonly variant: 'structure';
  readonly cellComponents?: {
    name?: React.ComponentType<{ value: string; nodeId: string; attrName: string }>;
    type?: React.ComponentType<{
      typeName: string;
      typeKind: StructureRow['typeKind'];
      nodeId: string;
      attrName: string;
    }>;
    card?: React.ComponentType<{ value: string; nodeId: string; attrName: string }>;
  };
  /**
   * Per-key expansion state for rendering the expand/collapse chevron
   * (Finding 1, spec 020 Phase 13). When absent, all rows render
   * collapsed (aria-expanded=false).
   */
  readonly expansionMap?: ReadonlyMap<string, boolean>;
  /**
   * Callback fired when the user activates a row's expand/collapse control.
   * The receiver is expected to flip the corresponding entry in the
   * expansion map (typically via useStructureViewStore.toggleExpansion).
   */
  readonly onToggleExpansion?: (key: StructureExpansionKey) => void;
}

/**
 * Row-level expansion is only meaningful for typeKinds whose target is itself
 * a structured node (Data / Choice). Enum rows are terminal — drilling into
 * their values is the EnumNode's responsibility, not a row expansion.
 * Builtin and Unresolved have no expansion target at all.
 */
function isRowExpandable(typeKind: StructureRow['typeKind']): boolean {
  return typeKind === 'Data' || typeKind === 'Choice';
}

function isStructureData(d: unknown): d is StructureNodeData {
  return typeof d === 'object' && d !== null && (d as { variant?: unknown }).variant === 'structure';
}

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

  if (isStructureData(data)) {
    // Finding 1: consume StructureRow shape from data.rows (not data.attributes).
    // StructureRow.typeName, .attrName, .cardinality are already pre-formatted strings
    // from the adapter — no getTypeRefText / formatCardinality needed here.
    // TODO(Phase 10) visual tightening: gradient/shadow/font polish.
    // Core geometry handled by .rune-node-data--structure, .rune-node-body--two-col,
    // .rune-node-rows, .rune-node-row, .rune-row-handle, .rune-node-children-slot
    // in styles.css — layout constants (ROW_HEIGHT=28, COL_WIDTH=260, etc.) are matched there.
    const rows = data.rows as ReadonlyArray<StructureRow>;
    const { cellComponents, expansionMap, onToggleExpansion } = data;
    const NameCell = cellComponents?.name;
    const TypeCell = cellComponents?.type;
    const CardCell = cellComponents?.card;
    // Adapter's expansion-key contract uses the bare type name as `typeId`
    // (see structure-graph-adapter.ts `shouldExpand`). Mirror that here so
    // toggles round-trip through the persistence layer correctly.
    const ownerNamespaceUri = data.namespaceUri;
    const ownerTypeName = data.name;

    return (
      <div className={`rune-node rune-node-data rune-node-data--structure${selected ? ' rune-node-selected' : ''}`}>
        <Handle type="target" position={handles.target} />
        <div className="rune-node-header">
          <NodeKindBadge kind="data" />
          <span>{data.name}</span>
        </div>
        <div className="rune-node-body rune-node-body--two-col">
          <div className="rune-node-rows">
            {rows.map((row: StructureRow) => {
              const expandable = isRowExpandable(row.typeKind);
              const rowKey: StructureExpansionKey | undefined = expandable
                ? { namespaceUri: ownerNamespaceUri, typeId: ownerTypeName, attrName: row.attrName }
                : undefined;
              const isExpanded = rowKey && expansionMap ? expansionMap.get(expansionKey(rowKey)) === true : false;
              const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                e.stopPropagation();
                if (rowKey) onToggleExpansion?.(rowKey);
              };
              return (
                <div
                  key={row.attrName}
                  className={`rune-node-row${expandable ? ' has-expansion' : ''}`}
                  data-attr={row.attrName}
                >
                  {expandable ? (
                    // Finding 1 (spec 020 Phase 13): row-level expand/collapse
                    // control. Real <button> for native keyboard semantics
                    // (Enter/Space). aria-expanded + aria-label give AT users
                    // both the state and the action label. nodrag/nopan keep
                    // React Flow from interpreting the click as a canvas
                    // pan/drag gesture.
                    <button
                      type="button"
                      className="rune-row-expand nodrag nopan"
                      onClick={handleToggle}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${row.attrName}`}
                      data-testid={`expand-row-${row.attrName}`}
                    >
                      {isExpanded ? (
                        <ChevronDown size={12} aria-hidden="true" />
                      ) : (
                        <ChevronRight size={12} aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    <span className="rune-row-expand-spacer" aria-hidden="true" />
                  )}
                  {NameCell ? (
                    <NameCell value={row.attrName} nodeId={id} attrName={row.attrName} />
                  ) : (
                    <span className="rune-cell-name">{row.attrName}</span>
                  )}
                  {TypeCell ? (
                    <TypeCell typeName={row.typeName} typeKind={row.typeKind} nodeId={id} attrName={row.attrName} />
                  ) : (
                    // Finding 3: row.typeName is string (not undefined) per StructureRow; render '?' if empty.
                    <span className="rune-cell-type-chip">{row.typeName || '?'}</span>
                  )}
                  {CardCell ? (
                    <CardCell value={row.cardinality} nodeId={id} attrName={row.attrName} />
                  ) : (
                    <span className="rune-cell-card">{row.cardinality}</span>
                  )}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={row.attrName}
                    className="rune-row-handle"
                    data-testid={`row-handle-${row.attrName}`}
                  />
                </div>
              );
            })}
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
              <div key={`${err.ruleId ?? 'err'}:${err.message}:${i}`}>{err.message}</div>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={handles.source} />
    </div>
  );
});
