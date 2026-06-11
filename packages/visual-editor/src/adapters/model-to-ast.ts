// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Model → AST adapter.
 *
 * Converts GraphNode<T> data back into serializer-compatible model objects.
 * Since GraphNode<T> = AstNodeModel<T> + GraphMetadata, and AstNodeModel<T>
 * IS the AST shape (minus Langium internals), we just strip graph metadata
 * to recover the AST-compatible objects.
 *
 * Groups nodes by namespace and produces one RosettaModel per namespace.
 */

import type { TypeGraphNode, TypeGraphEdge, AnyGraphNode } from '../types.js';
import { nameFromNodeId, stripGraphMetadata } from '../store/node-projection.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A serializer-compatible model object.
 * Same shape as the legacy SyntheticModel but typed against AstNodeModel.
 */
export interface ModelOutput {
  $type: 'RosettaModel';
  name: string;
  version: string;
  elements: unknown[];
  imports: never[];
}

// Keep legacy type names for backward compatibility
export type SyntheticModel = ModelOutput;
export type SyntheticElement = unknown;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build inheritance lookup from edges.
 */
function buildInheritanceMap(edges: TypeGraphEdge[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const edge of edges) {
    if (edge.data?.kind === 'extends' || edge.data?.kind === 'enum-extends') {
      map.set(edge.source, edge.target);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert graph nodes and edges to serializer-compatible model objects.
 * Groups nodes by namespace and produces one model per namespace.
 */
export function modelsToAst(nodes: TypeGraphNode[], edges: TypeGraphEdge[]): ModelOutput[] {
  const inheritanceMap = buildInheritanceMap(edges);

  // Group nodes by namespace
  const byNamespace = new Map<string, TypeGraphNode[]>();
  for (const node of nodes) {
    const ns = node.meta.namespace;
    if (!byNamespace.has(ns)) byNamespace.set(ns, []);
    byNamespace.get(ns)!.push(node);
  }

  const models: ModelOutput[] = [];

  for (const [namespace, nsNodes] of byNamespace) {
    const elements: unknown[] = [];

    for (const node of nsNodes) {
      const d = node.data as AnyGraphNode;
      const model = stripGraphMetadata(d);

      // Ensure inheritance is reflected in the model
      const parentNodeId = inheritanceMap.get(node.id);
      if (parentNodeId) {
        const parentName = nameFromNodeId(parentNodeId);
        // Strict `{ $refText }` ref shape (Phase 3 prep): the serializer reads
        // `$refText` when `ref` is absent, and hydration re-resolves the real
        // Reference from `$refText` — the synthesized `ref: { name }` was dead weight.
        if (d.$type === 'Data') {
          model.superType = { $refText: parentName };
        } else if (d.$type === 'RosettaEnumeration') {
          model.parent = { $refText: parentName };
        } else if (d.$type === 'RosettaFunction') {
          model.superFunction = { $refText: parentName };
        }
      }

      elements.push(model);
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

// Re-export as graphToModels for backward compatibility
export { modelsToAst as graphToModels };
