/**
 * Edit-time validator for the visual editor (T076).
 *
 * Provides lightweight validation functions that can be called before
 * applying edit commands to prevent invalid operations.
 *
 * These wrap / complement the core RuneDslValidator rules:
 * - S-01: No duplicate attributes
 * - S-02: Circular inheritance detection
 * - S-04: Cardinality bounds
 */

import type { TypeGraphNode, TypeGraphEdge, ValidationError } from '../types.js';

// ---------------------------------------------------------------------------
// Circular inheritance detection (S-02)
// ---------------------------------------------------------------------------

/**
 * Detect whether setting `childId extends parentId` would create a cycle.
 *
 * Walks the inheritance chain from parentId upward; if it reaches childId,
 * a cycle exists.
 */
export function detectCircularInheritance(
  childId: string,
  parentId: string,
  edges: TypeGraphEdge[]
): boolean {
  if (childId === parentId) return true;

  // Build adjacency map: nodeId → parent nodeId (via extends edges)
  const parentMap = new Map<string, string>();
  for (const edge of edges) {
    if (edge.data?.kind === 'extends' || edge.data?.kind === 'enum-extends') {
      parentMap.set(edge.source, edge.target);
    }
  }

  // Walk up from parentId
  const visited = new Set<string>();
  let current: string | undefined = parentId;
  while (current) {
    if (current === childId) return true;
    if (visited.has(current)) break; // already visited — no cycle to childId
    visited.add(current);
    current = parentMap.get(current);
  }

  return false;
}

// ---------------------------------------------------------------------------
// Duplicate name detection (S-01)
// ---------------------------------------------------------------------------

/**
 * Check if a name already exists in the given namespace.
 *
 * When `nodeId` is provided, checks for duplicate attribute names within
 * that node instead of type names.
 */
export function detectDuplicateName(
  name: string,
  namespace: string,
  nodes: TypeGraphNode[],
  nodeId?: string
): boolean {
  if (nodeId) {
    // Check for duplicate attribute within a node
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return false;
    return node.data.members.some((m) => m.name === name);
  }

  // Check for duplicate type name in the namespace
  return nodes.some((n) => n.data.name === name && n.data.namespace === namespace);
}

// ---------------------------------------------------------------------------
// Cardinality validation (S-04)
// ---------------------------------------------------------------------------

/**
 * Validate a cardinality string.
 *
 * Returns null if valid, or an error message string if invalid.
 * Accepts formats: "inf..sup", "(inf..sup)", "inf..*", "(inf..*)"
 */
export function validateCardinality(input: string): string | null {
  if (!input || !input.trim()) {
    return 'Cardinality cannot be empty';
  }

  const cleaned = input.replace(/[()]/g, '').trim();
  const match = cleaned.match(/^(\d+)\.\.(\*|\d+)$/);
  if (!match) {
    return `Invalid cardinality format: "${input}". Expected "inf..sup" or "inf..*"`;
  }

  const inf = parseInt(match[1]!, 10);

  if (inf < 0) {
    return `Lower bound cannot be negative: ${inf}`;
  }

  if (match[2] !== '*') {
    const sup = parseInt(match[2]!, 10);
    if (sup < 0) {
      return `Upper bound cannot be negative: ${sup}`;
    }
    if (inf > sup) {
      return `Lower bound (${inf}) cannot exceed upper bound (${sup})`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Aggregate validation
// ---------------------------------------------------------------------------

/**
 * Run all validations on the current graph state and return errors.
 */
export function validateGraph(nodes: TypeGraphNode[], edges: TypeGraphEdge[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for duplicate type names within each namespace
  const namespaceNames = new Map<string, Map<string, string[]>>();
  for (const node of nodes) {
    const ns = node.data.namespace;
    if (!namespaceNames.has(ns)) {
      namespaceNames.set(ns, new Map());
    }
    const names = namespaceNames.get(ns)!;
    if (!names.has(node.data.name)) {
      names.set(node.data.name, []);
    }
    names.get(node.data.name)!.push(node.id);
  }

  for (const [_ns, names] of namespaceNames) {
    for (const [name, ids] of names) {
      if (ids.length > 1) {
        for (const id of ids) {
          errors.push({
            nodeId: id,
            severity: 'error',
            message: `Duplicate type name: "${name}"`,
            ruleId: 'S-01'
          });
        }
      }
    }
  }

  // Check for circular inheritance
  const parentMap = new Map<string, string>();
  for (const edge of edges) {
    if (edge.data?.kind === 'extends' || edge.data?.kind === 'enum-extends') {
      parentMap.set(edge.source, edge.target);
    }
  }

  for (const [childId, parentId] of parentMap) {
    const visited = new Set<string>();
    let current: string | undefined = parentId;
    while (current) {
      if (current === childId) {
        errors.push({
          nodeId: childId,
          severity: 'error',
          message: 'Circular inheritance detected',
          ruleId: 'S-02'
        });
        break;
      }
      if (visited.has(current)) break;
      visited.add(current);
      current = parentMap.get(current);
    }
  }

  // Check for duplicate attribute names within each type
  for (const node of nodes) {
    const attrNames = new Set<string>();
    for (const member of node.data.members) {
      if (attrNames.has(member.name)) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: `Duplicate attribute name: "${member.name}"`,
          ruleId: 'S-01'
        });
      }
      attrNames.add(member.name);
    }
  }

  return errors;
}
