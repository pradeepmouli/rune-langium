/**
 * useContextFilter — resolves type context for operator filtering.
 *
 * Determines the `expectedType` of a placeholder from its parent node context,
 * allowing the palette to prioritize type-compatible operators.
 *
 * @module
 */

import { useMemo } from 'react';
import type { ExpressionNode } from '../schemas/expression-node-schema.js';
import {
  OPERATOR_CATALOG,
  type OperatorDefinition,
  type OperatorCategory
} from '../components/editors/expression-builder/operator-catalog.js';

// ---------------------------------------------------------------------------
// Type context
// ---------------------------------------------------------------------------

/**
 * Broad type context buckets used for operator filtering.
 * - `numeric`: slot expects a numeric result
 * - `boolean`: slot expects a boolean result
 * - `collection`: slot expects a list/collection
 * - `string`: slot expects a string result
 * - `comparable`: slot expects a value that can participate in comparisons
 * - `any`: no specific type constraint
 */
export type TypeContext = 'numeric' | 'boolean' | 'collection' | 'string' | 'comparable' | 'any';

// ---------------------------------------------------------------------------
// Operator → produced type mapping
// ---------------------------------------------------------------------------

/** $type values whose result is boolean. */
const BOOLEAN_PRODUCERS = new Set([
  'EqualityOperation',
  'ComparisonOperation',
  'LogicalOperation',
  'RosettaContainsExpression',
  'RosettaDisjointExpression',
  'RosettaExistsExpression',
  'RosettaAbsentExpression',
  'RosettaBooleanLiteral'
]);

/** $type values whose result is numeric. */
const NUMERIC_PRODUCERS = new Set([
  'ArithmeticOperation',
  'RosettaCountOperation',
  'SumOperation',
  'RosettaNumberLiteral',
  'RosettaIntLiteral'
]);

/** $type values that produce collections. */
const COLLECTION_PRODUCERS = new Set([
  'FilterOperation',
  'MapOperation',
  'SortOperation',
  'DistinctOperation',
  'FlattenOperation',
  'ReverseOperation',
  'ListLiteral'
]);

/** $type values whose result is a string. */
const STRING_PRODUCERS = new Set(['RosettaStringLiteral', 'ToStringOperation']);

/** $type values whose result is comparable (numeric or string). */
const COMPARABLE_PRODUCERS = new Set([
  // Numeric types are comparable
  'ArithmeticOperation',
  'RosettaCountOperation',
  'SumOperation',
  'RosettaNumberLiteral',
  'RosettaIntLiteral',
  // String types are comparable
  'RosettaStringLiteral',
  'ToStringOperation',
  // Date/time types are comparable
  'ToDateOperation',
  'ToDateTimeOperation',
  'ToZonedDateTimeOperation',
  'ToTimeOperation'
]);

/** $type values that are polymorphic — could produce any type depending on usage. */
const POLYMORPHIC_TYPES = new Set([
  'RosettaFeatureCall',
  'RosettaDeepFeatureCall',
  'RosettaSymbolReference',
  'RosettaConditionalExpression',
  'DefaultOperation',
  'ThenOperation'
]);

// ---------------------------------------------------------------------------
// Resolve type context from parent
// ---------------------------------------------------------------------------

/**
 * Given a parent node and the child slot name, determine what type context
 * the child is expected to produce.
 */
export function resolveTypeContext(
  parentNode: ExpressionNode | null,
  childSlot: string | null
): TypeContext {
  if (!parentNode || !childSlot) return 'any';

  const p = parentNode as Record<string, unknown>;
  const $type = p['$type'] as string;

  // Logical operations: both children should be boolean
  if ($type === 'LogicalOperation') {
    return 'boolean';
  }

  // Arithmetic operations: both children should be numeric
  if ($type === 'ArithmeticOperation') {
    return 'numeric';
  }

  // Conditional: `if` slot expects boolean, then/else are `any`
  if ($type === 'RosettaConditionalExpression') {
    if (childSlot === 'if') return 'boolean';
    return 'any';
  }

  // Collection operations with function: argument expects collection
  if (
    $type === 'FilterOperation' ||
    $type === 'MapOperation' ||
    $type === 'ReduceOperation' ||
    $type === 'SortOperation'
  ) {
    if (childSlot === 'argument') return 'collection';
    // filter body should produce boolean
    if ($type === 'FilterOperation' && childSlot === 'body') return 'boolean';
    return 'any';
  }

  // Unary collection operators: argument expects collection
  if (
    $type === 'RosettaCountOperation' ||
    $type === 'SumOperation' ||
    $type === 'DistinctOperation' ||
    $type === 'FlattenOperation' ||
    $type === 'FirstOperation' ||
    $type === 'LastOperation' ||
    $type === 'ReverseOperation' ||
    $type === 'RosettaOnlyElement'
  ) {
    if (childSlot === 'argument') return 'collection';
    return 'any';
  }

  // Comparison: both sides should be comparable (numeric, string, or date)
  if ($type === 'ComparisonOperation') {
    return 'comparable';
  }

  return 'any';
}

// ---------------------------------------------------------------------------
// Determine if an operator matches a type context
// ---------------------------------------------------------------------------

