// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ChoiceNode — Custom ReactFlow node for Rune DSL `Choice` types.
 *
 * Displays choice name and its options (each referencing a type).
 *
 * Two rendering variants:
 *   - `variant === 'structure'`: structure-view context, reads `data.options`
 *     (ReadonlyArray<StructureChoiceArm>) emitted by layoutStructureGraph.
 *     Phase 14e/B brings ChoiceNode to parity with DataNode for arms: each
 *     arm row renders a TypePickerCell (drag-drop target) and, for arms
 *     whose target is Data or Choice, an expansion chevron that toggles
 *     per-instance expansion via `data.onToggleExpansion`. Terminal arms
 *     (Enum / Builtin / Unresolved) render a spacer for alignment but no
 *     chevron — there is no subtree to drill into.
 *   - default (graph view): reads `data.attributes`, renders navigable handles.
 */

import { memo, useCallback } from 'react';
import { Handle } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { AnyGraphNode } from '../../types.js';
import type {
  StructureChoiceNode,
  StructureChoiceArm,
  StructureExpansionKey,
  StructureRow
} from '../../types/structure-view.js';
import { expansionKey } from '../../types/structure-view.js';
import { getTypeRefText } from '../../adapters/model-helpers.js';
import { getHandlePositions, useNavigation, resolveTypeNodeId } from './NavigationContext.js';
import { NodeKindBadge } from './NodeKindBadge.js';
import type { RangeDiagnostic } from '../../hooks/useDiagnosticsForRange.js';

// ---------------------------------------------------------------------------
// Structure-variant helpers
// ---------------------------------------------------------------------------

interface StructureChoiceNodeData extends StructureChoiceNode {
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
  /** Per-key expansion state (Phase 14e/B); same shape as DataNode. */
  readonly expansionMap?: ReadonlyMap<string, boolean>;
  /** Toggle callback (Phase 14e/B); same shape as DataNode. */
  readonly onToggleExpansion?: (key: StructureExpansionKey) => void;
  /** Ancestor rfId chain (Phase 14d); same shape as DataNode. */
  readonly instancePath?: ReadonlyArray<string>;
  /**
   * Spec §8 / §3.3 — navigate-to-enum callback (same contract as DataNode).
   * Arms with `typeKind === 'Enum'` render an ↗ button that fires this with
   * the arm's `targetNodeId`.
   */
  readonly onNavigateToEnumType?: (typeId: string) => void;
  /**
   * Spec §3.4 — pre-converted diagnostics for the focused file (same contract
   * as DataNode). Arms use `useDiagnosticsForRange` for left-edge severity tinting.
   * Choice arms do not carry `astRange` today (no field on StructureChoiceArm),
   * so this is reserved for future use but accepted to keep the interface symmetric.
   */
  readonly structureDiagnostics?: readonly RangeDiagnostic[];
}

function isStructureChoice(d: unknown): d is StructureChoiceNodeData {
  return typeof d === 'object' && d !== null && (d as { variant?: unknown }).variant === 'structure';
}

/**
 * An arm is expandable only when its referenced target is itself a structured
 * node (Data or Choice). Terminal kinds — Enum, Builtin, Unresolved — never
 * get a chevron. Mirrors DataNode's `isRowExpandable` predicate.
 */
function isArmExpandable(typeKind: StructureChoiceArm['typeKind']): boolean {
  return typeKind === 'Data' || typeKind === 'Choice';
}

/**
 * StructureChoiceArm.typeKind narrows to a subset of StructureRow.typeKind
 * (no 'Builtin' vs 'BasicType' overlap — arms classify Builtin where rows
 * classify BasicType). Map the arm kind to the row kind that TypePickerCell
 * expects so the same cell component can be reused on arms without a
 * dedicated arm-specific TypePickerCell variant.
 */
function armKindToRowKind(armKind: StructureChoiceArm['typeKind']): StructureRow['typeKind'] {
  return armKind === 'Builtin' ? 'BasicType' : armKind;
}

