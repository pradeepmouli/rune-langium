/**
 * Edit-time validator for the visual editor (T076).
 *
 * Provides lightweight validation functions that can be called before
 * applying edit commands to prevent invalid operations.
 *
 * These wrap / complement the core RuneDslValidator rules:
 * - S-01: No duplicate attributes / type names
 * - S-02: Circular inheritance detection
 * - S-04: Cardinality bounds
 * - S-05: No duplicate enum value names within an enum
 * - S-06: Empty type/enum/choice name
 * - S-07: Invalid name characters per Rune DSL identifier rules
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
// Duplicate enum value detection (S-05)
// ---------------------------------------------------------------------------

/**
 * Check if an enum value name already exists within the specified enum node.
 */
export function detectDuplicateEnumValue(
  valueName: string,
  nodeId: string,
  nodes: TypeGraphNode[]
): boolean {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || node.data.kind !== 'enum') return false;
  return node.data.members.some((m) => m.name === valueName);
}

// ---------------------------------------------------------------------------
// Empty name detection (S-06)
// ---------------------------------------------------------------------------

/**
 * Validate that a name is non-empty after trimming whitespace.
 *
 * Returns null if valid, or an error message string if invalid.
 */
export function validateNotEmpty(name: string, context = 'Name'): string | null {
  if (!name || !name.trim()) {
    return `${context} cannot be empty`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Invalid identifier characters (S-07)
// ---------------------------------------------------------------------------

/**
 * Valid Rune DSL identifier pattern.
 *
 * Identifiers must start with a letter or underscore and contain
 * only letters, digits, and underscores.
 */
const RUNE_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate that a name conforms to Rune DSL identifier rules.
 *
 * Returns null if valid, or an error message string if invalid.
 */
export function validateIdentifier(name: string): string | null {
  if (!name || !name.trim()) {
    return 'Name cannot be empty';
  }
  if (!RUNE_IDENTIFIER_PATTERN.test(name)) {
    return `Invalid identifier: "${name}". Must start with a letter or underscore and contain only letters, digits, and underscores.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Expression parse-validation (placeholder)
// ---------------------------------------------------------------------------

/**
 * Result of validating a Rune DSL expression.
 */
export interface ExpressionValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate an expression string.
 *
 * This is a lightweight client-side check. Full parsing validation
 * runs in the web worker parse pipeline. This function performs basic
 * structural checks (balanced parentheses, non-empty).
 *
 * @param expression - The expression text to validate.
 * @returns Validation result with error message if invalid.
 */
export function validateExpression(expression: string): ExpressionValidationResult {
  if (!expression || !expression.trim()) {
    return { valid: false, error: 'Expression cannot be empty' };
  }

  // Check balanced parentheses
  let depth = 0;
  for (const ch of expression) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) {
      return { valid: false, error: 'Unbalanced parentheses: unexpected ")"' };
    }
  }
  if (depth !== 0) {
    return { valid: false, error: 'Unbalanced parentheses: missing ")"' };
  }

  return { valid: true };
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

  // S-05: Check for duplicate enum value names within each enum
  for (const node of nodes) {
    if (node.data.kind !== 'enum') continue;
    const valueNames = new Set<string>();
    for (const member of node.data.members) {
      if (valueNames.has(member.name)) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: `Duplicate enum value: "${member.name}"`,
          ruleId: 'S-05'
        });
      }
      valueNames.add(member.name);
    }
  }

  // S-06: Check for empty type names
  for (const node of nodes) {
    if (!node.data.name || !node.data.name.trim()) {
      errors.push({
        nodeId: node.id,
        severity: 'error',
        message: 'Type name cannot be empty',
        ruleId: 'S-06'
      });
    }
  }

  // S-07: Check for invalid name characters
  for (const node of nodes) {
    if (node.data.name && node.data.name.trim()) {
      const identError = validateIdentifier(node.data.name);
      if (identError) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: identError,
          ruleId: 'S-07'
        });
      }
    }
  }

  return errors;
}
