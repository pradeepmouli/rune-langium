// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * NavigationContext — Provides type-reference navigation callbacks to graph nodes.
 *
 * ReactFlow custom nodes only receive `data` and `selected` via NodeProps.
 * This context bridges the gap, allowing nodes to trigger navigation when
 * a user clicks on a type reference.
 */

import { createContext, useContext } from 'react';
import { Position } from '@xyflow/react';
import type { NavigateToNodeCallback } from '../../types.js';
import type { LayoutOptions } from '../../types.js';

export type GraphLayoutDirection = NonNullable<LayoutOptions['direction']>;

export interface NavigationContextValue {
  onNavigateToType?: NavigateToNodeCallback;
  /** Set of all node IDs currently in the graph, used to check if a type is navigable. */
  allNodeIds: Set<string>;
  /** Active dagre layout direction so node handles can choose the opposing connector axis. */
  layoutDirection: GraphLayoutDirection;
}

const defaultValue: NavigationContextValue = { allNodeIds: new Set(), layoutDirection: 'TB' };

export const NavigationContext = createContext<NavigationContextValue>(defaultValue);

export const useNavigation = () => useContext(NavigationContext);

export function getHandlePositions(direction: GraphLayoutDirection): {
  target: Position;
  source: Position;
} {
  switch (direction) {
    case 'BT':
      return { target: Position.Right, source: Position.Left };
    case 'LR':
      return { target: Position.Top, source: Position.Bottom };
    case 'RL':
      return { target: Position.Bottom, source: Position.Top };
    case 'TB':
    default:
      return { target: Position.Left, source: Position.Right };
  }
}

/**
 * Resolve a type name to a node ID from the set of all node IDs.
 * Node IDs follow the pattern `namespace::name`, so we match on the `::name` suffix.
 * Returns the first matching node ID, or undefined if not navigable.
 */
export function resolveTypeNodeId(typeName: string, allNodeIds: Set<string>): string | undefined {
  // Exact match first (already fully qualified, e.g., "cdm.base.math::Quantity")
  if (allNodeIds.has(typeName)) return typeName;
  // Suffix match on ::name
  const suffix = `::${typeName}`;
  for (const id of allNodeIds) {
    if (id.endsWith(suffix)) return id;
  }
  return undefined;
}
