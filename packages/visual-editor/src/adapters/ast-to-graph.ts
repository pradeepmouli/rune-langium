/**
 * AST → ReactFlow graph adapter.
 *
 * Transforms Rune DSL typed AST (Data, Choice, RosettaEnumeration)
 * into ReactFlow nodes and edges for visualization.
 */

import type {
  TypeGraphNode,
  TypeGraphEdge,
  TypeNodeData,
  EdgeData,
  MemberDisplay,
  GraphFilters,
  TypeKind
} from '../types.js';

/**
 * Options for AST-to-graph conversion.
 */
export interface AstToGraphOptions {
  filters?: GraphFilters;
}

/**
 * Result of AST-to-graph conversion.
 */
export interface AstToGraphResult {
  nodes: TypeGraphNode[];
  edges: TypeGraphEdge[];
}

/**
 * Checks if an AST element is a Data type.
 */
function isDataType(element: unknown): boolean {
  return (element as { $type?: string })?.$type === 'Data';
}

/**
 * Checks if an AST element is a Choice type.
 */
function isChoiceType(element: unknown): boolean {
  return (element as { $type?: string })?.$type === 'Choice';
}

/**
 * Checks if an AST element is a RosettaEnumeration type.
 */
function isEnumType(element: unknown): boolean {
  return (element as { $type?: string })?.$type === 'RosettaEnumeration';
}

/**
 * Checks if a type reference is a basic/primitive type (not a graph node).
 */
function isBasicType(element: unknown): boolean {
  const type = (element as { $type?: string })?.$type;
  return type === 'RosettaBasicType' || type === 'RosettaRecordType';
}

/**
 * Format cardinality for display.
 */
function formatCardinality(card: { inf: number; sup?: number; unbounded: boolean }): string {
  if (card.unbounded) {
    return `(${card.inf}..*)`;
  }
  const sup = card.sup ?? card.inf;
  return `(${card.inf}..${sup})`;
}

/**
 * Get the namespace from a RosettaModel.
 */
function getNamespace(model: unknown): string {
  const m = model as { name?: string | { segments?: string[] } };
  if (typeof m.name === 'string') {
    return m.name;
  }
  if (m.name && typeof m.name === 'object' && 'segments' in m.name) {
    return (m.name as { segments: string[] }).segments.join('.');
  }
  return 'unknown';
}

/**
 * Build a unique node ID from namespace + type name.
 */
function makeNodeId(namespace: string, name: string): string {
  return `${namespace}::${name}`;
}

/**
 * Apply filters to decide if a node should be included.
 */
function passesFilter(
  kind: TypeKind,
  namespace: string,
  name: string,
  filters?: GraphFilters
): boolean {
  if (!filters) return true;

  if (filters.kinds && filters.kinds.length > 0 && !filters.kinds.includes(kind)) {
    return false;
  }

  if (
    filters.namespaces &&
    filters.namespaces.length > 0 &&
    !filters.namespaces.includes(namespace)
  ) {
    return false;
  }

  if (filters.namePattern) {
    const regex = new RegExp(filters.namePattern, 'i');
    if (!regex.test(name)) {
      return false;
    }
  }

  return true;
}

/**
 * Convert one or more RosettaModel AST roots into ReactFlow nodes and edges.
 */
