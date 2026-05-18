// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * DataNode — Custom ReactFlow node for Rune DSL `Data` types.
 *
 * Displays type name, attributes with types and cardinalities,
 * and visual indicators for inheritance and validation errors.
 */

import { memo, useCallback } from 'react';
import { Handle } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { AnyGraphNode } from '../../types.js';
import type { StructureDataNode, StructureExpansionKey, StructureRow } from '../../types/structure-view.js';
import { expansionKey } from '../../types/structure-view.js';
import { getTypeRefText, formatCardinality } from '../../adapters/model-helpers.js';
import { getHandlePositions, useNavigation, resolveTypeNodeId } from './NavigationContext.js';
import { NodeKindBadge } from './NodeKindBadge.js';
import { useDiagnosticsForRange } from '../../hooks/useDiagnosticsForRange.js';
import type { RangeDiagnostic } from '../../hooks/useDiagnosticsForRange.js';

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
  /**
   * React Flow instance ids of this node's ancestors (NOT including this node
   * itself). Injected by `layoutStructureGraph` (Phase 14d). Used to scope
   * each row's expansion key per-instance: two visible occurrences of the
   * same type have different `instancePath`s because their parent instance
   * ids differ, so their row chevrons stay independent.
   *
   * Optional / may be undefined when this component is rendered outside the
   * Structure View layout (e.g., direct unit tests that omit it). Treated
   * as an empty array: `ownerInstancePath = [...(instancePath ?? []), id]`.
   */
  readonly instancePath?: ReadonlyArray<string>;
  /**
   * Spec §8 / §3.3 — navigate-to-enum callback. Injected by StructureView
   * alongside cellComponents. Rows with `typeKind === 'enum'` render an ↗
   * button that fires this with the enum's canonical typeId (ns::Name).
   */
  readonly onNavigateToEnumType?: (typeId: string) => void;
  /**
   * Spec §3.4 — pre-converted LSP diagnostics for the focused file. Ranges
   * are character offsets. Each row checks for overlap via useDiagnosticsForRange
   * and applies the appropriate severity CSS class to its left edge.
   */
  readonly structureDiagnostics?: readonly RangeDiagnostic[];
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

/** Maps RangeDiagnostic severity to the corresponding CSS modifier class. */
function diagnosticSeverityClass(severity: 1 | 2 | 3 | 4): string {
  if (severity === 1) return 'rune-node-row--diagnostic-error';
  if (severity === 2) return 'rune-node-row--diagnostic-warn';
  return 'rune-node-row--diagnostic-info';
}

/**
 * Per-row sub-component for the structure variant. Extracted so that
 * `useDiagnosticsForRange` — a hook — can be called once per row inside a
 * proper function component, which hooks rules require.
 */
interface StructureDataRowProps {
  row: StructureRow;
  expandable: boolean;
  isExpanded: boolean;
  handleToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
  NameCell?: React.ComponentType<{ value: string; nodeId: string; attrName: string }>;
  TypeCell?: React.ComponentType<{
    typeName: string;
    typeKind: StructureRow['typeKind'];
    nodeId: string;
    attrName: string;
  }>;
  CardCell?: React.ComponentType<{ value: string; nodeId: string; attrName: string }>;
  nodeId: string;
  onNavigateToEnumType?: (typeId: string) => void;
  structureDiagnostics: readonly RangeDiagnostic[];
}

