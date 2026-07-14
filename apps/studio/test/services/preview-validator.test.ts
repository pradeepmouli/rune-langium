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
