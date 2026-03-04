/**
 * Tests for deriveUiSchema() — generic schema transformation utility.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { deriveUiSchema } from '../../src/schemas/derive-ui-schema.js';

// Test source schema (mimics a generated z.looseObject)
const TestSchema = z.looseObject({
  $type: z.literal('TestType'),
  name: z.string(),
  value: z.number(),
  ref: z.object({ $refText: z.string() })
});

describe('deriveUiSchema', () => {
  it('returns the source schema unchanged when no options given', () => {
    const derived = deriveUiSchema(TestSchema);
    const result = derived.safeParse({
      $type: 'TestType',
      name: 'a',
      value: 1,
      ref: { $refText: 'x' }
    });
    expect(result.success).toBe(true);
  });

  describe('pick', () => {
    it('selects only specified fields', () => {
      const derived = deriveUiSchema(TestSchema, { pick: ['$type', 'name'] });
      const result = derived.safeParse({ $type: 'TestType', name: 'a' });
      expect(result.success).toBe(true);
    });

    it('rejects unknown fields not in pick list when strict', () => {
      const derived = deriveUiSchema(TestSchema, { pick: ['$type', 'name'] });
      // looseObject passes through extra fields, so they just get ignored
      const result = derived.safeParse({ $type: 'TestType', name: 'a', value: 99 });
      expect(result.success).toBe(true);
    });
  });

  describe('overrides', () => {
    it('replaces field types', () => {
      const derived = deriveUiSchema(TestSchema, {
        overrides: { ref: z.string().min(1) }
      });
      const result = derived.safeParse({
        $type: 'TestType',
        name: 'a',
        value: 1,
        ref: 'resolved-string'
      });
      expect(result.success).toBe(true);
    });

    it('adds validation to existing fields', () => {
      const derived = deriveUiSchema(TestSchema, {
        overrides: { name: z.string().min(3, 'Too short') }
      });
      const short = derived.safeParse({
        $type: 'TestType',
        name: 'ab',
        value: 1,
        ref: { $refText: 'x' }
      });
      expect(short.success).toBe(false);

      const ok = derived.safeParse({
        $type: 'TestType',
        name: 'abc',
        value: 1,
        ref: { $refText: 'x' }
      });
      expect(ok.success).toBe(true);
    });
  });

  describe('extend', () => {
    it('adds UI-only fields', () => {
      const derived = deriveUiSchema(TestSchema, {
        extend: { id: z.string().min(1) }
      });
      const result = derived.safeParse({
        $type: 'TestType',
        name: 'a',
        value: 1,
        ref: { $refText: 'x' },
        id: 'node-1'
      });
      expect(result.success).toBe(true);
    });

    it('validates extended fields', () => {
      const derived = deriveUiSchema(TestSchema, {
        extend: { id: z.string().min(1) }
      });
      const result = derived.safeParse({
        $type: 'TestType',
        name: 'a',
        value: 1,
        ref: { $refText: 'x' },
        id: ''
      });
      expect(result.success).toBe(false);
    });
  });

  describe('omitType', () => {
    it('strips $type from the schema', () => {
      const derived = deriveUiSchema(TestSchema, { omitType: true });
      const result = derived.safeParse({ name: 'a', value: 1, ref: { $refText: 'x' } });
      expect(result.success).toBe(true);
    });
  });

  describe('combined options', () => {
    it('applies pick + overrides + extend + omitType in correct order', () => {
      const derived = deriveUiSchema(TestSchema, {
        pick: ['$type', 'name'],
        overrides: { name: z.string().min(1, 'Required') },
        extend: { parentName: z.string() },
        omitType: true
      });

      const ok = derived.safeParse({ name: 'Test', parentName: 'Parent' });
      expect(ok.success).toBe(true);

      const missing = derived.safeParse({ name: '', parentName: 'Parent' });
      expect(missing.success).toBe(false);
    });

    it('handles expression node pattern: extend with id, override children', () => {
      const exprChild = z.lazy(() => z.any());
      const derived = deriveUiSchema(TestSchema, {
        extend: { id: z.string().min(1) },
        overrides: { ref: exprChild }
      });
      const result = derived.safeParse({
        $type: 'TestType',
        name: 'a',
        value: 1,
        ref: { $type: 'Placeholder', id: 'p1' },
        id: 'n1'
      });
      expect(result.success).toBe(true);
    });
  });
});