function StructureDataRow({
  row,
  expandable,
  isExpanded,
  handleToggle,
  NameCell,
  TypeCell,
  CardCell,
  nodeId,
  onNavigateToEnumType,
  structureDiagnostics
}: StructureDataRowProps): React.ReactElement {
  const diagnostic = useDiagnosticsForRange(row.astRange, structureDiagnostics);
  const isEnum = row.typeKind === 'Enum';
  const isUnresolved = row.typeKind === 'Unresolved';

  let rowClass = `rune-node-row${expandable ? ' has-expansion' : ''}`;
  if (diagnostic) rowClass += ` ${diagnosticSeverityClass(diagnostic.severity)}`;

  const unresolvedTitle = diagnostic?.message ?? `Type ${row.typeName} not found in this namespace or its imports`;

  return (
    <div className={rowClass} data-attr={row.attrName}>
      {expandable ? (
        <button
          type="button"
          className="rune-row-expand nodrag nopan"
          onClick={handleToggle}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${row.attrName}`}
          data-testid={`expand-row-${row.attrName}`}
        >
          {isExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
        </button>
      ) : (
        <span className="rune-row-expand-spacer" aria-hidden="true" />
      )}
      {NameCell ? (
        <NameCell value={row.attrName} nodeId={nodeId} attrName={row.attrName} />
      ) : (
        <span className="rune-cell-name">{row.attrName}</span>
      )}
      {TypeCell ? (
        <TypeCell typeName={row.typeName} typeKind={row.typeKind} nodeId={nodeId} attrName={row.attrName} />
      ) : (
        // Finding 3: row.typeName is string (not undefined) per StructureRow; render '?' if empty.
        <span className="rune-cell-type-chip">{row.typeName || '?'}</span>
      )}
      {/* Spec §3.3 — enum-nav glyph (↗): navigate into the enum type as root. */}
      {isEnum && onNavigateToEnumType && row.targetNodeId ? (
        <button
          type="button"
          className="rune-row-glyph rune-row-glyph--enum-nav nodrag nopan"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNavigateToEnumType(row.targetNodeId!);
          }}
          aria-label={`Navigate to ${row.typeName}`}
          title={`Navigate to ${row.typeName}`}
          data-testid={`enum-nav-${row.attrName}`}
        >
          ↗
        </button>
      ) : null}
      {/* Spec §3.3 — unresolved-ref indicator (?): shows LSP error as tooltip. */}
      {isUnresolved ? (
        <span
          className="rune-row-glyph rune-row-glyph--unresolved"
          title={unresolvedTitle}
          aria-label={`Unresolved type: ${row.typeName}`}
          role="img"
          data-testid={`unresolved-${row.attrName}`}
        >
          ?
        </span>
      ) : null}
      {CardCell ? (
        <CardCell value={row.cardinality} nodeId={nodeId} attrName={row.attrName} />
      ) : (
        <span className="rune-cell-card">{row.cardinality}</span>
      )}
      {/* structure variant: no Handle — layout emits zero edges; nodesConnectable=false */}
    </div>
  );
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
    // Phase 10 has shipped (commit 01ea4af9 "tightened CSS variables") — removed TODO.
    // Core geometry handled by .rune-node-data--structure, .rune-node-body--two-col,
    // .rune-node-rows, .rune-node-row, .rune-row-handle, .rune-node-children-slot
    // in styles.css — layout constants (ROW_HEIGHT=28, COL_WIDTH=260, etc.) are matched there.
    const rows = data.rows as ReadonlyArray<StructureRow>;
    const {
      cellComponents,
      expansionMap,
      onToggleExpansion,
      instancePath,
      onNavigateToEnumType,
      structureDiagnostics
    } = data;
    const NameCell = cellComponents?.name;
    const TypeCell = cellComponents?.type;
    const CardCell = cellComponents?.card;
    const activeDiagnostics: readonly RangeDiagnostic[] = structureDiagnostics ?? [];
    // Adapter's expansion-key contract uses the bare type name as `typeId`
    // (see structure-graph-adapter.ts `shouldExpand`). Mirror that here so
    // toggles round-trip through the persistence layer correctly.
    const ownerNamespaceUri = data.namespaceUri;
    const ownerTypeName = data.name;
    // Per-instance expansion. The rowKey's instancePath must include self's
    // React Flow id (`id`) so two visible occurrences of the same type at the
    // same depth produce DISTINCT keys. `data.instancePath` carries the ancestors
    // (NOT including self); appending `id` makes it self-inclusive.
    //
    // Example: buyer.Party and seller.Party both have `data.instancePath = ['Trade']`
    // because their parent is Trade. Each chevron serializes to a distinct key:
    //   buyer.Party:  instancePath = ['Trade', 'Trade::buyer::Party']
    //   seller.Party: instancePath = ['Trade', 'Trade::seller::Party']
    //
    // The adapter's shouldExpand checks with the same self-inclusive path, so
    // expansion round-trips correctly through the store.
    const ownerInstancePath: ReadonlyArray<string> = [...(instancePath ?? []), id];

    return (
      <div className={`rune-node rune-node-data rune-node-data--structure${selected ? ' rune-node-selected' : ''}`}>
        <div className="rune-node-header">
          <NodeKindBadge kind="data" />
          <span>{data.name}</span>
        </div>
        <div className="rune-node-body rune-node-body--two-col">
          <div className="rune-node-rows">
            {rows.map((row: StructureRow) => {
              const expandable = isRowExpandable(row.typeKind);
              const rowKey: StructureExpansionKey | undefined = expandable
                ? {
                    namespaceUri: ownerNamespaceUri,
                    typeId: ownerTypeName,
                    attrName: row.attrName,
                    instancePath: ownerInstancePath
                  }
                : undefined;
              const isExpanded = rowKey && expansionMap ? expansionMap.get(expansionKey(rowKey)) === true : false;
              const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                e.stopPropagation();
                if (rowKey) onToggleExpansion?.(rowKey);
              };
              return (
                <StructureDataRow
                  key={row.attrName}
                  row={row}
                  expandable={expandable}
                  isExpanded={isExpanded}
                  handleToggle={handleToggle}
                  NameCell={NameCell}
                  TypeCell={TypeCell}
                  CardCell={CardCell}
                  nodeId={data.id}
                  onNavigateToEnumType={onNavigateToEnumType}
                  structureDiagnostics={activeDiagnostics}
                />
              );
            })}
          </div>
          <div className="rune-node-children-slot" data-testid="data-node-children" />
        </div>
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
