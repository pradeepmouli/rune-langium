// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * AST → Model adapter.
 *
 * Converts Rune DSL AST nodes into GraphNode<T> objects for ReactFlow.
 *
 * The visual editor intentionally uses the AST shape directly, but the
 * runtime objects still carry Langium internals and resolved reference
 * targets that should not reach the client/editor model. We therefore
 * strip those additional fields without introducing a bespoke projection.
 */

import {
  isData,
  isChoice,
  isRosettaEnumeration,
  isRosettaFunction,
  isRosettaBasicType,
  isRosettaRecordType,
  isRosettaTypeAlias,
  isAnnotation
} from '@rune-langium/core';
import type {
  RosettaModel,
  RosettaRootElement,
  Data,
  Choice,
  RosettaEnumeration,
  RosettaFunction,
  RosettaRecordType,
  RosettaTypeAlias
} from '@rune-langium/core';
import type {
  TypeGraphNode,
  TypeGraphEdge,
  AnyGraphNode,
  GraphNode,
  GraphFilters,
  TypeKind
} from '../types.js';
import {
  getTypeRefText,
  getRefText,
  formatCardinality,
  AST_TYPE_TO_NODE_TYPE
} from './model-helpers.js';
import { stripAdditionalAstFields } from './strip-additional-ast-fields.js';

// ---------------------------------------------------------------------------
// Options / Result
// ---------------------------------------------------------------------------

export interface AstToModelOptions {
  filters?: GraphFilters;
}

