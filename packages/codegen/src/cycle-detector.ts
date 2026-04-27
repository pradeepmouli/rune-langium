// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { LangiumDocument } from 'langium';
import { isData, isRosettaModel, type RosettaModel } from '@rune-langium/core';

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

/**
 * Walks all Data nodes in the given Langium documents and builds a
 * directed type-reference graph. Edges are added for:
 * - `extends` relationships (superType → parent type)
 * - `Attribute.typeCall.type` references (type → attribute type)
 *
 * FR-006 (cycle detection prerequisite).
 *
 * @param docs - Parsed Langium documents to scan.
 * @returns A TypeReferenceGraph representing all type relationships.
 */
export function buildTypeReferenceGraph(docs: LangiumDocument[]): TypeReferenceGraph {
  const nodes: string[] = [];
  const edges: Map<string, string[]> = new Map();

  for (const doc of docs) {
    const model = doc.parseResult?.value;
    if (!model || !isRosettaModel(model)) continue;

    const rosettaModel = model as RosettaModel;
    for (const element of rosettaModel.elements) {
      if (!isData(element)) continue;

      const typeName = element.name;
      if (!nodes.includes(typeName)) {
        nodes.push(typeName);
      }
      if (!edges.has(typeName)) {
        edges.set(typeName, []);
      }

      const typeEdges = edges.get(typeName)!;

      // Add extends edge: this type → parent type
      if (element.superType?.ref) {
        const parentName = element.superType.ref.name;
        if (!typeEdges.includes(parentName)) {
          typeEdges.push(parentName);
        }
        // Ensure parent is in nodes
        if (!nodes.includes(parentName)) {
          nodes.push(parentName);
          if (!edges.has(parentName)) {
            edges.set(parentName, []);
          }
        }
      }

      // Add attribute type reference edges
      for (const attr of element.attributes) {
        const attrTypeRef = attr.typeCall?.type?.ref;
        if (!attrTypeRef) continue;

        // Only track Data-type references (not primitives)
        if (!isData(attrTypeRef)) continue;

        const refTypeName = attrTypeRef.name;
        if (!typeEdges.includes(refTypeName)) {
          typeEdges.push(refTypeName);
        }
        // Ensure referenced type is in nodes
        if (!nodes.includes(refTypeName)) {
          nodes.push(refTypeName);
          if (!edges.has(refTypeName)) {
            edges.set(refTypeName, []);
          }
        }
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
