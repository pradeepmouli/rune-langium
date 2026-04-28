// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ReferenceEdge — Custom ReactFlow edge for `attribute-ref` and `choice-option` relationships.
 *
 * Dashed line for attribute references, solid for choice options.
 * Shows label with attribute name and cardinality.
 */

import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, EdgeLabelRenderer } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { EdgeData } from '../../types.js';
import { colors } from '@rune-langium/design-system/tokens';

export const ReferenceEdge = memo(function ReferenceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14,
    offset: 18
  });

  const edgeData = data as EdgeData | undefined;
  const isAttributeRef = edgeData?.kind === 'attribute-ref';
  const isTypeAliasRef = edgeData?.kind === 'type-alias-ref';
  const stroke = isAttributeRef
    ? colors.edge.ref
    : isTypeAliasRef
      ? colors.expr.literal.DEFAULT
      : colors.choice.DEFAULT;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth: isAttributeRef ? 1.65 : 1.85,
          strokeDasharray: isAttributeRef || isTypeAliasRef ? '5 3' : undefined,
          ...style
        }}
        markerEnd={markerEnd}
      />
      {edgeData?.label && edgeData?.showLabel !== false && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`
            }}
            className={`rune-edge-label rune-edge-label--${edgeData.kind} nodrag nopan`}
          >
            {edgeData.label}
            {edgeData.cardinality && (
              <span className="rune-edge-label__cardinality">{edgeData.cardinality}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
