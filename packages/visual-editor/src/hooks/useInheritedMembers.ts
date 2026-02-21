/**
 * useInheritedMembers — Resolves the inheritance chain for a graph node.
 *
 * Walks up the `parentName` chain through the editor store's nodes,
 * collecting members from each ancestor. Returns an array of groups,
 * one per ancestor, ordered from immediate parent to root.
 *
 * @module
 */

import { useMemo } from 'react';
import type { MemberDisplay, TypeNodeData } from '../types.js';

export interface InheritedGroup {
  /** Name of the ancestor type. */
  ancestorName: string;
  /** Namespace of the ancestor. */
  namespace: string;
  /** Kind of the ancestor node. */
  kind: string;
  /** Members inherited from this ancestor. */
  members: MemberDisplay[];
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
  nodeData: TypeNodeData | null,
  allNodes: Array<{ data: TypeNodeData }>,
  maxDepth = 20
): InheritedGroup[] {
  return useMemo(() => {
    if (!nodeData?.parentName || allNodes.length === 0) return [];

    const groups: InheritedGroup[] = [];
    const visited = new Set<string>();
    let currentParentName: string | undefined = nodeData.parentName;
    let depth = 0;

    while (currentParentName && depth < maxDepth) {
      if (visited.has(currentParentName)) break; // cycle guard
      visited.add(currentParentName);

      const parentNode = allNodes.find(
        (n) =>
          n.data.name === currentParentName ||
          `${n.data.namespace}::${n.data.name}` === currentParentName
      );

      if (!parentNode) break;

      if (parentNode.data.members.length > 0) {
        groups.push({
          ancestorName: parentNode.data.name,
          namespace: parentNode.data.namespace,
          kind: parentNode.data.kind,
          members: parentNode.data.members
        });
      }

      currentParentName = parentNode.data.parentName;
      depth++;
    }

    return groups;
  }, [nodeData?.parentName, allNodes, maxDepth]);
}
