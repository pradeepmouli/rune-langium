/**
 * Invalid cardinality validation tests (T075).
 */

import { describe, it, expect } from 'vitest';
import { validateCardinality } from '../../src/validation/edit-validator.js';

describe('Cardinality validation', () => {
  it('should accept valid cardinality 1..1', () => {
    expect(validateCardinality('1..1')).toBeNull();
  });

  it('should accept valid cardinality 0..1', () => {
    expect(validateCardinality('0..1')).toBeNull();
  });

  it('should accept valid cardinality 0..*', () => {
    expect(validateCardinality('0..*')).toBeNull();
  });

  it('should accept valid cardinality 1..*', () => {
    expect(validateCardinality('1..*')).toBeNull();
  });

  it('should accept valid cardinality with parens (1..1)', () => {
    expect(validateCardinality('(1..1)')).toBeNull();
  });

  it('should reject empty cardinality', () => {
    expect(validateCardinality('')).not.toBeNull();
  });

  it('should reject invalid format', () => {
    expect(validateCardinality('abc')).not.toBeNull();
  });

  it('should reject inf > sup (3..1)', () => {
    expect(validateCardinality('3..1')).not.toBeNull();
  });

  it('should reject negative numbers', () => {
    expect(validateCardinality('-1..1')).not.toBeNull();
  });

  it('should accept large range 0..100', () => {
    expect(validateCardinality('0..100')).toBeNull();
  });
});
