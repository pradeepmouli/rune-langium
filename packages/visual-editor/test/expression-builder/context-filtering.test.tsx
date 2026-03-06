/**
 * Tests for context-aware operator filtering (US4).
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  resolveTypeContext,
  operatorMatchesContext,
  findParentOf,
  type TypeContext
} from '../../src/hooks/useContextFilter.js';
import type { ExpressionNode } from '../../src/schemas/expression-node-schema.js';
import {
  ALL_OPERATORS,
  OPERATOR_CATALOG
} from '../../src/components/editors/expression-builder/operator-catalog.js';

// ---------------------------------------------------------------------------
// Helper: create a node
// ---------------------------------------------------------------------------

function node($type: string, id: string, extra: Record<string, unknown> = {}): ExpressionNode {
  return { $type, id, ...extra } as unknown as ExpressionNode;
}

function placeholder(id: string): ExpressionNode {
  return node('Placeholder', id);
}

// ---------------------------------------------------------------------------
// resolveTypeContext
// ---------------------------------------------------------------------------

describe('resolveTypeContext', () => {
  it('returns "any" when no parent', () => {
    expect(resolveTypeContext(null, null)).toBe('any');
  });

  it('returns "any" when no slot', () => {
    const parent = node('ArithmeticOperation', 'p1');
    expect(resolveTypeContext(parent, null)).toBe('any');
  });

  it('returns "numeric" for ArithmeticOperation children', () => {
    const parent = node('ArithmeticOperation', 'p1', {
      operator: '+',
      left: placeholder('left-ph'),
      right: placeholder('right-ph')
    });
    expect(resolveTypeContext(parent, 'left')).toBe('numeric');
    expect(resolveTypeContext(parent, 'right')).toBe('numeric');
  });

  it('returns "boolean" for LogicalOperation children', () => {
    const parent = node('LogicalOperation', 'p1', {
      operator: 'and',
      left: placeholder('left-ph'),
      right: placeholder('right-ph')
    });
    expect(resolveTypeContext(parent, 'left')).toBe('boolean');
    expect(resolveTypeContext(parent, 'right')).toBe('boolean');
  });

  it('returns "boolean" for conditional if slot, "any" for then/else', () => {
    const parent = node('RosettaConditionalExpression', 'p1', {
      if: placeholder('if-ph'),
      ifthen: placeholder('then-ph'),
      elsethen: placeholder('else-ph')
    });
    expect(resolveTypeContext(parent, 'if')).toBe('boolean');
    expect(resolveTypeContext(parent, 'ifthen')).toBe('any');
    expect(resolveTypeContext(parent, 'elsethen')).toBe('any');
  });

  it('returns "collection" for FilterOperation argument slot', () => {
    const parent = node('FilterOperation', 'p1', {
      operator: 'filter',
      argument: placeholder('arg-ph')
    });
    expect(resolveTypeContext(parent, 'argument')).toBe('collection');
  });

  it('returns "boolean" for FilterOperation body slot', () => {
    const parent = node('FilterOperation', 'p1', {
      operator: 'filter',
      argument: placeholder('arg-ph')
    });
    expect(resolveTypeContext(parent, 'body')).toBe('boolean');
  });

  it('returns "collection" for unary collection operator argument', () => {
    for (const $type of [
      'RosettaCountOperation',
      'SumOperation',
      'DistinctOperation',
      'FlattenOperation',
      'FirstOperation',
      'LastOperation',
      'ReverseOperation',
      'RosettaOnlyElement'
    ]) {
      const parent = node($type, 'p1', { argument: placeholder('arg-ph') });
      expect(resolveTypeContext(parent, 'argument')).toBe('collection');
    }
  });

  it('returns "comparable" for ComparisonOperation children', () => {
    const parent = node('ComparisonOperation', 'p1', {
      operator: '>',
      right: placeholder('right-ph')
    });
    expect(resolveTypeContext(parent, 'right')).toBe('comparable');
  });

  it('returns "any" for unrecognized parent types', () => {
    const parent = node('RosettaFeatureCall', 'p1', {
      receiver: placeholder('r-ph')
    });
    expect(resolveTypeContext(parent, 'receiver')).toBe('any');
  });
});

// ---------------------------------------------------------------------------
// operatorMatchesContext
// ---------------------------------------------------------------------------

describe('operatorMatchesContext', () => {
  it('all operators match "any" context', () => {
    for (const op of ALL_OPERATORS) {
      expect(operatorMatchesContext(op, 'any')).toBe(true);
    }
  });

  it('arithmetic operators match "numeric" context', () => {
    const addOp = ALL_OPERATORS.find((o) => o.label === '+ Add')!;
    expect(operatorMatchesContext(addOp, 'numeric')).toBe(true);
  });

  it('arithmetic operators do not match "boolean" context', () => {
    const addOp = ALL_OPERATORS.find((o) => o.label === '+ Add')!;
    expect(operatorMatchesContext(addOp, 'boolean')).toBe(false);
  });

  it('comparison operators match "boolean" context', () => {
    const eqOp = ALL_OPERATORS.find((o) => o.label === '= Equals')!;
    expect(operatorMatchesContext(eqOp, 'boolean')).toBe(true);
  });

  it('logical operators match "boolean" context', () => {
    const andOp = ALL_OPERATORS.find((o) => o.label === 'and')!;
    expect(operatorMatchesContext(andOp, 'boolean')).toBe(true);
  });

  it('collection operators match "collection" context', () => {
    const filterOp = ALL_OPERATORS.find((o) => o.label === 'filter')!;
    expect(operatorMatchesContext(filterOp, 'collection')).toBe(true);
  });

  it('collection operators do not match "numeric" context for filter/sort/distinct', () => {
    const filterOp = ALL_OPERATORS.find((o) => o.label === 'filter')!;
    expect(operatorMatchesContext(filterOp, 'numeric')).toBe(false);
  });

  it('count/sum match "numeric" context', () => {
    const countOp = ALL_OPERATORS.find((o) => o.label === 'count')!;
    const sumOp = ALL_OPERATORS.find((o) => o.label === 'sum')!;
    expect(operatorMatchesContext(countOp, 'numeric')).toBe(true);
    expect(operatorMatchesContext(sumOp, 'numeric')).toBe(true);
  });

  it('boolean literals match "boolean" context', () => {
    const trueOp = ALL_OPERATORS.find((o) => o.label === 'True')!;
    expect(operatorMatchesContext(trueOp, 'boolean')).toBe(true);
  });

  it('numeric literals match "numeric" context', () => {
    const numOp = ALL_OPERATORS.find((o) => o.label === 'Number')!;
    expect(operatorMatchesContext(numOp, 'numeric')).toBe(true);
  });

  it('string literals do not match "numeric" or "boolean"', () => {
    const strOp = ALL_OPERATORS.find((o) => o.label === 'String')!;
    expect(operatorMatchesContext(strOp, 'numeric')).toBe(false);
    expect(operatorMatchesContext(strOp, 'boolean')).toBe(false);
  });

  it('if/then/else (conditional) is a valid option in all typed contexts', () => {
    const ifOp = ALL_OPERATORS.find((o) => o.label === 'if / then / else')!;
    // Conditional is polymorphic — it can produce any type
    expect(operatorMatchesContext(ifOp, 'boolean')).toBe(true);
    expect(operatorMatchesContext(ifOp, 'numeric')).toBe(true);
    expect(operatorMatchesContext(ifOp, 'collection')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findParentOf
// ---------------------------------------------------------------------------

describe('findParentOf', () => {
  it('returns null for root node', () => {
    const tree = node('ArithmeticOperation', 'root');
    expect(findParentOf(tree, 'root')).toBeNull();
  });

  it('finds parent of a direct child', () => {
    const left = placeholder('left-ph');
    const right = placeholder('right-ph');
    const tree = node('ArithmeticOperation', 'root', {
      operator: '+',
      left,
      right
    });

    const result = findParentOf(tree, 'left-ph');
    expect(result).not.toBeNull();
    expect((result!.parent as Record<string, unknown>)['id']).toBe('root');
    expect(result!.slot).toBe('left');
  });

  it('finds parent of a nested child', () => {
    const deepPh = placeholder('deep-ph');
    const inner = node('ArithmeticOperation', 'inner', {
      operator: '*',
      left: deepPh,
      right: placeholder('other')
    });
    const tree = node('ArithmeticOperation', 'root', {
      operator: '+',
      left: inner,
      right: placeholder('root-right')
    });

    const result = findParentOf(tree, 'deep-ph');
    expect(result).not.toBeNull();
    expect((result!.parent as Record<string, unknown>)['id']).toBe('inner');
    expect(result!.slot).toBe('left');
  });

  it('finds parent in lambda function body', () => {
    const bodyPh = placeholder('body-ph');
    const tree = node('FilterOperation', 'root', {
      operator: 'filter',
      argument: placeholder('arg'),
      function: { $type: 'InlineFunction', body: bodyPh }
    });

    const result = findParentOf(tree, 'body-ph');
    expect(result).not.toBeNull();
    expect(result!.slot).toBe('body');
  });

  it('finds parent in switch case expression', () => {
    const casePh = placeholder('case-ph');
    const tree = node('SwitchOperation', 'root', {
      operator: 'switch',
      argument: placeholder('arg'),
      cases: [{ guard: 'x', expression: casePh }]
    });

    const result = findParentOf(tree, 'case-ph');
    expect(result).not.toBeNull();
    expect(result!.slot).toBe('expression');
  });

  it('finds parent in list elements', () => {
    const elemPh = placeholder('elem-ph');
    const tree = node('ListLiteral', 'root', {
      elements: [elemPh]
    });

    const result = findParentOf(tree, 'elem-ph');
    expect(result).not.toBeNull();
    expect(result!.slot).toBe('elements');
  });

  it('returns null for non-existent ID', () => {
    const tree = node('ArithmeticOperation', 'root', {
      left: placeholder('left'),
      right: placeholder('right')
    });
    expect(findParentOf(tree, 'nonexistent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration: numeric context shows arithmetic operators as recommended
// ---------------------------------------------------------------------------

describe('context filtering integration', () => {
  it('numeric context: arithmetic recommended, logic not', () => {
    const contexts: TypeContext[] = ['numeric'];
    for (const ctx of contexts) {
      const arithmeticCat = OPERATOR_CATALOG.find((c) => c.id === 'arithmetic')!;
      const logicCat = OPERATOR_CATALOG.find((c) => c.id === 'logic')!;

      for (const op of arithmeticCat.operators) {
        expect(operatorMatchesContext(op, ctx)).toBe(true);
      }
      for (const op of logicCat.operators) {
        expect(operatorMatchesContext(op, ctx)).toBe(false);
      }
    }
  });

  it('boolean context: logic and comparison recommended, arithmetic not', () => {
    const ctx: TypeContext = 'boolean';
    const logicCat = OPERATOR_CATALOG.find((c) => c.id === 'logic')!;
    const compCat = OPERATOR_CATALOG.find((c) => c.id === 'comparison')!;
    const arithCat = OPERATOR_CATALOG.find((c) => c.id === 'arithmetic')!;

    for (const op of logicCat.operators) {
      expect(operatorMatchesContext(op, ctx)).toBe(true);
    }
    // Equality/comparison produce boolean
    const eqOps = compCat.operators.filter(
      (o) => o.$type === 'EqualityOperation' || o.$type === 'ComparisonOperation'
    );
    for (const op of eqOps) {
      expect(operatorMatchesContext(op, ctx)).toBe(true);
    }
    // Arithmetic does not produce boolean
    for (const op of arithCat.operators) {
      expect(operatorMatchesContext(op, ctx)).toBe(false);
    }
  });

  it('collection context: filter/map/sort recommended, arithmetic not', () => {
    const ctx: TypeContext = 'collection';
    const collCat = OPERATOR_CATALOG.find((c) => c.id === 'collection')!;
    const arithCat = OPERATOR_CATALOG.find((c) => c.id === 'arithmetic')!;

    const collectionProducers = collCat.operators.filter((o) =>
      [
        'FilterOperation',
        'MapOperation',
        'SortOperation',
        'DistinctOperation',
        'FlattenOperation',
        'ReverseOperation'
      ].includes(o.$type)
    );
    for (const op of collectionProducers) {
      expect(operatorMatchesContext(op, ctx)).toBe(true);
    }
    for (const op of arithCat.operators) {
      expect(operatorMatchesContext(op, ctx)).toBe(false);
    }
  });

  it('filter body context is boolean', () => {
    const bodyPh = placeholder('body-ph');
    const tree = node('FilterOperation', 'root', {
      operator: 'filter',
      argument: placeholder('arg'),
      function: { $type: 'InlineFunction', body: bodyPh }
    });

    const parentInfo = findParentOf(tree, 'body-ph');
    expect(parentInfo).not.toBeNull();
    // The parent returned for function.body is the FilterOperation
    const ctx = resolveTypeContext(parentInfo!.parent, parentInfo!.slot);
    expect(ctx).toBe('boolean');
  });
});
