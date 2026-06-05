// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * FunctionNode — Custom ReactFlow node for Rune DSL `RosettaFunction` types,
 * structure-view variant (Phase C).
 *
 * Renders a card mirroring DataNode's structure chrome:
 *   - header: Func kind badge + name + the Phase-A `StructureMetaIndicators`
 *     cluster (documentation / conditions / annotations popovers).
 *   - body: the function's INPUT parameters as stacked Data-style rows (name on
 *     top, `type · cardinality` beneath), then — when present — a separator and
 *     a distinct OUTPUT row prefixed with a `→` glyph.
 *
 * Functions are terminal in this first cut — no per-input/output expansion into
 * nested subtrees — so there is no two-column body and no expand controls. The
 * default (graph-view) variant is handled by GenericNode; this component is only
 * registered for the structure `'function'` node type, so it always reads the
 * structure shape.
 */

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { TypeChip } from '../editors/structure/TypeChip.js';
import type { StructureFunctionNode, StructureRow } from '../../types/structure-view.js';
import { NodeKindBadge } from './NodeKindBadge.js';
import { StructureMetaIndicators } from './StructureMetaIndicators.js';

interface StructureFunctionNodeData extends StructureFunctionNode {
  readonly variant: 'structure';
  /**
   * Per-node rows-column width (e2e-batch fix #12) — referenced by the
   * inline-style `width` on `.rune-node-rows` so per-node estimates override
   * the global `--rune-col-width` fallback.
   */
  readonly rowsColWidth?: number;
}

function isStructureFunction(d: unknown): d is StructureFunctionNodeData {
  return typeof d === 'object' && d !== null && (d as { variant?: unknown }).variant === 'structure';
}

/**
 * Read-only stacked row for a Function input/output. Mirrors DataNode's
 * `StructureDataRow` markup (`.rune-node-row__main` → name line + type line)
 * but without diagnostics, cells, enum-nav, or expand controls — function
 * inputs/output are plain shape display in this cut.
 */
function FunctionRow({ row, isOutput }: { row: StructureRow; isOutput?: boolean }): React.ReactElement {
  return (
    <div className={`rune-node-row${isOutput ? ' rune-node-row--output' : ''}`} data-attr={row.attrName}>
      <div className="rune-node-row__main">
        <div className="rune-node-row__name-line">
          {isOutput ? (
            <span className="rune-node-row__output-arrow" aria-hidden="true">
              →
            </span>
          ) : null}
          <span className="rune-cell-name">{row.attrName}</span>
        </div>
        <div className="rune-node-row__type-line">
          <TypeChip as="span" typeName={row.typeName || '?'} typeKind={row.typeKind} />
          <span className="rune-cell-card">{row.cardinality}</span>
        </div>
      </div>
    </div>
  );
}

export const FunctionNode = memo(function FunctionNode({ data, selected }: NodeProps) {
  // FunctionNode is only registered for the structure `'function'` node type, so
  // `data` is always the structure shape. Guard defensively anyway so a stray
  // graph-variant payload renders a minimal header instead of crashing.
  if (!isStructureFunction(data)) {
    const name = (data as { name?: string } | undefined)?.name ?? '';
    return (
      <div className={`rune-node rune-node-func${selected ? ' rune-node-selected' : ''}`}>
        <div className="rune-node-header">
          <NodeKindBadge kind="func" />
          <span>{name}</span>
        </div>
      </div>
    );
  }

  const inputRows = data.inputRows as ReadonlyArray<StructureRow>;
  const outputRow = data.outputRow;
  const rowsColWidth = data.rowsColWidth;

  return (
    <div className={`rune-node rune-node-func rune-node-func--structure${selected ? ' rune-node-selected' : ''}`}>
      <div className="rune-node-header">
        <NodeKindBadge kind="func" />
        <span>{data.name}</span>
        <StructureMetaIndicators
          definition={data.definition}
          annotations={data.annotations}
          conditions={data.conditions}
        />
      </div>
      <div className="rune-node-body">
        <div className="rune-node-rows" style={rowsColWidth ? { width: rowsColWidth } : undefined}>
          {inputRows.map((row) => (
            <FunctionRow key={row.attrName} row={row} />
          ))}
          {outputRow ? (
            <>
              <div className="rune-node-func-output-sep" aria-hidden="true" />
              <FunctionRow row={outputRow} isOutput />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
});
