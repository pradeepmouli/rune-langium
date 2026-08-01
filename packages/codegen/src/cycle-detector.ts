// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import { isChoice, isData, isRosettaModel, type Choice, type Data, type RosettaModel } from '@rune-langium/core';

/**
 * A directed graph of type references.
 * Nodes are type names; edges represent "A references B" relationships.
 * FR-006 (cycle detection), FR-007 (topological ordering).
 */
export interface TypeReferenceGraph {
  /** All type names in the graph. */
  nodes: string[];
  /** Adjacency list: typeName → [referencedTypeNames]. */
  edges: Map<string, string[]>;
}

/** Ensure `name` is present in `nodes`/`edges`, without duplicating either. */
function ensureNode(name: string, nodes: string[], edges: Map<string, string[]>): void {
  if (!nodes.includes(name)) {
    nodes.push(name);
  }
  if (!edges.has(name)) {
    edges.set(name, []);
  }
}

/** Add a directed edge `from -> to`, ensuring both endpoints exist as nodes. */
function addEdge(from: string, to: string, nodes: string[], edges: Map<string, string[]>): void {
  ensureNode(from, nodes, edges);
  ensureNode(to, nodes, edges);
  const fromEdges = edges.get(from)!;
  if (!fromEdges.includes(to)) {
    fromEdges.push(to);
  }
}

/**
 * Walks all Data and Choice nodes in the given Langium documents and builds
 * a directed type-reference graph. Edges are added for:
 * - `extends` relationships (an edge from the extending type to its parent:
 *   `typeName → superType.name`, so parents emit first)
 * - `Attribute.typeCall.type` references (type → attribute type), including
 *   attributes typed BY a Choice (mirrors Data's own treatment — W2)
 * - `Choice.attributes[].typeCall.type` references (Choice → each option's
 *   Data type) — a Choice must emit AFTER all of its option types, same
 *   ordering constraint as Data → its attribute types.
 *
 * FR-006 (cycle detection prerequisite).
 *
 * @param docs - Parsed Langium documents to scan.
 * @param getNodeId - Derives each node's graph identity from its Data/Choice
 *   AST node. Defaults to the bare `.name`, which is safe when `docs` is
 *   scoped to a single namespace (the emitter pipeline's usage via
 *   `namespace-walker.ts`, where names are already unique). A caller
 *   building a graph across MULTIPLE namespaces (e.g. the studio's
 *   cross-namespace Form Preview) must pass a namespace-qualifying
 *   function instead — two distinct types in different namespaces sharing
 *   a bare name would otherwise collide into the same graph node and
 *   produce a false cycle.
 * @returns A TypeReferenceGraph representing all type relationships.
 */
export function buildTypeReferenceGraph(
  docs: LangiumDocument[],
  getNodeId: (node: Data | Choice) => string = (node) => node.name
): TypeReferenceGraph {
  const nodes: string[] = [];
  const edges: Map<string, string[]> = new Map();

  for (const doc of docs) {
    const model = doc.parseResult?.value;
    if (!model || !isRosettaModel(model)) continue;

    const rosettaModel = model as RosettaModel;
    for (const element of rosettaModel.elements) {
      if (isChoice(element)) {
        const choiceName = getNodeId(element);
        ensureNode(choiceName, nodes, edges);
        for (const option of element.attributes) {
          const optionTypeRef = option.typeCall?.type?.ref;
          if (optionTypeRef && (isData(optionTypeRef) || isChoice(optionTypeRef))) {
            addEdge(choiceName, getNodeId(optionTypeRef), nodes, edges);
          }
        }
        continue;
      }

      if (!isData(element)) continue;

      const typeName = getNodeId(element);
      ensureNode(typeName, nodes, edges);

      // Add extends edge: this type → parent type
      if (element.superType?.ref) {
        addEdge(typeName, getNodeId(element.superType.ref), nodes, edges);
      }

      // Add attribute type reference edges — Data or Choice targets only
      // (primitives have no emission-order dependency).
      for (const attr of element.attributes) {
        const attrTypeRef = attr.typeCall?.type?.ref;
        if (!attrTypeRef) continue;
        if (!isData(attrTypeRef) && !isChoice(attrTypeRef)) continue;
        addEdge(typeName, getNodeId(attrTypeRef), nodes, edges);
      }
    }
  }

  return { nodes, edges };
}

/**
 * Finds all cyclic types in the graph using Tarjan's SCC algorithm.
 * A type is "cyclic" if it is in an SCC of size >= 2, OR if it has
 * a self-referencing edge.
 *
 * FR-006 (cycle detection).
 *
 * @param graph - The type reference graph.
 * @returns A Set of type names that participate in a cycle.
 */
export function findCyclicTypes(graph: TypeReferenceGraph): Set<string> {
  const cyclic = new Set<string>();

  // Tarjan's SCC algorithm
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Map<string, boolean>();
  const stack: string[] = [];
  let counter = 0;

  function strongConnect(v: string): void {
    index.set(v, counter);
    lowlink.set(v, counter);
    counter++;
    stack.push(v);
    onStack.set(v, true);

    const neighbors = graph.edges.get(v) ?? [];
    for (const w of neighbors) {
      if (!index.has(w)) {
        // w has not been visited
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.get(w)) {
        // w is on stack — it's in current SCC
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
      }
    }

    // If v is a root of an SCC, pop the SCC from the stack
    if (lowlink.get(v) === index.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.set(w, false);
        scc.push(w);
      } while (w !== v);

      // Check for self-loops in single-node SCCs
      if (scc.length === 1) {
        const node = scc[0]!;
        const neighbors = graph.edges.get(node) ?? [];
        if (neighbors.includes(node)) {
          // Self-referencing
          cyclic.add(node);
        }
      } else {
        // Multi-node SCC: all are cyclic
        for (const node of scc) {
          cyclic.add(node);
        }
      }
    }
  }

  for (const node of graph.nodes) {
    if (!index.has(node)) {
      strongConnect(node);
    }
  }

  return cyclic;
}
