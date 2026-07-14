// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, expect, it } from 'vitest';
import type { FormPreviewSchema } from '@rune-langium/codegen/export';
import { validatePreviewSample } from '../../src/services/preview-validator.js';

describe('validatePreviewSample — array cardinality vs. field.required', () => {
  it('accepts a missing optional (0..*) array field', () => {
    const schema: FormPreviewSchema = {
      schemaVersion: 1,
      targetId: 'test.Trade',
      title: 'Trade',
      status: 'ready',
      fields: [
        {
          path: 'tags',
          label: 'Tags',
          kind: 'array',
          required: false,
          cardinality: { min: 0, max: 'unbounded' },
          children: [{ path: 'tags[]', label: 'Tags item', kind: 'string', required: true }]
        }
      ]
    };

    const result = validatePreviewSample(schema, {});

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('still requires a required (1..*) array field to be present', () => {
    const schema: FormPreviewSchema = {
      schemaVersion: 1,
      targetId: 'test.Trade',
      title: 'Trade',
      status: 'ready',
      fields: [
        {
          path: 'legs',
          label: 'Legs',
          kind: 'array',
          required: true,
          cardinality: { min: 1, max: 'unbounded' },
          children: [{ path: 'legs[]', label: 'Legs item', kind: 'string', required: true }]
        }
      ]
    };

    const result = validatePreviewSample(schema, {});

    expect(result.valid).toBe(false);
  });
});

describe('validatePreviewSample — unknown/extra fields (Codex round-2 finding #1)', () => {
  const schema: FormPreviewSchema = {
    schemaVersion: 1,
    targetId: 'test.Party',
    title: 'Party',
    status: 'ready',
    fields: [{ path: 'name', label: 'Name', kind: 'string', required: true }]
  };

  it('rejects a sample with an extra/unmapped top-level field', () => {
    const result = validatePreviewSample(schema, { name: 'Acme', typo: 'oops' });

    expect(result.valid).toBe(false);
    expect(Object.values(result.errors).some((message) => message.includes('typo'))).toBe(true);
  });

  it('accepts the same sample minus the offending extra field', () => {
    const result = validatePreviewSample(schema, { name: 'Acme' });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('rejects an extra/unmapped field nested inside a required object field', () => {
    const nestedSchema: FormPreviewSchema = {
      schemaVersion: 1,
      targetId: 'test.Trade',
      title: 'Trade',
      status: 'ready',
      fields: [
        {
          path: 'counterparty',
          label: 'Counterparty',
          kind: 'object',
          required: true,
          children: [{ path: 'counterparty.name', label: 'Name', kind: 'string', required: true }]
        }
      ]
    };

    const result = validatePreviewSample(nestedSchema, { counterparty: { name: 'Acme', typo: 'oops' } });

    expect(result.valid).toBe(false);
  });
});

describe('validatePreviewSample — Choice "exactly one option present" (Codex round-2 finding #2)', () => {
  const choiceSchema: FormPreviewSchema = {
    schemaVersion: 1,
    targetId: 'test.PaymentMethod',
    title: 'PaymentMethod',
    kind: 'choice',
    status: 'ready',
    fields: [
      { path: 'cash', label: 'Cash', kind: 'boolean', required: false },
      { path: 'card', label: 'Card', kind: 'string', required: false }
    ]
  };

  it('accepts a sample with exactly one option present', () => {
    const result = validatePreviewSample(choiceSchema, { cash: true });

    expect(result.valid).toBe(true);
  });

  it('rejects a sample with zero options present', () => {
    const result = validatePreviewSample(choiceSchema, {});

    expect(result.valid).toBe(false);
  });

  it('rejects a sample with more than one option present', () => {
    const result = validatePreviewSample(choiceSchema, { cash: true, card: '4111' });

    expect(result.valid).toBe(false);
  });
});
