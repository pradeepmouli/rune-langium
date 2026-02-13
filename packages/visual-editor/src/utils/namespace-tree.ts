/**
 * Namespace tree builder — groups graph nodes by namespace
 * for the NamespaceExplorerPanel.
 */

import type { TypeGraphNode, NamespaceTreeNode, NamespaceTypeEntry } from '../types.js';

/**
 * Build a sorted list of namespace tree entries from graph nodes.
 *
 * Groups nodes by `namespace`, counts per kind, and sorts
 * both namespaces and their child types alphabetically.
 */
export function buildNamespaceTree(nodes: TypeGraphNode[]): NamespaceTreeNode[] {
  const nsMap = new Map<string, NamespaceTypeEntry[]>();

  for (const node of nodes) {
    const ns = node.data.namespace;
    if (!nsMap.has(ns)) {
      nsMap.set(ns, []);
    }
    nsMap.get(ns)!.push({
      nodeId: node.id,
      name: node.data.name,
      kind: node.data.kind
    });
  }

  const tree: NamespaceTreeNode[] = [];

  for (const [namespace, types] of nsMap) {
    types.sort((a, b) => a.name.localeCompare(b.name));

    tree.push({
      namespace,
      types,
      totalCount: types.length,
      dataCount: types.filter((t) => t.kind === 'data').length,
      choiceCount: types.filter((t) => t.kind === 'choice').length,
      enumCount: types.filter((t) => t.kind === 'enum').length
    });
  }

  tree.sort((a, b) => a.namespace.localeCompare(b.namespace));

  return tree;
}

/**
 * Filter namespace tree entries by a search query.
 *
 * Matches against both namespace name and type names.
 * Returns tree entries with only matching types (or the full
 * namespace if the namespace name itself matches).
 */
export function filterNamespaceTree(tree: NamespaceTreeNode[], query: string): NamespaceTreeNode[] {
  if (!query.trim()) return tree;

  const regex = new RegExp(query, 'i');
  const results: NamespaceTreeNode[] = [];

  for (const entry of tree) {
    // If namespace name matches, include all types
    if (regex.test(entry.namespace)) {
      results.push(entry);
      continue;
    }

    // Otherwise filter to matching types
    const matchingTypes = entry.types.filter((t) => regex.test(t.name));
    if (matchingTypes.length > 0) {
      results.push({
        ...entry,
        types: matchingTypes,
        totalCount: matchingTypes.length,
        dataCount: matchingTypes.filter((t) => t.kind === 'data').length,
        choiceCount: matchingTypes.filter((t) => t.kind === 'choice').length,
        enumCount: matchingTypes.filter((t) => t.kind === 'enum').length
      });
    }
  }

  return results;
}
