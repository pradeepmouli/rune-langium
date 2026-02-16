/**
 * Unit tests for edit-time validation rules (T044).
 *
 * Covers:
 * - S-05: Duplicate enum values
 * - S-06: Empty names (validateNotEmpty)
 * - S-07: Invalid identifier characters (validateIdentifier)
 * - Expression parse-validation (validateExpression)
 */

import { describe, it, expect } from 'vitest';
import {
  validateNotEmpty,
  validateIdentifier,
  validateExpression,
  detectDuplicateEnumValue,
  validateGraph
} from '../../src/validation/edit-validator.js';
import type { TypeGraphNode, TypeGraphEdge } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnumNode(id: string, name: string, values: string[]): TypeGraphNode {
  return {
    id,
    type: 'type',
    position: { x: 0, y: 0 },
    data: {
      kind: 'enum' as const,
      name,
      namespace: 'test',
      members: values.map((v) => ({
        name: v,
        typeName: undefined,
        cardinality: undefined,
        description: undefined,
        isOverride: false
      })),
      parentName: undefined,
      hasExternalRefs: false,
      errors: []
    }
  };
}

function makeDataNode(
  id: string,
  name: string,
  members: Array<{ name: string; typeName?: string }>
): TypeGraphNode {
  return {
    id,
    type: 'type',
    position: { x: 0, y: 0 },
    data: {
      kind: 'data' as const,
      name,
      namespace: 'test',
      members: members.map((m) => ({
        name: m.name,
        typeName: m.typeName,
        cardinality: '(1..1)',
        description: undefined,
        isOverride: false
      })),
      parentName: undefined,
      hasExternalRefs: false,
      errors: []
    }
  };
}

// ---------------------------------------------------------------------------
// validateNotEmpty (S-06)
// ---------------------------------------------------------------------------

describe('validateNotEmpty', () => {
  it('returns error for empty string', () => {
    expect(validateNotEmpty('', 'Name')).toBe('Name cannot be empty');
  });

  it('returns error for whitespace-only string', () => {
    expect(validateNotEmpty('   ', 'Label')).toBe('Label cannot be empty');
  });

  it('returns null for valid string', () => {
    expect(validateNotEmpty('Trade', 'Name')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateIdentifier (S-07)
// ---------------------------------------------------------------------------

describe('validateIdentifier', () => {
  it('accepts valid identifiers', () => {
    expect(validateIdentifier('Trade')).toBeNull();
    expect(validateIdentifier('_private')).toBeNull();
    expect(validateIdentifier('Type99')).toBeNull();
    expect(validateIdentifier('A')).toBeNull();
  });

  it('rejects identifiers starting with a digit', () => {
    expect(validateIdentifier('3Trade')).toBeDefined();
  });

  it('rejects identifiers with spaces', () => {
    expect(validateIdentifier('My Trade')).toBeDefined();
  });

  it('rejects identifiers with special characters', () => {
    expect(validateIdentifier('Trade!')).toBeDefined();
    expect(validateIdentifier('foo-bar')).toBeDefined();
    expect(validateIdentifier('a.b')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// detectDuplicateEnumValue (S-05)
// ---------------------------------------------------------------------------

describe('detectDuplicateEnumValue', () => {
  it('returns true when value already exists in enum node', () => {
    const node = makeEnumNode('e1', 'Currency', ['USD', 'EUR', 'GBP']);
    expect(detectDuplicateEnumValue('USD', 'e1', [node])).toBe(true);
  });

  it('returns false when value is unique', () => {
    const node = makeEnumNode('e1', 'Currency', ['USD', 'EUR', 'GBP']);
    expect(detectDuplicateEnumValue('JPY', 'e1', [node])).toBe(false);
  });

  it('is case-sensitive', () => {
    const node = makeEnumNode('e1', 'Currency', ['USD']);
    expect(detectDuplicateEnumValue('usd', 'e1', [node])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateExpression (balanced parentheses)
// ---------------------------------------------------------------------------

describe('validateExpression', () => {
  it('accepts valid expression with balanced parens', () => {
    expect(validateExpression('foo(bar(x))')).toEqual({ valid: true });
  });

  it('accepts expression without parentheses', () => {
    expect(validateExpression('x + y * z')).toEqual({ valid: true });
  });

  it('rejects empty expression', () => {
    const result = validateExpression('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects whitespace-only expression', () => {
    const result = validateExpression('   ');
    expect(result.valid).toBe(false);
  });

  it('rejects unbalanced open parenthesis', () => {
    const result = validateExpression('foo(bar');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('missing');
  });

  it('rejects unbalanced close parenthesis', () => {
    const result = validateExpression('foo)bar(');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('unexpected');
  });

  it('rejects nested unbalanced parens', () => {
    const result = validateExpression('((())');
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateGraph — S-05, S-06, S-07 integration
// ---------------------------------------------------------------------------

describe('validateGraph — new rules', () => {
  it('S-05: reports duplicate enum values', () => {
    const node = makeEnumNode('e1', 'Color', ['Red', 'Green', 'Red']);
    const errors = validateGraph([node], []);

    const s05 = errors.filter((e) => e.ruleId === 'S-05');
    expect(s05.length).toBeGreaterThan(0);
    expect(s05[0]!.message).toContain('Red');
  });

  it('S-06: reports empty type name', () => {
    const node = makeDataNode('d1', '', []);
    const errors = validateGraph([node], []);

    const s06 = errors.filter((e) => e.ruleId === 'S-06');
    expect(s06.length).toBe(1);
    expect(s06[0]!.message).toContain('empty');
  });

  it('S-07: reports invalid identifier for type name', () => {
    const node = makeDataNode('d1', '3BadName', [{ name: 'foo' }]);
    const errors = validateGraph([node], []);

    const s07 = errors.filter((e) => e.ruleId === 'S-07');
    expect(s07.length).toBe(1);
  });

  it('no false positives for valid graph', () => {
    const node = makeEnumNode('e1', 'Color', ['Red', 'Green', 'Blue']);
    const errors = validateGraph([node], []);

    // Should have no S-05, S-06, or S-07 errors
    const newRules = errors.filter(
      (e) => e.ruleId === 'S-05' || e.ruleId === 'S-06' || e.ruleId === 'S-07'
    );
    expect(newRules.length).toBe(0);
  });
});
