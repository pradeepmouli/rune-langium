/**
 * ReferenceEdge — Custom ReactFlow edge for `attribute-ref` and `choice-option` relationships.
 *
 * Dashed line for attribute references, solid for choice options.
 * Shows label with attribute name and cardinality.
 */

import { memo } from 'react';
import { BaseEdge, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { EdgeData } from '../../types.js';

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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const edgeData = data as EdgeData | undefined;
  const isAttributeRef = edgeData?.kind === 'attribute-ref';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: isAttributeRef ? '#718096' : '#ed8936',
          strokeWidth: 1.5,
          strokeDasharray: isAttributeRef ? '5 3' : undefined,
          ...style
        }}
        markerEnd={markerEnd}
      />
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 11,
              background: '#ffffff',
              padding: '1px 4px',
              borderRadius: 3,
              border: '1px solid #e2e8f0',
              pointerEvents: 'all'
            }}
            className="nodrag nopan"
          >
            {edgeData.label}
            {edgeData.cardinality && (
              <span style={{ color: '#a0aec0', marginLeft: 4 }}>{edgeData.cardinality}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
