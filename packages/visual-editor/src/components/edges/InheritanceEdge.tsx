// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * InheritanceEdge — Custom ReactFlow edge for `extends` and `enum-extends` relationships.
 *
 * Solid line with a triangle arrowhead pointing to the parent type.
 */

import { memo } from 'react';
import { BaseEdge, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { EdgeData } from '../../types.js';
import { colors } from '@rune-langium/design-system/tokens';

export const InheritanceEdge = memo(function InheritanceEdge({
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
  const edgeData = data as EdgeData | undefined;
  const isEnumExtends = edgeData?.kind === 'enum-extends';
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
    offset: 24
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: isEnumExtends ? colors.enum.DEFAULT : colors.data.DEFAULT,
        strokeWidth: 2.25,
        ...style
      }}
      markerEnd={markerEnd}
    />
  );
});
