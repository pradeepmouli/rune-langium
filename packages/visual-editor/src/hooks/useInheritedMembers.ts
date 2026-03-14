/**
 * useInheritedMembers — Resolves the inheritance chain for a graph node.
 *
 * Walks up the superType/parent chain through the editor store's nodes,
 * collecting members from each ancestor. Returns an array of groups,
 * one per ancestor, ordered from immediate parent to root.
 *
 * @module
 */

import { useMemo } from 'react';
import type { AnyGraphNode, TypeGraphNode } from '../types.js';
import { getRefText, AST_TYPE_TO_NODE_TYPE } from '../adapters/model-helpers.js';

export interface InheritedGroup {
  /** Name of the ancestor type. */
  ancestorName: string;
  /** Namespace of the ancestor. */
  namespace: string;
  /** Kind of the ancestor node. */
  kind: string;
  /** Members inherited from this ancestor (raw AST-shaped objects). */
  members: unknown[];
}

/**
 * Get the parent/super type name from a node's data based on its $type.
 */
function getParentName(d: AnyGraphNode): string | undefined {
  switch (d.$type) {
    case 'Data':
      return getRefText((d as any).superType);
    case 'RosettaEnumeration':
      return getRefText((d as any).parent);
    case 'RosettaFunction':
      return getRefText((d as any).superFunction);
    default:
      return undefined;
  }
}

/**
 * Get the member array from a node based on its $type.
 */
function getMembers(d: AnyGraphNode): unknown[] {
  return ((d as any).attributes ??
    (d as any).enumValues ??
    (d as any).inputs ??
    (d as any).features ??
    []) as unknown[];
}

/**
 * Walk up the parent chain and collect inherited member groups.
 *
 * @param nodeData - The current node's data.
 * @param allNodes - All graph nodes (to resolve parent references).
 * @param maxDepth - Safety limit to prevent cycles (default: 20).
 * @returns Array of inherited groups, one per ancestor (parent first).
 */
export function useInheritedMembers(
  nodeData: AnyGraphNode | null,
  allNodes: TypeGraphNode[],
  maxDepth = 20
): InheritedGroup[] {
  const parentName = nodeData ? getParentName(nodeData) : undefined;
  return useMemo(() => {
    if (!parentName || allNodes.length === 0) return [];

    const groups: InheritedGroup[] = [];
    const visited = new Set<string>();
    let currentParentName: string | undefined = parentName;
    let depth = 0;

    while (currentParentName && depth < maxDepth) {
      if (visited.has(currentParentName)) break; // cycle guard
      visited.add(currentParentName);

      const parentNode = allNodes.find((n) => {
        const pd = n.data as AnyGraphNode;
        return pd.name === currentParentName || `${pd.namespace}::${pd.name}` === currentParentName;
      });

      if (!parentNode) break;

      const pd = parentNode.data as AnyGraphNode;
      const members = getMembers(pd);
      if (members.length > 0) {
        groups.push({
          ancestorName: pd.name as string,
          namespace: pd.namespace as string,
          kind: AST_TYPE_TO_NODE_TYPE[pd.$type] ?? 'data',
          members
        });
      }

      currentParentName = getParentName(pd);
      depth++;
    }

    return groups;
  }, [parentName, allNodes, maxDepth]);
}
