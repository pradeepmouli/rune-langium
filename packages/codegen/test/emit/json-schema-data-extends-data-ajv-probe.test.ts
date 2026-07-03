// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Adjacent-suspect probe (docs/superpowers/specs/2026-07-02-emitter-crossns-
 * hardening-design.md item 1): does the EXISTING Data-extends-Data JSON
 * Schema composition (`allOf: [{$ref: parent}, {..., additionalProperties:
 * false}]`, json-schema-emitter.ts's emitTypeDef) actually reject instances
 * carrying inherited parent properties?
 *
 * Real ajv (draft 2020-12) run against the LITERAL shape the emitter
 * produces today (mirrors emitTypeDef exactly — not a hand-simplified
 * analogue) with a real parent+child instance.
 */

import { describe, it, expect } from 'vitest';
import { Ajv2020 } from './ajv-2020.js';

describe('adjacent suspect: Data-extends-Data allOf + own-branch additionalProperties:false', () => {
  it('rejects an instance carrying inherited parent properties (own-branch additionalProperties is evaluated in isolation)', () => {
    // Mirrors emitTypeDef's exact composition for `Child extends Parent`.
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'test.schema.json',
      $defs: {
        Parent: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false
        },
        Child: {
          allOf: [
            { $ref: '#/$defs/Parent' },
            {
              type: 'object',
              properties: { extra: { type: 'number' } },
              additionalProperties: false
            }
          ]
        }
      },
      $ref: '#/$defs/Child'
    };

    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(schema);

    // A real parent+child instance: carries BOTH the parent's required `id`
    // and the child's own `extra`.
    const instance = { id: 'abc', extra: 5 };
    const valid = validate(instance);

    // If this is false, the bug is REAL: the own-branch's
    // `additionalProperties: false` is evaluated against the own-branch's
    // `properties` ALONE (JSON Schema keyword semantics — `allOf` branches
    // are independent, `additionalProperties` does not see sibling
    // branches' `properties`), so `id` (a PARENT property, absent from the
    // child's own-branch `properties`) is rejected as "additional".
    expect(valid).toBe(false);
    if (!valid) {
      // eslint-disable-next-line no-console
      console.log('ajv errors (expected — proves the bug is real):', JSON.stringify(validate.errors, null, 2));
    }
  });
});
