/**
 * Graph → AST command adapter (T063).
 *
 * Converts ReactFlow graph state (nodes + edges) back into lightweight
 * model objects suitable for serialization via the core serializer.
 *
 * When a graph node carries its `source` AST reference (populated by
 * `astToGraph`), the synthetic model will pass it through so that
 * downstream consumers can access the full Langium type information.
 *
 * NOTE: These are NOT full Langium AST nodes — they're serializer-compatible
 * plain objects containing only the fields the serializer reads plus
 * optional `source` back-references.
 */

import type {
  Data,
  Choice,
  RosettaEnumeration,
  RosettaFunction,
  Attribute,
  ChoiceOption,
  RosettaEnumValue
} from '@rune-langium/core';
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

export type SyntheticElement = SyntheticData | SyntheticChoice | SyntheticEnum | SyntheticFunction;

export interface SyntheticData {
  $type: 'Data';
  name: string;
  definition?: string;
  superType?: { ref?: { name?: string }; $refText?: string };
  attributes: SyntheticAttribute[];
  conditions: never[];
  /** Synonym strings extracted from TypeNodeData.synonyms. */
  synonyms?: string[];
  /** Original AST node when available. */
  source?: Data;
}

export interface SyntheticAttribute {
  name: string;
  override: boolean;
  typeCall: { type: { ref: { name: string }; $refText: string } };
  card: { inf: number; sup?: number; unbounded: boolean };
  /** Original AST node when available. */
  source?: Attribute;
}

export interface SyntheticChoice {
  $type: 'Choice';
  name: string;
  definition?: string;
  attributes: SyntheticChoiceOption[];
  /** Synonym strings extracted from TypeNodeData.synonyms. */
  synonyms?: string[];
  /** Original AST node when available. */
  source?: Choice;
}

export interface SyntheticChoiceOption {
  typeCall: { type: { ref: { name: string }; $refText: string } };
  /** Original AST node when available. */
  source?: ChoiceOption;
}

export interface SyntheticEnum {
  $type: 'RosettaEnumeration';
  name: string;
  definition?: string;
  parent?: { ref?: { name?: string }; $refText?: string };
  enumValues: SyntheticEnumValue[];
  /** Synonym strings extracted from TypeNodeData.synonyms. */
  synonyms?: string[];
  /** Original AST node when available. */
  source?: RosettaEnumeration;
}

export interface SyntheticEnumValue {
  name: string;
  definition?: string;
  display?: string;
  /** Original AST node when available. */
  source?: RosettaEnumValue;
}

export interface SyntheticFunction {
  $type: 'RosettaFunction';
  name: string;
  definition?: string;
  inputs: SyntheticAttribute[];
  output?: SyntheticAttribute;
  /** Original AST node when available. */
  source?: RosettaFunction;
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
    card: parseCardinality(member.cardinality),
    source: member.source as Attribute | undefined
  };
}

function memberToChoiceOption(member: MemberDisplay): SyntheticChoiceOption {
  const typeName = member.typeName ?? member.name;
  return {
    typeCall: {
      type: { ref: { name: typeName }, $refText: typeName }
    },
    source: member.source as ChoiceOption | undefined
  };
}

function memberToEnumValue(member: MemberDisplay): SyntheticEnumValue {
  const enumVal = member.source as RosettaEnumValue | undefined;
  return {
    name: member.name,
    definition: enumVal?.definition,
    display: member.displayName ?? enumVal?.display,
    source: enumVal
  };
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
          conditions: [],
          synonyms: data.synonyms,
          source: data.source as Data | undefined
        };
        elements.push(element);
      } else if (data.kind === 'choice') {
        const element: SyntheticChoice = {
          $type: 'Choice',
          name: data.name,
          definition: data.definition,
          attributes: data.members.map(memberToChoiceOption),
          synonyms: data.synonyms,
          source: data.source as Choice | undefined
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
          enumValues: data.members.map(memberToEnumValue),
          synonyms: data.synonyms,
          source: data.source as RosettaEnumeration | undefined
        };
        elements.push(element);
      } else if (data.kind === 'func') {
        const outputTypeName = data.outputType ?? 'string';
        const element: SyntheticFunction = {
          $type: 'RosettaFunction',
          name: data.name,
          definition: data.definition,
          inputs: data.members.map(memberToAttribute),
          output: {
            name: 'output',
            override: false,
            typeCall: {
              type: { ref: { name: outputTypeName }, $refText: outputTypeName }
            },
            card: { inf: 1, sup: 1, unbounded: false }
          },
          source: data.source as RosettaFunction | undefined
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
