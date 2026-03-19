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
import {
  getRefText,
  AST_TYPE_TO_NODE_TYPE,
  getTypeRefText,
  formatCardinality
} from '../adapters/model-helpers.js';

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

// ---------------------------------------------------------------------------
// Merged list types
// ---------------------------------------------------------------------------

export type MergedAttributeEntry =
  | {
      isLocal: true;
      /** Stable key from useFieldArray. */
      id: string;
      /** Index in the useFieldArray `fields` array. */
      fieldIndex: number;
      name: string;
    }
  | {
      isLocal: false;
      /** Stable key: `inherited-{ancestorName}-{name}`. */
      id: string;
      name: string;
      typeName: string;
      cardinality: string;
      inheritedFrom: { ancestorName: string; inheritanceDepth: number };
      rawMember: unknown;
    };

export type MergedEnumValueEntry =
  | {
      isLocal: true;
      id: string;
      fieldIndex: number;
      name: string;
    }
  | {
      isLocal: false;
      id: string;
      name: string;
      displayName: string;
      inheritedFrom: { ancestorName: string; inheritanceDepth: number };
      rawMember: unknown;
    };

// ---------------------------------------------------------------------------
// Builder functions
// ---------------------------------------------------------------------------

/**
 * Build a flat merged attribute list: local entries first (in field order),
 * then inherited entries (nearest ancestor first).  A local entry with the
 * same name as an inherited entry shadows the inherited one.
 */
export function buildMergedAttributeList(
  localFields: Array<{ id: string; name?: string }>,
  inheritedGroups: InheritedGroup[]
): MergedAttributeEntry[] {
  const localNames = new Set(localFields.map((f) => (f as any).name ?? ''));

  const localEntries: MergedAttributeEntry[] = localFields.map((f, i) => ({
    isLocal: true as const,
    id: f.id,
    fieldIndex: i,
    name: (f as any).name ?? ''
  }));

  const inheritedEntries: MergedAttributeEntry[] = [];
  const seenNames = new Set(localNames);

  inheritedGroups.forEach((group, depth) => {
    for (const member of group.members) {
      const m = member as any;
      const name: string = m.name ?? '';
      if (!seenNames.has(name)) {
        seenNames.add(name);
        inheritedEntries.push({
          isLocal: false as const,
          id: `inherited:${group.ancestorName}:${name}`,
          name,
          typeName: getTypeRefText(m.typeCall) ?? 'string',
          cardinality: formatCardinality(m.card) || '(1..1)',
          inheritedFrom: { ancestorName: group.ancestorName, inheritanceDepth: depth + 1 },
          rawMember: member
        });
      }
    }
  });

  return [...localEntries, ...inheritedEntries];
}

/**
 * Build a flat merged enum value list: local entries first, then inherited
 * entries (nearest ancestor first). Local names shadow inherited.
 */
export function buildMergedEnumValueList(
  localFields: Array<{ id: string; name?: string }>,
  inheritedGroups: InheritedGroup[]
): MergedEnumValueEntry[] {
  const localNames = new Set(localFields.map((f) => (f as any).name ?? ''));

  const localEntries: MergedEnumValueEntry[] = localFields.map((f, i) => ({
    isLocal: true as const,
    id: f.id,
    fieldIndex: i,
    name: (f as any).name ?? ''
  }));

  const inheritedEntries: MergedEnumValueEntry[] = [];
  const seenNames = new Set(localNames);

  inheritedGroups.forEach((group, depth) => {
    for (const member of group.members) {
      const m = member as any;
      const name: string = m.name ?? '';
      if (!seenNames.has(name)) {
        seenNames.add(name);
        inheritedEntries.push({
          isLocal: false as const,
          id: `inherited:${group.ancestorName}:${name}`,
          name,
          displayName: m.display ?? m.displayName ?? '',
          inheritedFrom: { ancestorName: group.ancestorName, inheritanceDepth: depth + 1 },
          rawMember: member
        });
      }
    }
  });

  return [...localEntries, ...inheritedEntries];
}