export interface AstToModelResult {
  nodes: TypeGraphNode[];
  edges: TypeGraphEdge[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNamespace(model: RosettaModel): string {
  return typeof model.name === 'string' ? model.name : 'unknown';
}

function makeNodeId(namespace: string, name: string): string {
  return `${namespace}::${name}`;
}

function passesFilter(
  kind: TypeKind,
  namespace: string,
  name: string,
  filters?: GraphFilters
): boolean {
  if (!filters) return true;
  if (filters.kinds && filters.kinds.length > 0 && !filters.kinds.includes(kind)) return false;
  if (
    filters.namespaces &&
    filters.namespaces.length > 0 &&
    !filters.namespaces.includes(namespace)
  )
    return false;
  if (filters.namePattern) {
    const regex = new RegExp(filters.namePattern, 'i');
    if (!regex.test(name)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Per-kind node builders
// ---------------------------------------------------------------------------

function buildGraphNode<T extends { $type: string; name: string }>(
  element: T,
  namespace: string,
  nodeId: string,
  isReadOnly: boolean
): TypeGraphNode {
  const nodeType = AST_TYPE_TO_NODE_TYPE[element.$type] ?? 'data';
  const astData = stripAdditionalAstFields(element);
  const data = {
    ...astData,
    // GraphMetadata fields:
    namespace,
    position: { x: 0, y: 0 },
    errors: [],
    isReadOnly,
    hasExternalRefs: false
  } as unknown as AnyGraphNode;

  return {
    id: nodeId,
    type: nodeType,
    position: { x: 0, y: 0 },
    data
  };
}

// ---------------------------------------------------------------------------
// Edge helpers
// ---------------------------------------------------------------------------

interface MemberLikeRef {
  name?: string;
  typeCall?: { type?: { $refText?: string } };
  card?: { inf: number; sup?: number; unbounded: boolean };
}

function getAttributeEdges(
  nodeId: string,
  members: MemberLikeRef[],
  nameToNodeId: Map<string, string>
): TypeGraphEdge[] {
  const edges: TypeGraphEdge[] = [];
  for (const member of members) {
    const typeName = getTypeRefText(member.typeCall);
    if (typeName) {
      const targetNodeId = nameToNodeId.get(typeName);
      if (targetNodeId && targetNodeId !== nodeId) {
        edges.push({
          id: `${nodeId}--attribute-ref--${member.name ?? typeName}--${targetNodeId}`,
          source: nodeId,
          target: targetNodeId,
          type: 'attribute-ref',
          data: {
            kind: 'attribute-ref',
            label: member.name ?? typeName,
            cardinality: formatCardinality(member.card)
          }
        });
      }
    }
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert RosettaModel AST roots into ReactFlow nodes and edges.
 *
 * Each graph node's `data` IS the AstNodeModel (AST fields spread)
 * plus GraphMetadata (namespace, position, errors, etc.).
 */
export function astToModel(
  models: RosettaModel | RosettaModel[] | unknown | unknown[],
  options?: AstToModelOptions
): AstToModelResult {
  const modelArray = Array.isArray(models) ? models : [models];
  const filters = options?.filters;

  const nodes: TypeGraphNode[] = [];
  const edges: TypeGraphEdge[] = [];
  const nodeIdSet = new Set<string>();

  // First pass: create nodes
  for (const model of modelArray) {
    const m = model as RosettaModel;
    const namespace = getNamespace(m);
    const elements: RosettaRootElement[] = (m.elements ?? []) as RosettaRootElement[];
    const modelUri = (
      m as unknown as { $document?: { uri?: { toString(): string } } }
    ).$document?.uri?.toString();
    const isReadOnly = modelUri?.startsWith('system://') ?? false;

    for (const element of elements) {
      const name = (element as { name?: string }).name ?? 'unknown';
      const $type = (element as { $type?: string }).$type;
      const kind = (AST_TYPE_TO_NODE_TYPE[$type ?? ''] ?? 'data') as TypeKind;

      if (!passesFilter(kind, namespace, name, filters)) continue;
      const nodeId = makeNodeId(namespace, name);
      if (nodeIdSet.has(nodeId)) continue;

      if (
        isData(element) ||
        isChoice(element) ||
        isRosettaEnumeration(element) ||
        isRosettaFunction(element) ||
        isRosettaRecordType(element) ||
        isRosettaTypeAlias(element) ||
        isRosettaBasicType(element) ||
        isAnnotation(element)
      ) {
        nodes.push(
          buildGraphNode(element as { $type: string; name: string }, namespace, nodeId, isReadOnly)
        );
        nodeIdSet.add(nodeId);
      }
    }
  }

  // Build name → nodeId lookup
  const nameToNodeId = new Map<string, string>();
  for (const node of nodes) {
    nameToNodeId.set(node.id, node.id);
    nameToNodeId.set(node.data.name as string, node.id);
  }

  // Second pass: create edges
  for (const node of nodes) {
    const d = node.data;
    const $type = d.$type;

    // Inheritance edges
    if ($type === 'Data') {
      const data = d as GraphNode<Data>;
      const parentName = getRefText(data.superType as { $refText?: string } | undefined);
      if (parentName) {
        const parentNodeId = nameToNodeId.get(parentName);
        if (parentNodeId) {
          edges.push({
            id: `${node.id}--extends--${parentNodeId}`,
            source: node.id,
            target: parentNodeId,
            type: 'extends',
            data: { kind: 'extends' }
          });
        }
      }
      // Attribute reference edges
      edges.push(
        ...getAttributeEdges(
          node.id,
          (data.attributes ?? []) as unknown as MemberLikeRef[],
          nameToNodeId
        )
      );
    } else if ($type === 'Choice') {
      const choice = d as GraphNode<Choice>;
      // Choice option edges
      for (const opt of (choice.attributes ?? []) as unknown as MemberLikeRef[]) {
        const typeName = getTypeRefText(opt.typeCall);
        if (typeName) {
          const targetNodeId = nameToNodeId.get(typeName);
          if (targetNodeId) {
            edges.push({
              id: `${node.id}--choice-option--${typeName}--${targetNodeId}`,
              source: node.id,
              target: targetNodeId,
              type: 'choice-option',
              data: { kind: 'choice-option', label: typeName }
            });
          }
        }
      }
    } else if ($type === 'RosettaEnumeration') {
      const enumData = d as GraphNode<RosettaEnumeration>;
      const parentName = getRefText(enumData.parent as { $refText?: string } | undefined);
      if (parentName) {
        const parentNodeId = nameToNodeId.get(parentName);
        if (parentNodeId) {
          edges.push({
            id: `${node.id}--enum-extends--${parentNodeId}`,
            source: node.id,
            target: parentNodeId,
            type: 'enum-extends',
            data: { kind: 'enum-extends' }
          });
        }
      }
    } else if ($type === 'RosettaFunction') {
      const func = d as GraphNode<RosettaFunction>;
      // Input parameter type references
      edges.push(
        ...getAttributeEdges(
          node.id,
          (func.inputs ?? []) as unknown as MemberLikeRef[],
          nameToNodeId
        )
      );
      // Output type reference
      const outputTypeName = getTypeRefText(
        (func.output as unknown as MemberLikeRef | undefined)?.typeCall
      );
      if (outputTypeName) {
        const targetNodeId = nameToNodeId.get(outputTypeName);
        if (targetNodeId && targetNodeId !== node.id) {
          edges.push({
            id: `${node.id}--attribute-ref--output--${targetNodeId}`,
            source: node.id,
            target: targetNodeId,
            type: 'attribute-ref',
            data: { kind: 'attribute-ref', label: 'output' }
          });
        }
      }
      // Super-function inheritance
      const superName = getRefText(func.superFunction as { $refText?: string } | undefined);
      if (superName) {
        const parentNodeId = nameToNodeId.get(superName);
        if (parentNodeId) {
          edges.push({
            id: `${node.id}--extends--${parentNodeId}`,
            source: node.id,
            target: parentNodeId,
            type: 'extends',
            data: { kind: 'extends' }
          });
        }
      }
    } else if ($type === 'RosettaRecordType') {
      const record = d as GraphNode<RosettaRecordType>;
      edges.push(
        ...getAttributeEdges(
          node.id,
          (record.features ?? []) as unknown as MemberLikeRef[],
          nameToNodeId
        )
      );
    } else if ($type === 'RosettaTypeAlias') {
      const alias = d as GraphNode<RosettaTypeAlias>;
      const targetType = getTypeRefText(
        (alias as unknown as { typeCall?: { type?: { $refText?: string } } }).typeCall
      );
      if (targetType) {
        const targetNodeId = nameToNodeId.get(targetType);
        if (targetNodeId && targetNodeId !== node.id) {
          edges.push({
            id: `${node.id}--type-alias-ref--${targetNodeId}`,
            source: node.id,
            target: targetNodeId,
            type: 'type-alias-ref',
            data: { kind: 'type-alias-ref' }
          });
        }
      }
    }
  }

  // Update hasExternalRefs
  for (const node of nodes) {
    const d = node.data;
    const $type = d.$type;
    if ($type === 'Data' || $type === 'Annotation') {
      const members = ((d as GraphNode<Data>).attributes ?? []) as unknown as MemberLikeRef[];
      (d as { hasExternalRefs: boolean }).hasExternalRefs = members.some((m) => {
        const t = getTypeRefText(m.typeCall);
        return t && !nameToNodeId.has(t);
      });
    } else if ($type === 'RosettaFunction') {
      const members = ((d as GraphNode<RosettaFunction>).inputs ??
        []) as unknown as MemberLikeRef[];
      (d as { hasExternalRefs: boolean }).hasExternalRefs = members.some((m) => {
        const t = getTypeRefText(m.typeCall);
        return t && !nameToNodeId.has(t);
      });
    } else if ($type === 'RosettaRecordType') {
      const members = ((d as GraphNode<RosettaRecordType>).features ??
        []) as unknown as MemberLikeRef[];
      (d as { hasExternalRefs: boolean }).hasExternalRefs = members.some((m) => {
        const t = getTypeRefText(m.typeCall);
        return t && !nameToNodeId.has(t);
      });
    }
  }

  // Filter orphans if requested
  if (filters?.hideOrphans) {
    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }
    return { nodes: nodes.filter((n) => connectedNodeIds.has(n.id)), edges };
  }

  return { nodes, edges };
}

// Re-export as astToGraph for backward compatibility
export { astToModel as astToGraph };
