/**
 * Tests for expression build flow — clicking through to create expressions.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  OPERATOR_CATALOG,
  ALL_OPERATORS
} from '../../src/components/editors/expression-builder/operator-catalog.js';

describe('operator catalog', () => {
  it('has all expected categories', () => {
    const ids = OPERATOR_CATALOG.map((c) => c.id);
    expect(ids).toContain('arithmetic');
    expect(ids).toContain('comparison');
    expect(ids).toContain('logic');
    expect(ids).toContain('navigation');
    expect(ids).toContain('collection');
    expect(ids).toContain('control');
    expect(ids).toContain('literal');
  });

  it('all operators have createNode that returns valid nodes', () => {
    let counter = 0;
    const uid = () => `test-${counter++}`;

    for (const op of ALL_OPERATORS) {
      const node = op.createNode(uid);
      const n = node as Record<string, unknown>;
      expect(n['$type']).toBe(op.$type);
      expect(n['id']).toBeTruthy();
    }
  });

  it('binary operators create nodes with placeholder children', () => {
    let counter = 0;
    const uid = () => `test-${counter++}`;

    const addOp = OPERATOR_CATALOG.find((c) => c.id === 'arithmetic')!.operators[0];
    const node = addOp.createNode(uid) as Record<string, unknown>;
    expect(node['$type']).toBe('ArithmeticOperation');
    expect(node['operator']).toBe('+');
    expect((node['left'] as Record<string, unknown>)['$type']).toBe('Placeholder');
    expect((node['right'] as Record<string, unknown>)['$type']).toBe('Placeholder');
  });

  it('lambda operators create nodes with inline function body placeholder', () => {
    let counter = 0;
    const uid = () => `test-${counter++}`;

    const filterOp = OPERATOR_CATALOG.find((c) => c.id === 'collection')!.operators.find(
      (op) => op.label === 'filter'
    )!;
    const node = filterOp.createNode(uid) as Record<string, unknown>;
    expect(node['$type']).toBe('FilterOperation');
    const fn = node['function'] as Record<string, unknown>;
    expect(fn['$type']).toBe('InlineFunction');
    expect((fn['body'] as Record<string, unknown>)['$type']).toBe('Placeholder');
  });

  it('conditional creates if/then/else placeholder children', () => {
    let counter = 0;
    const uid = () => `test-${counter++}`;

    const condOp = OPERATOR_CATALOG.find((c) => c.id === 'control')!.operators.find(
      (op) => op.label === 'if / then / else'
    )!;
    const node = condOp.createNode(uid) as Record<string, unknown>;
    expect(node['$type']).toBe('RosettaConditionalExpression');
    expect((node['if'] as Record<string, unknown>)['$type']).toBe('Placeholder');
    expect((node['ifthen'] as Record<string, unknown>)['$type']).toBe('Placeholder');
    expect((node['elsethen'] as Record<string, unknown>)['$type']).toBe('Placeholder');
  });

  it('ALL_OPERATORS contains all operators from all categories', () => {
    const totalFromCategories = OPERATOR_CATALOG.reduce((sum, c) => sum + c.operators.length, 0);
    expect(ALL_OPERATORS.length).toBe(totalFromCategories);
  });
});
