/**
 * AST → ReactFlow graph adapter.
 *
 * Transforms Rune DSL typed AST (Data, Choice, RosettaEnumeration, RosettaFunction)
 * into ReactFlow nodes and edges for visualization.
 *
 * Source AST nodes are attached to each graph node and member so that
 * consumers retain full access to Langium type information without
 * creating a separate taxonomy.
 */

import {
  isData,
  isChoice,
  isRosettaEnumeration,
  isRosettaFunction,
  isRosettaBasicType,
  isRosettaRecordType
} from '@rune-langium/core';
import type {
  RosettaModel,
  RosettaRootElement,
  Data,
  Choice,
  RosettaEnumeration,
  RosettaFunction,
  Attribute,
  ChoiceOption,
  RosettaEnumValue
} from '@rune-langium/core';
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
 * Checks if a type reference target is a basic/primitive type (not a graph node).
 */
function isBasicType(element: unknown): boolean {
  return isRosettaBasicType(element) || isRosettaRecordType(element);
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
function getNamespace(model: RosettaModel): string {
  const name = model.name;
  if (typeof name === 'string') {
    return name;
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

// ---------------------------------------------------------------------------
// Per-kind member extraction (preserves AST source)
// ---------------------------------------------------------------------------

function dataAttributeToMember(attr: Attribute): MemberDisplay<Attribute> {
  return {
    name: attr.name,
    typeName: attr.typeCall?.type?.$refText,
    cardinality: attr.card ? formatCardinality(attr.card) : undefined,
    isOverride: attr.override ?? false,
    source: attr
  };
}

function choiceOptionToMember(opt: ChoiceOption): MemberDisplay<ChoiceOption> {
  return {
    name: opt.typeCall?.type?.$refText ?? 'unknown',
    typeName: opt.typeCall?.type?.$refText,
    isOverride: false,
    source: opt
  };
}

function enumValueToMember(val: RosettaEnumValue): MemberDisplay<RosettaEnumValue> {
  return {
    name: val.name,
    displayName: val.display,
    isOverride: false,
    source: val
  };
}

function functionInputToMember(attr: Attribute): MemberDisplay<Attribute> {
  return {
    name: attr.name,
    typeName: attr.typeCall?.type?.$refText,
    cardinality: attr.card ? formatCardinality(attr.card) : undefined,
    isOverride: false,
    source: attr
  };
}

/**
 * Extract synonym strings from Data/Choice RosettaClassSynonym objects.
 *
 * Each synonym has a `.value?.name` with optional `.value?.path`.
 */
function extractClassSynonyms(
  synonyms: Array<{ value?: { name?: string; path?: string } }>
): string[] {
  return synonyms
    .map((s) => {
      const name = s.value?.name;
      const path = s.value?.path;
      if (!name) return undefined;
      return path ? `${name}->${path}` : name;
    })
    .filter((s): s is string => s !== undefined);
}

/**
 * Extract synonym strings from RosettaEnumeration RosettaSynonym objects.
 *
 * Each synonym has a `.body.values` array of RosettaSynonymValueBase.
 */
function extractEnumSynonyms(
  synonyms: Array<{ body?: { values?: Array<{ name?: string; path?: string }> } }>
): string[] {
  return synonyms
    .flatMap((s) => s.body?.values ?? [])
    .map((v) => {
      if (!v.name) return undefined;
      return v.path ? `${v.name}->${v.path}` : v.name;
    })
    .filter((s): s is string => s !== undefined);
}

// ---------------------------------------------------------------------------
// Per-kind node builders
// ---------------------------------------------------------------------------

function buildDataNode(data: Data, namespace: string, nodeId: string): TypeGraphNode {
  const members = (data.attributes ?? []).map(dataAttributeToMember);
  const parentRef = data.superType;
  const parentName = parentRef?.ref?.name ?? parentRef?.$refText;
  const synonyms = extractClassSynonyms(
    (data.synonyms ?? []) as Array<{ value?: { name?: string; path?: string } }>
  );

  return {
    id: nodeId,
    type: 'data',
    position: { x: 0, y: 0 },
    data: {
      kind: 'data',
      name: data.name,
      namespace,
      definition: data.definition,
      members,
      parentName,
      synonyms: synonyms.length > 0 ? synonyms : undefined,
      hasExternalRefs: false,
      errors: [],
      source: data,
      isReadOnly: false
    } as TypeNodeData<'data'>
  };
}

function buildChoiceNode(choice: Choice, namespace: string, nodeId: string): TypeGraphNode {
  const members = (choice.attributes ?? []).map(choiceOptionToMember);
  const synonyms = extractClassSynonyms(
    (choice.synonyms ?? []) as Array<{ value?: { name?: string; path?: string } }>
  );

  return {
    id: nodeId,
    type: 'choice',
    position: { x: 0, y: 0 },
    data: {
      kind: 'choice',
      name: choice.name,
      namespace,
      definition: choice.definition,
      members,
      synonyms: synonyms.length > 0 ? synonyms : undefined,
      hasExternalRefs: false,
      errors: [],
      source: choice,
      isReadOnly: false
    } as TypeNodeData<'choice'>
  };
}

function buildEnumNode(
  enumType: RosettaEnumeration,
  namespace: string,
  nodeId: string
): TypeGraphNode {
  const members = (enumType.enumValues ?? []).map(enumValueToMember);
  const parentRef = enumType.parent;
  const parentName = parentRef?.ref?.name ?? parentRef?.$refText;
  const synonyms = extractEnumSynonyms(
    (enumType.synonyms ?? []) as Array<{
      body?: { values?: Array<{ name?: string; path?: string }> };
    }>
  );

  return {
    id: nodeId,
    type: 'enum',
    position: { x: 0, y: 0 },
    data: {
      kind: 'enum',
      name: enumType.name,
      namespace,
      definition: enumType.definition,
      members,
      parentName,
      synonyms: synonyms.length > 0 ? synonyms : undefined,
      hasExternalRefs: false,
      errors: [],
      source: enumType,
      isReadOnly: false
    } as TypeNodeData<'enum'>
  };
}

function buildFunctionNode(
  func: RosettaFunction,
  namespace: string,
  nodeId: string
): TypeGraphNode {
  const members = (func.inputs ?? []).map(functionInputToMember);
  const outputAttr = func.output;
  const outputType = outputAttr?.typeCall?.type?.$refText;

  // Extract expression text from the function body using CST nodes.
  // A function body consists of alias (shortcut) declarations, conditions,
  // and operations (set/add), each of which carries a Langium CST node
  // whose `.text` property gives the original source text.
  const bodyParts: string[] = [];

  for (const shortcut of func.shortcuts ?? []) {
    const text = shortcut.$cstNode?.text;
    if (text) bodyParts.push(text.trim());
  }

  for (const condition of func.conditions ?? []) {
    const text = condition.$cstNode?.text;
    if (text) bodyParts.push(text.trim());
  }

  for (const op of func.operations ?? []) {
    const text = op.$cstNode?.text;
    if (text) bodyParts.push(text.trim());
  }

  for (const postCond of func.postConditions ?? []) {
    const text = postCond.$cstNode?.text;
    if (text) bodyParts.push(text.trim());
  }

  const expressionText = bodyParts.length > 0 ? bodyParts.join('\n') : undefined;

  return {
    id: nodeId,
    type: 'func',
    position: { x: 0, y: 0 },
    data: {
      kind: 'func',
      name: func.name,
      namespace,
      definition: func.definition,
      members,
      outputType,
      expressionText,
      hasExternalRefs: false,
      errors: [],
      source: func,
      isReadOnly: false
    } as TypeNodeData<'func'>
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert one or more RosettaModel AST roots into ReactFlow nodes and edges.
 *
 * Each graph node carries a `source` reference to the original Langium AST node,
 * and each member carries a `source` reference to its AST member node, so that
 * rich type metadata (annotations, synonyms, conditions, etc.) remains accessible
 * without a separate type taxonomy.
 */
export function astToGraph(
  models: RosettaModel | RosettaModel[] | unknown | unknown[],
  options?: AstToGraphOptions
): AstToGraphResult {
  const modelArray = Array.isArray(models) ? models : [models];
  const filters = options?.filters;

  const nodes: TypeGraphNode[] = [];
  const edges: TypeGraphEdge[] = [];
  const nodeIdSet = new Set<string>();

  // First pass: collect all type nodes
  for (const model of modelArray) {
    const m = model as RosettaModel;
    const namespace = getNamespace(m);
    const elements: RosettaRootElement[] = (m.elements ?? []) as RosettaRootElement[];

    for (const element of elements) {
      const name = (element as { name?: string }).name ?? 'unknown';

      if (isData(element)) {
        if (!passesFilter('data', namespace, name, filters)) continue;
        const nodeId = makeNodeId(namespace, name);
        if (nodeIdSet.has(nodeId)) continue;
        nodes.push(buildDataNode(element, namespace, nodeId));
        nodeIdSet.add(nodeId);
      } else if (isChoice(element)) {
        if (!passesFilter('choice', namespace, name, filters)) continue;
        const nodeId = makeNodeId(namespace, name);
        if (nodeIdSet.has(nodeId)) continue;
        nodes.push(buildChoiceNode(element, namespace, nodeId));
        nodeIdSet.add(nodeId);
      } else if (isRosettaEnumeration(element)) {
        if (!passesFilter('enum', namespace, name, filters)) continue;
        const nodeId = makeNodeId(namespace, name);
        if (nodeIdSet.has(nodeId)) continue;
        nodes.push(buildEnumNode(element, namespace, nodeId));
        nodeIdSet.add(nodeId);
      } else if (isRosettaFunction(element)) {
        if (!passesFilter('func', namespace, name, filters)) continue;
        const nodeId = makeNodeId(namespace, name);
        if (nodeIdSet.has(nodeId)) continue;
        nodes.push(buildFunctionNode(element, namespace, nodeId));
        nodeIdSet.add(nodeId);
      }
    }
  }

  // Second pass: create edges
  // Build a lookup from type name → node ID.
  // We key by both the bare name and the namespace-qualified ID
  // so cross-namespace references resolve correctly and same-name
  // types in different namespaces don't collide.
  const nameToNodeId = new Map<string, string>();
  for (const node of nodes) {
    // Namespace-qualified key (always unique)
    nameToNodeId.set(node.id, node.id);
    // Bare-name key (last-write wins if duplicate across namespaces)
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

    // Function input/output type reference edges
    if (nodeData.kind === 'func') {
      // Input parameter type references
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
      // Output type reference
      if (nodeData.outputType) {
        const targetNodeId = nameToNodeId.get(nodeData.outputType);
        if (targetNodeId && targetNodeId !== node.id) {
          edges.push({
            id: `${node.id}--attribute-ref--output--${targetNodeId}`,
            source: node.id,
            target: targetNodeId,
            type: 'attribute-ref',
            data: {
              kind: 'attribute-ref',
              label: 'output'
            }
          });
        }
      }
    }
  }

  // Update hasExternalRefs now that we know all node IDs
  for (const node of nodes) {
    if (node.data.kind === 'data' || node.data.kind === 'func') {
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
