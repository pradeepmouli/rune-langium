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
import { Position, useStore } from '@xyflow/react';
import type { NavigateToNodeCallback, TypeGraphNode, ValidationError } from '../../types.js';
import type { LayoutOptions } from '../../types.js';
import { nameFromNodeId } from '../../store/node-projection.js';

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

const EMPTY_ERRORS: ValidationError[] = [];

/**
 * Per-node validation errors from the node's `meta` sibling (Phase 3 step 3:
 * `node.data` is the pure domain payload — UI metadata like `errors` lives on
 * `node.meta`, which ReactFlow does NOT pass through `NodeProps`). Bridges the
 * gap by reading the user node out of the ReactFlow store. Returns a stable
 * empty array when the node (or a ReactFlow instance) is absent — e.g. when a
 * node component is rendered standalone under a bare `<ReactFlowProvider>`.
 */
export function useNodeMetaErrors(id: string): ValidationError[] {
  return useStore((s) => {
    const userNode = s.nodeLookup.get(id)?.internals.userNode as TypeGraphNode | undefined;
    return userNode?.meta?.errors ?? EMPTY_ERRORS;
  });
}

export function getHandlePositions(direction: GraphLayoutDirection): {
  target: Position;
  source: Position;
} {
  switch (direction) {
    case 'BT':
      return { target: Position.Bottom, source: Position.Top };
    case 'LR':
      return { target: Position.Left, source: Position.Right };
    case 'RL':
      return { target: Position.Right, source: Position.Left };
    case 'TB':
    default:
      return { target: Position.Top, source: Position.Bottom };
  }
}

/**
 * Resolve a type name to a node ID from the set of all node IDs.
 * Node IDs follow the pattern `namespace.name` (dot-form). Exact match first;
 * then exact last-segment match via nameFromNodeId to avoid namespace-segment
 * collisions (e.g. "a.Foo.Bar" must NOT match typeName="Foo").
 * Returns the first matching node ID, or undefined if not navigable.
 */
export function resolveTypeNodeId(typeName: string, allNodeIds: Set<string>): string | undefined {
  // Exact match first (already fully qualified, e.g., "cdm.base.math.Quantity")
  if (allNodeIds.has(typeName)) return typeName;
  // Exact last-segment match — avoids false positives from namespace segments
  for (const id of allNodeIds) {
    if (nameFromNodeId(id) === typeName) return id;
  }
  return undefined;
}