/**
 * Check whether an operator definition produces a result compatible with the
 * given type context.
 */
export function operatorMatchesContext(op: OperatorDefinition, context: TypeContext): boolean {
  if (context === 'any') return true;

  const $type = op.$type;

  // Polymorphic types always match — they could produce any type
  if (POLYMORPHIC_TYPES.has($type)) return true;

  if (context === 'boolean') {
    return BOOLEAN_PRODUCERS.has($type);
  }

  if (context === 'numeric') {
    return (
      NUMERIC_PRODUCERS.has($type) ||
      // first/last/only-element can extract numeric values from collections
      $type === 'FirstOperation' ||
      $type === 'LastOperation' ||
      $type === 'RosettaOnlyElement' ||
      $type === 'ReduceOperation'
    );
  }

  if (context === 'collection') {
    return COLLECTION_PRODUCERS.has($type);
  }

  if (context === 'string') {
    return STRING_PRODUCERS.has($type);
  }

  if (context === 'comparable') {
    return COMPARABLE_PRODUCERS.has($type);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Find parent of a node in the tree
// ---------------------------------------------------------------------------

interface ParentInfo {
  parent: ExpressionNode;
  slot: string;
}

const CHILD_FIELDS = ['left', 'right', 'argument', 'if', 'ifthen', 'elsethen', 'receiver'] as const;

/**
 * Find the parent of a given node ID in the tree, returning the parent node
 * and the slot name the child occupies.
 */
export function findParentOf(tree: ExpressionNode, targetId: string): ParentInfo | null {
  const n = tree as Record<string, unknown>;

  // Check single-value children
  for (const key of CHILD_FIELDS) {
    const child = n[key];
    if (child && typeof child === 'object' && '$type' in (child as object)) {
      const c = child as Record<string, unknown>;
      if (c['id'] === targetId) return { parent: tree, slot: key };
      const found = findParentOf(child as ExpressionNode, targetId);
      if (found) return found;
    }
  }

  // Lambda: function.body
  const func = n['function'] as Record<string, unknown> | undefined;
  if (func) {
    const body = func['body'];
    if (body && typeof body === 'object' && '$type' in (body as object)) {
      const b = body as Record<string, unknown>;
      if (b['id'] === targetId) return { parent: tree, slot: 'body' };
      const found = findParentOf(body as ExpressionNode, targetId);
      if (found) return found;
    }
  }

  // Switch cases
  const cases = n['cases'];
  if (Array.isArray(cases)) {
    for (const c of cases as Record<string, unknown>[]) {
      const expr = c['expression'];
      if (expr && typeof expr === 'object' && '$type' in (expr as object)) {
        const e = expr as Record<string, unknown>;
        if (e['id'] === targetId) return { parent: tree, slot: 'expression' };
        const found = findParentOf(expr as ExpressionNode, targetId);
        if (found) return found;
      }
    }
  }

  // Constructor values
  const values = n['values'];
  if (Array.isArray(values)) {
    for (const v of values as Record<string, unknown>[]) {
      const val = v['value'];
      if (val && typeof val === 'object' && '$type' in (val as object)) {
        const vv = val as Record<string, unknown>;
        if (vv['id'] === targetId) return { parent: tree, slot: 'value' };
        const found = findParentOf(val as ExpressionNode, targetId);
        if (found) return found;
      }
    }
  }

  // Array children (elements, rawArgs)
  for (const key of ['elements', 'rawArgs'] as const) {
    const arr = n[key];
    if (Array.isArray(arr)) {
      for (const e of arr) {
        if (e && typeof e === 'object' && '$type' in (e as object)) {
          const el = e as Record<string, unknown>;
          if (el['id'] === targetId) return { parent: tree, slot: key };
          const found = findParentOf(e as ExpressionNode, targetId);
          if (found) return found;
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Filtered category type
// ---------------------------------------------------------------------------

export interface AnnotatedOperator extends OperatorDefinition {
  /** Whether this operator is recommended for the current type context. */
  recommended: boolean;
}

export interface FilteredOperatorCategory extends Omit<OperatorCategory, 'operators'> {
  operators: AnnotatedOperator[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns the operator catalog annotated by type context.
 *
 * - `recommended: true` → operator matches the expected type context
 * - `recommended: false` → operator does not match but is still shown (de-emphasized)
 */
export function useContextFilter(
  tree: ExpressionNode,
  targetNodeId: string | null
): {
  context: TypeContext;
  categories: FilteredOperatorCategory[];
} {
  return useMemo(() => {
    if (!targetNodeId) {
      return {
        context: 'any' as TypeContext,
        categories: OPERATOR_CATALOG.map((cat) => ({
          ...cat,
          operators: cat.operators.map((op) => ({ ...op, recommended: true }))
        }))
      };
    }

    const parentInfo = findParentOf(tree, targetNodeId);
    const context = resolveTypeContext(parentInfo?.parent ?? null, parentInfo?.slot ?? null);

    const categories: FilteredOperatorCategory[] = OPERATOR_CATALOG.map((cat) => ({
      ...cat,
      operators: cat.operators.map((op) => ({
        ...op,
        recommended: operatorMatchesContext(op, context)
      }))
    }));

    return { context, categories };
  }, [tree, targetNodeId]);
}
