// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Node, NodeProps } from '@xyflow/react';
import type { StructureExpansionKey, StructureRow } from '../../types/structure-view.js';
import { expansionKey } from '../../types/structure-view.js';

export interface GroupContainerInheritanceData extends Record<string, unknown> {
  scope: 'inheritance';
  label: string;
  description?: string;
  nodeCount: number;
}

export interface GroupContainerBaseTypeData extends Record<string, unknown> {
  scope: 'base-type';
  baseTypeName: string;
  /** Namespace URI of the base type — needed to build the StructureExpansionKey for each row. */
  baseTypeNamespaceUri: string;
  baseRows: ReadonlyArray<StructureRow>;
  /**
   * Per-key expansion state for rendering the expand/collapse chevron on inherited
   * Data/Choice rows (Codex P2, PR #191). Injected by StructureView alongside
   * onToggleExpansion. When absent, all rows render collapsed.
   */
  expansionMap?: ReadonlyMap<string, boolean>;
  /**
   * Callback fired when the user activates a row's expand/collapse control.
   * The expansion key uses the base type's namespace + canonical typeId so it
   * round-trips correctly through the persistence layer.
   */
  onToggleExpansion?: (key: StructureExpansionKey) => void;
  /**
   * React Flow instance ids of this base container's ancestors (NOT including
   * the container itself). Injected by `layoutStructureGraph` (Phase 14d).
   * Used to scope each row's expansion key per-instance so chevrons on
   * inherited rows of two visible occurrences of the same base type stay
   * independent. Undefined / empty path serializes to the legacy key form
   * (back-compat) — see `expansionKey()` for the migration story.
   */
  instancePath?: ReadonlyArray<string>;
}

export type GroupContainerData = GroupContainerInheritanceData | GroupContainerBaseTypeData;
export type GroupContainerNodeType = Node<GroupContainerData, 'groupContainer'>;

/**
 * Row-level expansion is only meaningful for typeKinds whose target is itself a
 * structured node (Data / Choice). Enum rows are terminal. Builtin and Unresolved
 * have no expansion target. Mirrors the same helper in DataNode.tsx.
 */
function isRowExpandable(typeKind: StructureRow['typeKind']): boolean {
  return typeKind === 'Data' || typeKind === 'Choice';
}

export function GroupContainerNode({ data, id }: NodeProps<GroupContainerNodeType>): React.ReactElement {
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
  // TODO(Phase 10) visual tightening: gradient/shadow/font polish.
  // Core geometry handled by .rune-graph-group--base, .rune-graph-group__base-rows,
  // .rune-graph-group__base-row in styles.css — layout constants (ROW_HEIGHT=28,
  // BASE_PADDING=16, etc.) are matched there.
  //
  // Codex P2 / PR #191: each Data/Choice row now shows a chevron expand/collapse
  // button (matching the DataNode pattern). The expansion key uses the BARE base
  // type name as typeId because the adapter's shouldExpand (and DataNode) write
  // `typeId: ownerTypeName` (bare) — see structure-graph-adapter.ts:194 and
  // DataNode.tsx:113. Any other format would produce a key that the adapter never
  // looks for, leaving the chevron's "expanded" state visually correct but never
  // actually rendering the child.
  const { baseTypeName, baseTypeNamespaceUri, baseRows, expansionMap, onToggleExpansion, instancePath } = data;

  // Phase 14d (fix): include self's React Flow id in the rowKey instancePath so
  // two visible occurrences of the same base container at the same depth produce
  // distinct keys. `data.instancePath` carries the ancestors (NOT including self);
  // appending `id` makes it self-inclusive and aligns with the adapter's updated
  // shouldExpand check (which also uses the self-inclusive path).
  const ownerInstancePath: ReadonlyArray<string> = [...(instancePath ?? []), id];

  return (
    <div className="rune-graph-group rune-graph-group--base">
      <div className="rune-graph-group__header">
        <span className="rune-graph-group__title">{baseTypeName}</span>
        <span className="rune-graph-group__meta">base</span>
      </div>
      <div className="rune-graph-group__base-rows">
        {baseRows.map((row) => {
          const expandable = isRowExpandable(row.typeKind);
          const rowKey: StructureExpansionKey | undefined = expandable
            ? {
                namespaceUri: baseTypeNamespaceUri,
                typeId: baseTypeName,
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
            <div
              key={row.attrName}
              className={`rune-graph-group__base-row${expandable ? ' has-expansion' : ''}`}
              data-attr={row.attrName}
            >
              {expandable ? (
                // Codex P2 (PR #191): row-level expand/collapse for inherited rows.
                // Real <button> for native keyboard semantics (Enter/Space).
                // nodrag/nopan keep React Flow from treating the click as a canvas gesture.
                <button
                  type="button"
                  className="rune-row-expand nodrag nopan"
                  onClick={handleToggle}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${row.attrName}`}
                  data-testid={`base-expand-row-${row.attrName}`}
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
              <span className="rune-cell-name">{row.attrName}</span>
              <span className="rune-cell-type-chip rune-cell-type-chip--basic">{row.typeName}</span>
              <span className="rune-cell-card">{row.cardinality}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
