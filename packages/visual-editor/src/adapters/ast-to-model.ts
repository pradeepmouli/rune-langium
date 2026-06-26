// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * AST → Model adapter.
 *
 * Converts Rune DSL AST nodes into TypeGraphNode objects for ReactFlow:
 * `node.data` is the pure `Dehydrated<T>` domain payload (lossless, strict
 * `{ $refText }` refs), produced via `parsedAdapter.dehydrate` for live AST
 * elements and `curatedAdapter.parse` for pre-dehydrated JSON; `node.meta`
 * carries the UI/editor metadata sibling.
 */

import {
  isData,
  isChoice,
  isRosettaEnumeration,
  isRosettaFunction,
  isRosettaBasicType,
  isRosettaRecordType,
  isRosettaTypeAlias,
  isAnnotation,
  parsedAdapter,
  curatedAdapter
} from '@rune-langium/core';
import type { RosettaModel, RosettaRootElement } from '@rune-langium/core';
import type { TypeGraphNode, TypeGraphEdge, GraphNodeMeta, GraphFilters, TypeKind } from '../types.js';
import { getTypeRefText, getRefText, formatCardinality, resolveNodeKind } from './model-helpers.js';
import { makeNodeId, makeEdgeId } from '../store/node-projection.js';

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

function passesFilter(kind: TypeKind, namespace: string, name: string, filters?: GraphFilters): boolean {
  if (!filters) return true;
  if (filters.kinds && filters.kinds.length > 0 && !filters.kinds.includes(kind)) return false;
  if (filters.namespaces && filters.namespaces.length > 0 && !filters.namespaces.includes(namespace)) return false;
  if (filters.namePattern) {
    const regex = new RegExp(filters.namePattern, 'i');
    if (!regex.test(name)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Per-kind node builders
// ---------------------------------------------------------------------------

/**
 * True when the element is a live (or structurally-cloned) Langium AST node —
 * it carries runtime linkage (`$container`/`$cstNode`/`$document`) that must be
 * stripped via `parsedAdapter.dehydrate`. Plain already-dehydrated objects
 * (curated JSON, synthetic fixtures) carry none of these and pass through the
 * `curatedAdapter.parse` boundary (an identity cast).
 */
function isLiveAstElement(element: object): boolean {
  const e = element as { $container?: unknown; $cstNode?: unknown; $document?: unknown };
  return e.$container !== undefined || e.$cstNode !== undefined || e.$document !== undefined;
}

function buildGraphNode<T extends { $type: string; name: string }>(
  element: T,
  namespace: string,
  nodeId: string,
  isReadOnly: boolean
): TypeGraphNode {
  const nodeType = resolveNodeKind(element);
  // Phase 3 step 3: `data` is the PURE domain payload (no UI metadata merged
  // in); all UI/editor metadata lives on the `meta` sibling exclusively.
  // Parsed elements go through the LOSSLESS `parsedAdapter.dehydrate`
  // (strict `{ $refText }` refs, `$namespace` stamped, `$cstText` preserved);
  // curated/pre-dehydrated JSON goes through `curatedAdapter.parse`.
  // Note: `comments` is intentionally absent here (not set at read time).
  // langium is not a direct visual-editor dependency — thread the
  // adapters' AstNode constraint structurally.
  const data = (isLiveAstElement(element)
    ? parsedAdapter.dehydrate(element as unknown as Parameters<typeof parsedAdapter.dehydrate>[0])
    : curatedAdapter.parse(element)) as unknown as TypeGraphNode['data'];
  const meta: GraphNodeMeta = {
    namespace,
    errors: [],
    isReadOnly,
    hasExternalRefs: false
  };

  return {
    id: nodeId,
    type: nodeType,
    position: { x: 0, y: 0 },
    data,
    meta
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
          id: makeEdgeId('attribute-ref', { source: nodeId, target: targetNodeId, label: member.name ?? typeName }),
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
 * Each graph node's `data` IS the pure domain payload (AST fields only);
 * UI/editor metadata (namespace, errors, isReadOnly, …) lives on `node.meta`.
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
    const modelUri = (m as unknown as { $document?: { uri?: { toString(): string } } }).$document?.uri?.toString();
    const isReadOnly = modelUri?.startsWith('system://') ?? false;

    for (const element of elements) {
      const name = (element as { name?: string }).name ?? 'unknown';
      const kind = resolveNodeKind(element) as TypeKind;

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
        nodes.push(buildGraphNode(element as { $type: string; name: string }, namespace, nodeId, isReadOnly));
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
      // `$type` is the union discriminant — `d` narrows to Dehydrated<Data>.
      const parentName = getRefText(d.superType);
      if (parentName) {
        const parentNodeId = nameToNodeId.get(parentName);
        if (parentNodeId) {
          edges.push({
            id: makeEdgeId('extends', { source: node.id, target: parentNodeId }),
            source: node.id,
            target: parentNodeId,
            type: 'extends',
            data: { kind: 'extends' }
          });
        }
      }
      // Attribute reference edges
      edges.push(...getAttributeEdges(node.id, (d.attributes ?? []) as unknown as MemberLikeRef[], nameToNodeId));
    } else if ($type === 'Choice') {
      // Choice option edges
      for (const opt of (d.attributes ?? []) as unknown as MemberLikeRef[]) {
        const typeName = getTypeRefText(opt.typeCall);
        if (typeName) {
          const targetNodeId = nameToNodeId.get(typeName);
          if (targetNodeId) {
            edges.push({
              id: makeEdgeId('choice-option', { source: node.id, target: targetNodeId, label: typeName }),
              source: node.id,
              target: targetNodeId,
              type: 'choice-option',
              data: { kind: 'choice-option', label: typeName }
            });
          }
        }
      }
    } else if ($type === 'RosettaEnumeration') {
      const parentName = getRefText(d.parent);
      if (parentName) {
        const parentNodeId = nameToNodeId.get(parentName);
        if (parentNodeId) {
          edges.push({
            id: makeEdgeId('enum-extends', { source: node.id, target: parentNodeId }),
            source: node.id,
            target: parentNodeId,
            type: 'enum-extends',
            data: { kind: 'enum-extends' }
          });
        }
      }
    } else if ($type === 'RosettaFunction') {
      // Input parameter type references
      edges.push(...getAttributeEdges(node.id, (d.inputs ?? []) as unknown as MemberLikeRef[], nameToNodeId));
      // Output type reference
      const outputTypeName = getTypeRefText((d.output as unknown as MemberLikeRef | undefined)?.typeCall);
      if (outputTypeName) {
        const targetNodeId = nameToNodeId.get(outputTypeName);
        if (targetNodeId && targetNodeId !== node.id) {
          edges.push({
            id: makeEdgeId('attribute-ref', { source: node.id, target: targetNodeId, label: 'output' }),
            source: node.id,
            target: targetNodeId,
            type: 'attribute-ref',
            data: { kind: 'attribute-ref', label: 'output' }
          });
        }
      }
      // Super-function inheritance
      const superName = getRefText(d.superFunction);
      if (superName) {
        const parentNodeId = nameToNodeId.get(superName);
        if (parentNodeId) {
          edges.push({
            id: makeEdgeId('extends', { source: node.id, target: parentNodeId }),
            source: node.id,
            target: parentNodeId,
            type: 'extends',
            data: { kind: 'extends' }
          });
        }
      }
    } else if ($type === 'RosettaRecordType') {
      edges.push(...getAttributeEdges(node.id, (d.features ?? []) as unknown as MemberLikeRef[], nameToNodeId));
    } else if ($type === 'RosettaTypeAlias') {
      const targetType = getTypeRefText(d.typeCall as { type?: { $refText?: string } } | undefined);
      if (targetType) {
        const targetNodeId = nameToNodeId.get(targetType);
        if (targetNodeId && targetNodeId !== node.id) {
          edges.push({
            id: makeEdgeId('type-alias-ref', { source: node.id, target: targetNodeId }),
            source: node.id,
            target: targetNodeId,
            type: 'type-alias-ref',
            data: { kind: 'type-alias-ref' }
          });
        }
      }
    }
  }

  // Update hasExternalRefs on the `node.meta` sibling (data stays pure domain)
  for (const node of nodes) {
    const d = node.data;
    const $type = d.$type;
    let members: MemberLikeRef[] | null = null;
    if ($type === 'Data' || $type === 'Annotation') {
      members = (d.attributes ?? []) as unknown as MemberLikeRef[];
    } else if ($type === 'RosettaFunction') {
      members = (d.inputs ?? []) as unknown as MemberLikeRef[];
    } else if ($type === 'RosettaRecordType') {
      members = (d.features ?? []) as unknown as MemberLikeRef[];
    }
    if (members) {
      node.meta.hasExternalRefs = members.some((m) => {
        const t = getTypeRefText(m.typeCall);
        return Boolean(t && !nameToNodeId.has(t));
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