/**
 * Per-arm sub-component for ChoiceNode's structure variant. Kept as a
 * dedicated function component so any per-arm hook (e.g. future
 * useDiagnosticsForRange when arms carry astRange) can be added without
 * violating hooks rules.
 *
 * **astRange-threading gap:** `StructureChoiceArm` does NOT carry an
 * astRange field today, so this row deliberately does NOT call
 * `useDiagnosticsForRange` — the result would always be `undefined` and
 * the diagnostic class would never apply (Copilot review caught this on
 * PR #207). When arms gain astRange (mirroring the same fix DataNode rows
 * need — see DataNode.tsx comment on `structureDiagnostics`), reintroduce
 * the hook call here.
 */
interface StructureChoiceArmRowProps {
  arm: StructureChoiceArm;
  expandable: boolean;
  isExpanded: boolean;
  handleToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
  TypeCell?: React.ComponentType<{
    typeName: string;
    typeKind: StructureRow['typeKind'];
    nodeId: string;
    attrName: string;
  }>;
  nodeId: string;
  onNavigateToEnumType?: (typeId: string) => void;
}

function StructureChoiceArmRow({
  arm,
  expandable,
  isExpanded,
  handleToggle,
  TypeCell,
  nodeId,
  onNavigateToEnumType
}: StructureChoiceArmRowProps): React.ReactElement {
  const isEnum = arm.typeKind === 'Enum';
  const isUnresolved = arm.typeKind === 'Unresolved';

  const rowClass = `rune-node-row${expandable ? ' has-expansion' : ''}`;

  const unresolvedTitle = `Type ${arm.typeName} not found in this namespace or its imports`;

  return (
    <div className={rowClass} data-attr={arm.typeName}>
      {expandable ? (
        <button
          type="button"
          className="rune-row-expand nodrag nopan"
          onClick={handleToggle}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${arm.typeName}`}
          data-testid={`choice-arm-expand-${arm.typeName}`}
        >
          {isExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
        </button>
      ) : (
        <span className="rune-row-expand-spacer" aria-hidden="true" />
      )}
      {TypeCell ? (
        // Cells receive the canonical node id (data.id), not the
        // React Flow wrapper id — matches DataNode's contract so
        // updateAttributeType (or the analogous arm-retype action)
        // looks up by canonical id consistently.
        <TypeCell
          typeName={arm.typeName}
          typeKind={armKindToRowKind(arm.typeKind)}
          nodeId={nodeId}
          attrName={arm.typeName}
        />
      ) : (
        <span className="rune-cell-type-chip">{arm.typeName || '?'}</span>
      )}
      {/* Spec §3.3 — enum-nav glyph (↗) for Enum arms. */}
      {isEnum && onNavigateToEnumType && arm.targetNodeId ? (
        <button
          type="button"
          className="rune-row-glyph rune-row-glyph--enum-nav nodrag nopan"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNavigateToEnumType(arm.targetNodeId!);
          }}
          aria-label={`Navigate to ${arm.typeName}`}
          title={`Navigate to ${arm.typeName}`}
          data-testid={`enum-nav-arm-${arm.typeName}`}
        >
          ↗
        </button>
      ) : null}
      {/* Spec §3.3 — unresolved-type indicator (?) for Unresolved arms. */}
      {isUnresolved ? (
        <span
          className="rune-row-glyph rune-row-glyph--unresolved"
          title={unresolvedTitle}
          aria-label={`Unresolved type: ${arm.typeName}`}
          role="img"
          data-testid={`unresolved-arm-${arm.typeName}`}
        >
          ?
        </span>
      ) : null}
      {/* structure variant: no Handle — layout emits zero edges; nodesConnectable=false */}
    </div>
  );
}

export const ChoiceNode = memo(function ChoiceNode({ data, selected, id }: NodeProps) {
  const d = data as unknown as AnyGraphNode;
  const { onNavigateToType, allNodeIds, layoutDirection } = useNavigation();
  const handles = getHandlePositions(layoutDirection);

  // -------------------------------------------------------------------------
  // Structure variant — reads data.options (StructureChoiceArm[]) from the
  // adapter. Arms have only a typeName and typeKind — no attrName or
  // cardinality (a choice arm IS a type, not an attribute).
  //
  // Phase 14e/B: arms gain TypePickerCell (when injected via cellComponents)
  // and per-arm expansion chevrons (when the target is Data or Choice).
  // -------------------------------------------------------------------------
  if (isStructureChoice(data)) {
    const options = data.options as ReadonlyArray<StructureChoiceArm>;
    const { cellComponents, expansionMap, onToggleExpansion, instancePath, onNavigateToEnumType } = data;
    const TypeCell = cellComponents?.type;
    // `structureDiagnostics` is intentionally NOT destructured here — arms have
    // no astRange today so we don't pass diagnostics through to the row (would
    // be a no-op). See `StructureChoiceArmRow`'s docstring for the threading
    // gap; reintroduce both ends when arms gain astRange.
    const ownerNamespaceUri = data.namespaceUri;
    const ownerTypeName = data.name;
    // Same self-inclusive instancePath convention as DataNode: ancestors + self.
    const ownerInstancePath: ReadonlyArray<string> = [...(instancePath ?? []), id];
    // e2e-batch fix #12: per-node rows-column width from the layout.
    const rowsColWidth = (data as { rowsColWidth?: number }).rowsColWidth;

    return (
      <div className={`rune-node rune-node-choice rune-node-choice--structure${selected ? ' rune-node-selected' : ''}`}>
        <div className="rune-node-header">
          <NodeKindBadge kind="choice" />
          <span>{data.name}</span>
        </div>
        <div className="rune-node-rows" style={rowsColWidth ? { width: rowsColWidth } : undefined}>
          {options.map((arm: StructureChoiceArm) => {
            const expandable = isArmExpandable(arm.typeKind);
            // Arm expansion key convention (Phase 14e/B): arm.typeName fills
            // the attrName slot since arms have no DSL-level attribute name.
            // Matches the adapter's `expandChoiceArms` key construction so
            // chevron writes round-trip through `shouldExpandArm`-equivalent
            // checks symmetrically.
            const rowKey: StructureExpansionKey | undefined = expandable
              ? {
                  namespaceUri: ownerNamespaceUri,
                  typeId: ownerTypeName,
                  attrName: arm.typeName,
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
              <StructureChoiceArmRow
                key={arm.typeName}
                arm={arm}
                expandable={expandable}
                isExpanded={isExpanded}
                handleToggle={handleToggle}
                TypeCell={TypeCell}
                nodeId={data.id}
                onNavigateToEnumType={onNavigateToEnumType}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Default graph variant — reads data.attributes (existing behavior).
  // -------------------------------------------------------------------------
  const members = ((d as any).attributes ?? []) as any[];
  const summary = members.length === 0 ? 'No options' : `${members.length} option${members.length === 1 ? '' : 's'}`;

  const handleTypeClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.preventDefault();
      onNavigateToType?.(nodeId);
    },
    [onNavigateToType]
  );

  return (
    <div className={`rune-node rune-node-choice${selected ? ' rune-node-selected' : ''}`} data-summary={summary}>
      <Handle type="target" position={handles.target} />
      <div className="rune-node-header">
        <NodeKindBadge kind="choice" />
        <span>{d.name}</span>
      </div>
      <div className="rune-node-summary">{summary}</div>
      <div className="rune-node-body">
        {members.length > 0 && (
          <div className="rune-node-members">
            {members.map((member: any, i: number) => {
              const typeName = getTypeRefText(member.typeCall);
              const displayName = typeName ?? member.name;
              const targetId = typeName ? resolveTypeNodeId(typeName, allNodeIds) : undefined;
              return (
                <div key={typeName ?? member.name ?? i} className="rune-node-member">
                  {targetId && onNavigateToType ? (
                    <button
                      type="button"
                      className="rune-node-member-name nodrag nopan"
                      data-navigable
                      onClick={(e) => handleTypeClick(e, targetId)}
                    >
                      {displayName}
                    </button>
                  ) : (
                    <span className="rune-node-member-name">{displayName}</span>
                  )}
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
