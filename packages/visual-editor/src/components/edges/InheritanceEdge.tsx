/**
 * InheritanceEdge — Custom ReactFlow edge for `extends` and `enum-extends` relationships.
 *
 * Solid line with a triangle arrowhead pointing to the parent type.
 */

import { memo } from 'react';
import { BaseEdge, getStraightPath, EdgeLabelRenderer } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { colors } from '@rune-langium/design-system/tokens';

export const InheritanceEdge = memo(function InheritanceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd
}: EdgeProps) {
  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: colors.data.DEFAULT,
        strokeWidth: 2,
        ...style
      }}
      markerEnd={markerEnd}
    />
  );
});
