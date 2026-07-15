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

describe('validatePreviewSample — optional number field blank handling (round-10 finding A)', () => {
  // Before this fix, `.optional()` was applied to the OUTER z.preprocess(...)
  // pipeline instead of the INNER z.number() schema. ZodOptional only
  // short-circuits when the RAW input is `undefined` — an empty-string form
  // value ('') is not `undefined`, so it passed through into the preprocess
  // transform (which correctly turns it into `undefined`), then hit the
  // un-optional z.number() schema and failed with "must be a number". A
  // legitimately blank optional numeric field could never validate.
  const schema: FormPreviewSchema = {
    schemaVersion: 1,
    targetId: 'test.Trade',
    title: 'Trade',
    status: 'ready',
    fields: [
      { path: 'quantity', label: 'Quantity', kind: 'number', required: false },
      { path: 'price', label: 'Price', kind: 'number', required: true }
    ]
  };

  it('accepts an empty-string value for an optional number field', () => {
    const result = validatePreviewSample(schema, { quantity: '', price: 5 });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('still rejects an empty-string value for a required number field (no regression)', () => {
    const result = validatePreviewSample(schema, { quantity: '', price: '' });

    expect(result.valid).toBe(false);
  });

  it('still accepts a populated optional number field (no regression)', () => {
    const result = validatePreviewSample(schema, { quantity: 10, price: 5 });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
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

describe('validatePreviewSample — Data-extends-Choice inherited fields (round-5 finding #1)', () => {
  // Mirrors the real FormPreviewSchema shape buildDataSchema now produces
  // for a Data type extending a Choice (e.g. `BasketConstituent extends
  // Observable`): the schema's `fields` include BOTH the Data type's own
  // attribute(s) AND one field per Choice option, keyed by the option's
  // REAL emitted (lower-camel) field name — not the raw DSL type-reference
  // casing.
  const basketConstituentSchema: FormPreviewSchema = {
    schemaVersion: 1,
    targetId: 'test.preview.BasketConstituent',
    title: 'BasketConstituent',
    status: 'ready',
    fields: [
      {
        path: 'commodity',
        label: 'Commodity',
        kind: 'object',
        required: false,
        children: [{ path: 'commodity.name', label: 'Name', kind: 'string', required: true }]
      },
      {
        path: 'cash',
        label: 'Cash',
        kind: 'object',
        required: false,
        children: [{ path: 'cash.amount', label: 'Amount', kind: 'number', required: true }]
      },
      { path: 'weight', label: 'Weight', kind: 'number', required: true }
    ]
  };

  it('accepts a sample keyed by the lower-camel Choice-ancestor field alongside the Data type own attribute', () => {
    // Before round-5 finding #1's fix, `commodity` would not have appeared
    // in the schema's fields at all, so the .strict() validator (round-2
    // finding #1) rejected this real, generated-schema-valid payload as an
    // "unrecognized key".
    const result = validatePreviewSample(basketConstituentSchema, {
      commodity: { name: 'Gold' },
      weight: 0.5
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('still rejects a sample missing the Data type own required attribute even with a Choice-ancestor field present', () => {
    const result = validatePreviewSample(basketConstituentSchema, {
      commodity: { name: 'Gold' }
    });

    expect(result.valid).toBe(false);
  });
});

describe('validatePreviewSample — Data-extends-Choice exactly-one-arm enforcement (round-9 finding #1)', () => {
  // The real FormPreviewSchema shape buildDataSchema now produces for a Data
  // type extending a Choice (e.g. `BasketConstituent extends Observable`):
  // `kind` stays undefined (NOT `'choice'`), but `choiceArmPaths` marks which
  // of `fields` are the Choice-ancestor-derived arms. Before this fix, the
  // "exactly one arm present" block was gated on `schema.kind === 'choice'`,
  // so it never ran for this shape at all — a payload missing the arm
  // entirely, or with multiple arms present, was incorrectly accepted.
  const basketConstituentSchema: FormPreviewSchema = {
    schemaVersion: 1,
    targetId: 'test.preview.BasketConstituent',
    title: 'BasketConstituent',
    status: 'ready',
    choiceArmPaths: ['commodity', 'cash'],
    fields: [
      {
        path: 'commodity',
        label: 'Commodity',
        kind: 'object',
        required: false,
        children: [{ path: 'commodity.name', label: 'Name', kind: 'string', required: true }]
      },
      {
        path: 'cash',
        label: 'Cash',
        kind: 'object',
        required: false,
        children: [{ path: 'cash.amount', label: 'Amount', kind: 'number', required: true }]
      },
      { path: 'weight', label: 'Weight', kind: 'number', required: true }
    ]
  };

  it('rejects a sample with no Choice arm present at all', () => {
    const result = validatePreviewSample(basketConstituentSchema, { weight: 1 });

    expect(result.valid).toBe(false);
  });

  it('rejects a sample with both Choice arms present simultaneously', () => {
    const result = validatePreviewSample(basketConstituentSchema, {
      commodity: { name: 'Gold' },
      cash: { amount: 5 },
      weight: 1
    });

    expect(result.valid).toBe(false);
  });

  it('still accepts a sample with exactly one arm present and a genuinely populated payload (no regression)', () => {
    const result = validatePreviewSample(basketConstituentSchema, {
      commodity: { name: 'Gold' },
      weight: 0.5
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });
});

describe('validatePreviewSample — nested object Choice-arm enforcement (round-10 finding B)', () => {
  // Mirrors the real FormPreviewSchema shape objectField now produces for a
  // NESTED Data-extends-Choice attribute reference (e.g.
  // `Trade.constituent: BasketConstituent` where `BasketConstituent extends
  // Observable`): the object field's `children` include both the Choice
  // ancestor's options (prefixed with the ambient path, e.g.
  // `constituent.commodity`) and the Data type's own attributes, and the
  // object field itself now carries `choiceArmPaths` marking which children
  // are the arms. Before this fix, buildFieldValidator's 'object' case had
  // no enforcement logic at all for this, so a payload with zero or
  // multiple arms present under `constituent` still validated successfully.
  const tradeSchema: FormPreviewSchema = {
    schemaVersion: 1,
    targetId: 'test.preview.Trade',
    title: 'Trade',
    status: 'ready',
    fields: [
      {
        path: 'constituent',
        label: 'Constituent',
        kind: 'object',
        required: true,
        choiceArmPaths: ['constituent.commodity', 'constituent.cash'],
        children: [
          {
            path: 'constituent.commodity',
            label: 'Commodity',
            kind: 'object',
            required: false,
            children: [{ path: 'constituent.commodity.name', label: 'Name', kind: 'string', required: true }]
          },
          {
            path: 'constituent.cash',
            label: 'Cash',
            kind: 'object',
            required: false,
            children: [{ path: 'constituent.cash.amount', label: 'Amount', kind: 'number', required: true }]
          },
          { path: 'constituent.weight', label: 'Weight', kind: 'number', required: true }
        ]
      }
    ]
  };

  it('rejects a payload with no arm present under the nested object field', () => {
    const result = validatePreviewSample(tradeSchema, { constituent: { weight: 1 } });

    expect(result.valid).toBe(false);
  });

  it('rejects a payload with both arms present under the nested object field', () => {
    const result = validatePreviewSample(tradeSchema, {
      constituent: { commodity: { name: 'Gold' }, cash: { amount: 5 }, weight: 1 }
    });

    expect(result.valid).toBe(false);
  });

  it('still accepts a payload with exactly one arm present and a genuine payload (no regression)', () => {
    const result = validatePreviewSample(tradeSchema, {
      constituent: { commodity: { name: 'Gold' }, weight: 1 }
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  // Two levels of nesting (object field nested inside another object field)
  // to verify Zod's own issue-path-prefixing composes correctly through
  // MULTIPLE levels, not just one.
  const wrappedSchema: FormPreviewSchema = {
    schemaVersion: 1,
    targetId: 'test.preview.Portfolio',
    title: 'Portfolio',
    status: 'ready',
    fields: [
      {
        path: 'trade',
        label: 'Trade',
        kind: 'object',
        required: true,
        children: [
          {
            path: 'trade.constituent',
            label: 'Constituent',
            kind: 'object',
            required: true,
            choiceArmPaths: ['trade.constituent.commodity', 'trade.constituent.cash'],
            children: [
              {
                path: 'trade.constituent.commodity',
                label: 'Commodity',
                kind: 'object',
                required: false,
                children: [{ path: 'trade.constituent.commodity.name', label: 'Name', kind: 'string', required: true }]
              },
              {
                path: 'trade.constituent.cash',
                label: 'Cash',
                kind: 'object',
                required: false,
                children: [{ path: 'trade.constituent.cash.amount', label: 'Amount', kind: 'number', required: true }]
              }
            ]
          }
        ]
      }
    ]
  };

  it('rejects a payload with no arm present two levels deep, with the issue keyed at the full nested path', () => {
    const result = validatePreviewSample(wrappedSchema, { trade: { constituent: {} } });

    expect(result.valid).toBe(false);
    expect(result.errors['trade.constituent']).toBeDefined();
  });

  it('still accepts a payload with exactly one arm present two levels deep (no regression)', () => {
    const result = validatePreviewSample(wrappedSchema, {
      trade: { constituent: { commodity: { name: 'Gold' } } }
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
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

describe('validatePreviewSample — Choice selected-arm payload must be genuinely non-empty (round-7 finding #3)', () => {
  // Every Choice option field is generated with `required: false` for
  // structural reasons (see buildChoiceOptionField / the doc comment above
  // the Choice block in preview-validator.ts). That means the per-field
  // validator alone treats an empty-string sentinel as valid-because-
  // optional even once presence-checking picks that field as "the selected
  // arm" — this suite exercises the additional required-arm-payload check.
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

  it('rejects a selected string arm whose value is the empty-sentinel string', () => {
    const result = validatePreviewSample(choiceSchema, { card: '' });

    expect(result.valid).toBe(false);
  });

  it('still accepts a selected arm with a genuinely-populated value (no regression)', () => {
    const result = validatePreviewSample(choiceSchema, { card: '4111' });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('still accepts a selected boolean arm (no regression for non-string arm kinds)', () => {
    const result = validatePreviewSample(choiceSchema, { cash: true });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });
});
