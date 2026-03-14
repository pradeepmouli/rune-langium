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

import type { TypeGraphNode, TypeGraphEdge, AnyGraphNode, GraphNode } from '../types.js';
import type {
  Data,
  Choice,
  RosettaEnumeration,
  RosettaFunction,
  RosettaRecordType,
  RosettaTypeAlias,
  RosettaBasicType,
  Annotation
} from '@rune-langium/core';

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

/** GraphMetadata keys to strip when extracting the AST model. */
const GRAPH_META_KEYS = new Set([
  'namespace',
  'position',
  'errors',
  'isReadOnly',
  'hasExternalRefs',
  'comments'
]);

/**
 * Strip GraphMetadata fields from a GraphNode to get the AST model.
 * Returns a plain object with only AST fields.
 */
function stripMetadata(data: AnyGraphNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!GRAPH_META_KEYS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Extract parent name from a node ID like "namespace::ParentName".
 */
function nameFromNodeId(nodeId: string): string {
  const parts = nodeId.split('::');
  return parts.length > 1 ? parts[parts.length - 1]! : nodeId;
}

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
    const ns = (node.data as AnyGraphNode).namespace as string;
    if (!byNamespace.has(ns)) byNamespace.set(ns, []);
    byNamespace.get(ns)!.push(node);
  }

  const models: ModelOutput[] = [];

  for (const [namespace, nsNodes] of byNamespace) {
    const elements: unknown[] = [];

    for (const node of nsNodes) {
      const d = node.data as AnyGraphNode;
      const model = stripMetadata(d);

      // Ensure inheritance is reflected in the model
      const parentNodeId = inheritanceMap.get(node.id);
      if (parentNodeId) {
        const parentName = nameFromNodeId(parentNodeId);
        if (d.$type === 'Data') {
          model.superType = { ref: { name: parentName }, $refText: parentName };
        } else if (d.$type === 'RosettaEnumeration') {
          model.parent = { ref: { name: parentName }, $refText: parentName };
        } else if (d.$type === 'RosettaFunction') {
          model.superFunction = { ref: { name: parentName }, $refText: parentName };
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