export function astToGraph(
  models: unknown | unknown[],
  options?: AstToGraphOptions
): AstToGraphResult {
  const modelArray = Array.isArray(models) ? models : [models];
  const filters = options?.filters;

  const nodes: TypeGraphNode[] = [];
  const edges: TypeGraphEdge[] = [];
  const nodeIdSet = new Set<string>();

  // First pass: collect all type nodes
  for (const model of modelArray) {
    const m = model as { elements?: unknown[]; name?: unknown };
    const namespace = getNamespace(model);
    const elements = m.elements ?? [];

    for (const element of elements) {
      const el = element as { name?: string; $type?: string };
      const name = el.name ?? 'unknown';

      if (isDataType(element)) {
        if (!passesFilter('data', namespace, name, filters)) continue;

        const data = element as {
          name: string;
          definition?: string;
          superType?: { ref?: { name?: string }; $refText?: string };
          attributes?: Array<{
            name: string;
            typeCall?: { type?: { ref?: unknown; $refText?: string } };
            card?: { inf: number; sup?: number; unbounded: boolean };
            override?: boolean;
          }>;
        };

        const members: MemberDisplay[] = (data.attributes ?? []).map((attr) => ({
          name: attr.name,
          typeName: attr.typeCall?.type?.$refText,
          cardinality: attr.card ? formatCardinality(attr.card) : undefined,
          isOverride: attr.override ?? false
        }));

        const parentRef = data.superType;
        const parentName = parentRef?.ref?.name ?? parentRef?.$refText;

        const nodeId = makeNodeId(namespace, name);
        const hasExternalRefs = members.some((m) => m.typeName && !nodeIdSet.has(m.typeName));

        nodes.push({
          id: nodeId,
          type: 'data',
          position: { x: 0, y: 0 },
          data: {
            kind: 'data',
            name,
            namespace,
            definition: data.definition,
            members,
            parentName,
            hasExternalRefs,
            errors: []
          }
        });
        nodeIdSet.add(nodeId);
      } else if (isChoiceType(element)) {
        if (!passesFilter('choice', namespace, name, filters)) continue;

        const choice = element as {
          name: string;
          definition?: string;
          attributes?: Array<{
            typeCall?: { type?: { ref?: unknown; $refText?: string } };
          }>;
        };

        const members: MemberDisplay[] = (choice.attributes ?? []).map((opt) => ({
          name: opt.typeCall?.type?.$refText ?? 'unknown',
          typeName: opt.typeCall?.type?.$refText,
          isOverride: false
        }));

        const nodeId = makeNodeId(namespace, name);
        nodes.push({
          id: nodeId,
          type: 'choice',
          position: { x: 0, y: 0 },
          data: {
            kind: 'choice',
            name,
            namespace,
            definition: choice.definition,
            members,
            hasExternalRefs: false,
            errors: []
          }
        });
        nodeIdSet.add(nodeId);
      } else if (isEnumType(element)) {
        if (!passesFilter('enum', namespace, name, filters)) continue;

        const enumType = element as {
          name: string;
          definition?: string;
          parent?: { ref?: { name?: string }; $refText?: string };
          enumValues?: Array<{ name: string; definition?: string }>;
        };

        const members: MemberDisplay[] = (enumType.enumValues ?? []).map((v) => ({
          name: v.name,
          isOverride: false
        }));

        const parentRef = enumType.parent;
        const parentName = parentRef?.ref?.name ?? parentRef?.$refText;

        const nodeId = makeNodeId(namespace, name);
        nodes.push({
          id: nodeId,
          type: 'enum',
          position: { x: 0, y: 0 },
          data: {
            kind: 'enum',
            name,
            namespace,
            definition: enumType.definition,
            members,
            parentName,
            hasExternalRefs: false,
            errors: []
          }
        });
        nodeIdSet.add(nodeId);
      }
    }
  }

  // Second pass: create edges
  // Need to build a lookup from type name → node ID
  const nameToNodeId = new Map<string, string>();
  for (const node of nodes) {
    nameToNodeId.set(node.data.name, node.id);
  }

  for (const node of nodes) {
    const nodeData = node.data;

    // Inheritance edges (extends)
    if (nodeData.parentName) {
      const parentNodeId = nameToNodeId.get(nodeData.parentName);
      if (parentNodeId) {
        const edgeKind: EdgeData['kind'] = nodeData.kind === 'enum' ? 'enum-extends' : 'extends';
        edges.push({
          id: `${node.id}--${edgeKind}--${parentNodeId}`,
          source: node.id,
          target: parentNodeId,
          type: edgeKind,
          data: { kind: edgeKind }
        });
      }
    }

    // Attribute reference edges (Data types)
    if (nodeData.kind === 'data') {
      for (const member of nodeData.members) {
        if (member.typeName) {
          const targetNodeId = nameToNodeId.get(member.typeName);
          if (targetNodeId && targetNodeId !== node.id) {
            edges.push({
              id: `${node.id}--attribute-ref--${member.name}--${targetNodeId}`,
              source: node.id,
              target: targetNodeId,
              type: 'attribute-ref',
              data: {
                kind: 'attribute-ref',
                label: member.name,
                cardinality: member.cardinality
              }
            });
          }
        }
      }
    }

    // Choice option edges
    if (nodeData.kind === 'choice') {
      for (const member of nodeData.members) {
        if (member.typeName) {
          const targetNodeId = nameToNodeId.get(member.typeName);
          if (targetNodeId) {
            edges.push({
              id: `${node.id}--choice-option--${member.typeName}--${targetNodeId}`,
              source: node.id,
              target: targetNodeId,
              type: 'choice-option',
              data: { kind: 'choice-option', label: member.typeName }
            });
          }
        }
      }
    }
  }

  // Update hasExternalRefs now that we know all node IDs
  for (const node of nodes) {
    if (node.data.kind === 'data') {
      node.data.hasExternalRefs = node.data.members.some(
        (m) => m.typeName && !nameToNodeId.has(m.typeName)
      );
    }
  }

  // Filter orphans if requested
  if (filters?.hideOrphans) {
    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }
    const filteredNodes = nodes.filter((n) => connectedNodeIds.has(n.id));
    return { nodes: filteredNodes, edges };
  }

  return { nodes, edges };
}
