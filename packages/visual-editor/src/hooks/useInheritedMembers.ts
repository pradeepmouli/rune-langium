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

// Narrow shapes for type-safe access to union members
interface RefShape {
  $refText?: string;
}
interface DataShape {
  superType?: RefShape;
  attributes?: unknown[];
}
interface EnumShape {
  parent?: RefShape;
  enumValues?: unknown[];
}
interface FuncShape {
  superFunction?: RefShape;
  inputs?: unknown[];
}
interface RecordShape {
  features?: unknown[];
}

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
      return getRefText((d as unknown as DataShape).superType);
    case 'RosettaEnumeration':
      return getRefText((d as unknown as EnumShape).parent);
    case 'RosettaFunction':
      return getRefText((d as unknown as FuncShape).superFunction);
    default:
      return undefined;
  }
}

/**
 * Get the member array from a node based on its $type.
 */
function getMembers(d: AnyGraphNode): unknown[] {
  const rec = d as unknown as DataShape & EnumShape & FuncShape & RecordShape;
  return (rec.attributes ?? rec.enumValues ?? rec.inputs ?? rec.features ?? []) as unknown[];
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

interface LocalMemberField {
  id: string;
  name?: string;
}

interface ReferenceTextShape {
  $refText?: string;
}

interface TypeCallShape {
  type?: ReferenceTextShape;
}

interface CardinalityShape {
  inf: number;
  sup?: number;
  unbounded: boolean;
}

interface InheritedAttributeMemberShape {
  name?: string;
  typeCall?: TypeCallShape;
  card?: CardinalityShape;
}

interface InheritedEnumValueMemberShape {
  name?: string;
  display?: string;
  displayName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getLocalMemberName(field: LocalMemberField): string {
  return field.name ?? '';
}

function getInheritedAttributeMember(member: unknown): InheritedAttributeMemberShape | undefined {
  return isRecord(member) ? (member as InheritedAttributeMemberShape) : undefined;
}

function getInheritedEnumValueMember(member: unknown): InheritedEnumValueMemberShape | undefined {
  return isRecord(member) ? (member as InheritedEnumValueMemberShape) : undefined;
}

// ---------------------------------------------------------------------------
// Builder functions
// ---------------------------------------------------------------------------

/**
 * Build a flat merged attribute list: local entries first (in field order),
 * then inherited entries (nearest ancestor first).  A local entry with the
 * same name as an inherited entry shadows the inherited one.
 */
export function buildMergedAttributeList(
  localFields: LocalMemberField[],
  inheritedGroups: InheritedGroup[]
): MergedAttributeEntry[] {
  const localNames = new Set(localFields.map(getLocalMemberName));

  const localEntries: MergedAttributeEntry[] = localFields.map((f, i) => ({
    isLocal: true as const,
    id: f.id,
    fieldIndex: i,
    name: getLocalMemberName(f)
  }));

  const inheritedEntries: MergedAttributeEntry[] = [];
  const seenNames = new Set(localNames);

  inheritedGroups.forEach((group, depth) => {
    for (const member of group.members) {
      const inheritedMember = getInheritedAttributeMember(member);
      const name = inheritedMember?.name ?? '';
      if (!seenNames.has(name)) {
        seenNames.add(name);
        inheritedEntries.push({
          isLocal: false as const,
          id: `inherited:${group.ancestorName}:${name}`,
          name,
          typeName: getTypeRefText(inheritedMember?.typeCall) ?? 'string',
          cardinality: formatCardinality(inheritedMember?.card) || '(1..1)',
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
  localFields: LocalMemberField[],
  inheritedGroups: InheritedGroup[]
): MergedEnumValueEntry[] {
  const localNames = new Set(localFields.map(getLocalMemberName));

  const localEntries: MergedEnumValueEntry[] = localFields.map((f, i) => ({
    isLocal: true as const,
    id: f.id,
    fieldIndex: i,
    name: getLocalMemberName(f)
  }));

  const inheritedEntries: MergedEnumValueEntry[] = [];
  const seenNames = new Set(localNames);

  inheritedGroups.forEach((group, depth) => {
    for (const member of group.members) {
      const inheritedMember = getInheritedEnumValueMember(member);
      const name = inheritedMember?.name ?? '';
      if (!seenNames.has(name)) {
        seenNames.add(name);
        inheritedEntries.push({
          isLocal: false as const,
          id: `inherited:${group.ancestorName}:${name}`,
          name,
          displayName: inheritedMember?.display ?? inheritedMember?.displayName ?? '',
          inheritedFrom: { ancestorName: group.ancestorName, inheritanceDepth: depth + 1 },
          rawMember: member
        });
      }
    }
  });

  return [...localEntries, ...inheritedEntries];
}

// ---------------------------------------------------------------------------
// Effective Members — unified view of local + inherited
// ---------------------------------------------------------------------------

export interface EffectiveEntry {
  id: string;
  name: string;
  source: 'local' | 'inherited';
  typeName?: string;
  cardinality?: string;
  displayName?: string;
  fieldIndex?: number;
  ancestorName?: string;
  inheritanceDepth?: number;
  isOverride: boolean;
  rawMember?: unknown;
}

export interface EffectiveMembersResult {
  effective: EffectiveEntry[];
  overrideNames: Set<string>;
  inheritedNames: Set<string>;
}

/**
 * Compute effective members by merging local + inherited.
 *
 * Local members come from the node's own member array.
 * Inherited members come from walking the parent chain.
 * A local member with the same name as an inherited one is an "override" —
 * the inherited version is excluded from the effective list.
 *
 * Removing a local override causes the inherited member to reappear on re-render.
 */
export function useEffectiveMembers(
  nodeData: AnyGraphNode | null,
  allNodes: TypeGraphNode[],
  localFields?: LocalMemberField[]
): EffectiveMembersResult {
  const inheritedGroups = useInheritedMembers(nodeData, allNodes);

  return useMemo(() => {
    if (!nodeData)
      return { effective: [], overrideNames: new Set<string>(), inheritedNames: new Set<string>() };

    const localMembers = getMembers(nodeData);
    const localNames = new Set<string>();

    const localEntries: EffectiveEntry[] = localMembers.map((member, i) => {
      const m = member as InheritedAttributeMemberShape & InheritedEnumValueMemberShape;
      const name = m.name ?? '';
      localNames.add(name);
      return {
        id: localFields?.[i]?.id ?? `local:${name}:${i}`,
        name,
        source: 'local' as const,
        typeName: getTypeRefText(m.typeCall),
        cardinality: formatCardinality(m.card),
        displayName: m.display ?? m.displayName,
        fieldIndex: i,
        isOverride: false
      };
    });

    const inheritedNames = new Set<string>();
    const inheritedEntries: EffectiveEntry[] = [];
    const seenNames = new Set(localNames);

    for (let depth = 0; depth < inheritedGroups.length; depth++) {
      const group = inheritedGroups[depth]!;
      for (const member of group.members) {
        const m = member as InheritedAttributeMemberShape & InheritedEnumValueMemberShape;
        const name = m.name ?? '';
        inheritedNames.add(name);
        if (!seenNames.has(name)) {
          seenNames.add(name);
          inheritedEntries.push({
            id: `inherited:${group.ancestorName}:${name}`,
            name,
            source: 'inherited' as const,
            typeName: getTypeRefText(m.typeCall),
            cardinality: formatCardinality(m.card),
            displayName: m.display ?? m.displayName,
            ancestorName: group.ancestorName,
            inheritanceDepth: depth + 1,
            isOverride: false,
            rawMember: member
          });
        }
      }
    }

    const overrideNames = new Set<string>();
    for (const entry of localEntries) {
      if (inheritedNames.has(entry.name)) {
        entry.isOverride = true;
        overrideNames.add(entry.name);
      }
    }

    return { effective: [...localEntries, ...inheritedEntries], overrideNames, inheritedNames };
  }, [nodeData, localFields, inheritedGroups]);
}
