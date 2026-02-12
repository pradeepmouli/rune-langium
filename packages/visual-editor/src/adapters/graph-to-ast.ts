/**
 * Graph → AST command adapter (T063).
 *
 * Converts ReactFlow graph state (nodes + edges) back into lightweight
 * model objects suitable for serialization via the core serializer.
 *
 * NOTE: These are NOT full Langium AST nodes — they're serializer-compatible
 * plain objects containing only the fields the serializer reads.
 */

import type { TypeGraphNode, TypeGraphEdge, TypeNodeData, MemberDisplay } from '../types.js';

/**
 * A serializer-compatible model object.
 */
export interface SyntheticModel {
  $type: 'RosettaModel';
  name: string;
  version: string;
  elements: SyntheticElement[];
  imports: never[];
}

export type SyntheticElement = SyntheticData | SyntheticChoice | SyntheticEnum;

export interface SyntheticData {
  $type: 'Data';
  name: string;
  definition?: string;
  superType?: { ref?: { name?: string }; $refText?: string };
  attributes: SyntheticAttribute[];
  conditions: never[];
}

export interface SyntheticAttribute {
  name: string;
  override: boolean;
  typeCall: { type: { ref: { name: string }; $refText: string } };
  card: { inf: number; sup?: number; unbounded: boolean };
}

export interface SyntheticChoice {
  $type: 'Choice';
  name: string;
  definition?: string;
  attributes: SyntheticChoiceOption[];
}

export interface SyntheticChoiceOption {
  typeCall: { type: { ref: { name: string }; $refText: string } };
}

export interface SyntheticEnum {
  $type: 'RosettaEnumeration';
  name: string;
  definition?: string;
  parent?: { ref?: { name?: string }; $refText?: string };
  enumValues: SyntheticEnumValue[];
}

export interface SyntheticEnumValue {
  name: string;
  definition?: string;
  display?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCardinality(card?: string): {
  inf: number;
  sup?: number;
  unbounded: boolean;
} {
  if (!card) {
    return { inf: 1, sup: 1, unbounded: false };
  }

  // Parse (inf..sup) or (inf..*)
  const match = card.match(/\(?(\d+)\.\.(\*|\d+)\)?/);
  if (!match) {
    return { inf: 1, sup: 1, unbounded: false };
  }

  const inf = parseInt(match[1]!, 10);
  if (match[2] === '*') {
    return { inf, unbounded: true };
  }
  const sup = parseInt(match[2]!, 10);
  return { inf, sup, unbounded: false };
}

function memberToAttribute(member: MemberDisplay): SyntheticAttribute {
  const typeName = member.typeName ?? 'string';
  return {
    name: member.name,
    override: member.isOverride,
    typeCall: {
      type: { ref: { name: typeName }, $refText: typeName }
    },
    card: parseCardinality(member.cardinality)
  };
}

function memberToChoiceOption(member: MemberDisplay): SyntheticChoiceOption {
  const typeName = member.typeName ?? member.name;
  return {
    typeCall: {
      type: { ref: { name: typeName }, $refText: typeName }
    }
  };
}

function memberToEnumValue(member: MemberDisplay): SyntheticEnumValue {
  return { name: member.name };
}

// ---------------------------------------------------------------------------
// Build inheritance lookup from edges
// ---------------------------------------------------------------------------

function buildInheritanceMap(edges: TypeGraphEdge[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const edge of edges) {
    if (edge.data?.kind === 'extends' || edge.data?.kind === 'enum-extends') {
      map.set(edge.source, edge.target);
    }
  }
  return map;
}

/**
 * Extract parent name from a node ID like "namespace::ParentName".
 */
function nameFromNodeId(nodeId: string): string {
  const parts = nodeId.split('::');
  return parts.length > 1 ? parts[parts.length - 1]! : nodeId;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert graph nodes and edges to serializer-compatible model objects.
 *
 * Groups nodes by namespace and produces one model per namespace.
 */
export function graphToModels(nodes: TypeGraphNode[], edges: TypeGraphEdge[]): SyntheticModel[] {
  const inheritanceMap = buildInheritanceMap(edges);

  // Group nodes by namespace
  const byNamespace = new Map<string, TypeGraphNode[]>();
  for (const node of nodes) {
    const ns = node.data.namespace;
    if (!byNamespace.has(ns)) {
      byNamespace.set(ns, []);
    }
    byNamespace.get(ns)!.push(node);
  }

  const models: SyntheticModel[] = [];

  for (const [namespace, nsNodes] of byNamespace) {
    const elements: SyntheticElement[] = [];

    for (const node of nsNodes) {
      const data: TypeNodeData = node.data;

      if (data.kind === 'data') {
        const parentNodeId = inheritanceMap.get(node.id);
        const parentName =
          data.parentName ?? (parentNodeId ? nameFromNodeId(parentNodeId) : undefined);

        const element: SyntheticData = {
          $type: 'Data',
          name: data.name,
          definition: data.definition,
          superType: parentName ? { ref: { name: parentName }, $refText: parentName } : undefined,
          attributes: data.members.map(memberToAttribute),
          conditions: []
        };
        elements.push(element);
      } else if (data.kind === 'choice') {
        const element: SyntheticChoice = {
          $type: 'Choice',
          name: data.name,
          definition: data.definition,
          attributes: data.members.map(memberToChoiceOption)
        };
        elements.push(element);
      } else if (data.kind === 'enum') {
        const parentNodeId = inheritanceMap.get(node.id);
        const parentName =
          data.parentName ?? (parentNodeId ? nameFromNodeId(parentNodeId) : undefined);

        const element: SyntheticEnum = {
          $type: 'RosettaEnumeration',
          name: data.name,
          definition: data.definition,
          parent: parentName ? { ref: { name: parentName }, $refText: parentName } : undefined,
          enumValues: data.members.map(memberToEnumValue)
        };
        elements.push(element);
      }
    }

    models.push({
      $type: 'RosettaModel',
      name: namespace,
      version: '0.0.0',
      elements,
      imports: []
    });
  }

  return models;
}
