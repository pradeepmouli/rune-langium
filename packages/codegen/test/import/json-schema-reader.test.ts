// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { readJsonSchema } from '../../src/import/sources/json-schema-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';

/** Full pipeline: JSON Schema object → SourceModel → Rune AST nodes → .rune text, with the synonym-source declaration spliced in exactly where renderModel places namespace/version. */
function importToRune(schema: object, options?: { namespace?: string }): { text: string; diagnostics: unknown[] } {
  const { model, diagnostics: readerDiagnostics } = readJsonSchema(schema as never, options);
  const built = buildModel(model);
  const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
  const lines = rendered.split('\n');
  if (built.synonymSourceDeclaration) {
    const versionIdx = lines.findIndex((l) => l.startsWith('version '));
    lines.splice(versionIdx + 1, 0, '', built.synonymSourceDeclaration);
  }
  return { text: lines.join('\n'), diagnostics: [...readerDiagnostics, ...built.diagnostics] };
}

async function assertParses(text: string): Promise<void> {
  const result = await parse(text);
  if (result.hasErrors) {
    throw new Error(
      `expected zero parse errors for:\n${text}\ngot: ${JSON.stringify([...result.lexerErrors, ...result.parserErrors])}`
    );
  }
  expect(result.hasErrors).toBe(false);
}

describe('json-schema-reader — acceptance scenario 1: object + properties + required', () => {
  it('required properties get (1..1), others (0..1), each with a synonym', async () => {
    const schema = {
      $id: 'https://example.com/schemas/party.json',
      $defs: {
        Party: {
          type: 'object',
          properties: {
            partyId: { type: 'string' },
            partyName: { type: 'string' }
          },
          required: ['partyId'],
          additionalProperties: false
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('type Party:');
    expect(text).toContain('partyId string (1..1)');
    expect(text).toContain('partyName string (0..1)');
    expect(text).toContain('[synonym JsonSchema value "partyId"]');
    await assertParses(text);
  });
});

describe('json-schema-reader — acceptance scenario 2: array + minItems/maxItems', () => {
  it('derives (minItems..maxItems), * for absent maxItems, (1..*) for minItems:1', async () => {
    const schema = {
      $id: 'https://example.com/schemas/coll.json',
      $defs: {
        Coll: {
          type: 'object',
          properties: {
            zeroOrMore: { type: 'array', items: { type: 'string' } },
            oneOrMore: { type: 'array', items: { type: 'string' }, minItems: 1 },
            bounded: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 }
          },
          required: []
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('zeroOrMore string (0..*)');
    expect(text).toContain('oneOrMore string (1..*)');
    expect(text).toContain('bounded string (2..5)');
    await assertParses(text);
  });
});

describe('json-schema-reader — acceptance scenario 3: enum / oneOf-of-const', () => {
  it('emits a Rune enum with a safe name + displayName for non-identifier-safe values', async () => {
    const schema = {
      $id: 'https://example.com/schemas/daycount.json',
      $defs: {
        DayCountFractionEnum: {
          type: 'string',
          enum: ['ACT/360', 'ACT/365', 'Thirty360']
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('enum DayCountFractionEnum:');
    expect(text).toContain('ACT_360 displayName "ACT/360"');
    expect(text).toContain('ACT_365 displayName "ACT/365"');
    expect(text).toContain('Thirty360');
    expect(text).not.toContain('Thirty360 displayName');
    await assertParses(text);
  });

  it('a oneOf-of-const union (no discriminator) is also treated as an enum', async () => {
    const schema = {
      $id: 'https://example.com/schemas/status.json',
      $defs: {
        StatusEnum: {
          oneOf: [{ const: 'Active' }, { const: 'Inactive' }]
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('enum StatusEnum:');
    expect(text).toContain('Active');
    expect(text).toContain('Inactive');
    await assertParses(text);
  });

  it('prefers x-rune-enum-display over a guessed display name (round-trip fidelity with our own outbound emitter)', async () => {
    const schema = {
      $id: 'https://example.com/schemas/status2.json',
      $defs: {
        StatusEnum: {
          type: 'string',
          enum: ['Active', 'Inactive'],
          'x-rune-enum-display': { Active: 'Active Status', Inactive: 'Inactive Status' }
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('Active displayName "Active Status"');
    expect(text).toContain('Inactive displayName "Inactive Status"');
    await assertParses(text);
  });
});

describe('json-schema-reader — acceptance scenario 4: allOf composing a base + extra properties', () => {
  it('extends the base type and declares only the additional attributes', async () => {
    const schema = {
      $id: 'https://example.com/schemas/employee.json',
      $defs: {
        Party: {
          type: 'object',
          properties: { partyId: { type: 'string' } },
          required: ['partyId']
        },
        Employee: {
          allOf: [
            { $ref: '#/$defs/Party' },
            {
              type: 'object',
              properties: { title: { type: 'string' } },
              required: []
            }
          ]
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('type Employee extends Party:');
    expect(text).toContain('title string (0..1)');
    // The extending type must NOT re-declare partyId (only the additional attributes).
    const employeeBlock = text.slice(text.indexOf('type Employee'));
    expect(employeeBlock).not.toContain('partyId');
    await assertParses(text);
  });
});

describe('json-schema-reader — acceptance scenario 5 (AMENDED): minimum/maximum/minLength → condition; pattern → stub', () => {
  it('minimum/maximum → range condition', async () => {
    const schema = {
      $id: 'https://example.com/schemas/numeric.json',
      $defs: {
        NumericCheck: {
          type: 'object',
          properties: { value: { type: 'integer', minimum: 0 } },
          required: ['value']
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('condition ValueRange:');
    expect(text).toContain('value >= 0');
    await assertParses(text);
  });

  it('REGRESSION: mixed exclusivity — exclusiveMinimum does not corrupt an inclusive maximum', async () => {
    // Reviewer probe: {exclusiveMinimum: 0, maximum: 10} previously rendered
    // `v > 0 and v < 10` — the INCLUSIVE maximum:10 was silently made
    // exclusive, rejecting v=10 even though the source schema permits it.
    const schema = {
      $id: 'https://example.com/schemas/mixedexclusive.json',
      $defs: {
        MixedExclusive: {
          type: 'object',
          properties: { value: { type: 'integer', exclusiveMinimum: 0, maximum: 10 } },
          required: ['value']
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('value > 0');
    expect(text).toContain('value <= 10');
    expect(text).not.toContain('value < 10');
    await assertParses(text);
  });

  it('REGRESSION: Draft-7 boolean exclusiveMinimum/exclusiveMaximum modifier form is honored', async () => {
    // Reviewer probe: {minimum: 5, exclusiveMinimum: true} previously
    // imported as `v >= 5` (should be `v > 5`) — the boolean modifier form
    // (Draft 7) was declared in the reader's own type union but never
    // actually read; only the 2020-12 numeric form was handled.
    const schema = {
      $id: 'https://example.com/schemas/draft7exclusive.json',
      $defs: {
        Draft7Exclusive: {
          type: 'object',
          properties: {
            value: { type: 'integer', minimum: 5, exclusiveMinimum: true, maximum: 20, exclusiveMaximum: true }
          },
          required: ['value']
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('value > 5');
    expect(text).toContain('value < 20');
    expect(text).not.toContain('value >= 5');
    expect(text).not.toContain('value <= 20');
    await assertParses(text);
  });

  it('REGRESSION: both bounds independently exclusive/inclusive render the exact operators (min exclusive, max inclusive; and the reverse)', async () => {
    const bothMixed = {
      $id: 'https://example.com/schemas/bothmixed.json',
      $defs: {
        BothMixed: {
          type: 'object',
          properties: {
            a: { type: 'integer', exclusiveMinimum: 0, maximum: 10 },
            b: { type: 'integer', minimum: 0, exclusiveMaximum: 10 }
          },
          required: ['a', 'b']
        }
      }
    };
    const { text } = importToRune(bothMixed);
    expect(text).toContain('a > 0');
    expect(text).toContain('a <= 10');
    expect(text).toContain('b >= 0');
    expect(text).toContain('b < 10');
    await assertParses(text);
  });

  it('minLength → length condition', async () => {
    const schema = {
      $id: 'https://example.com/schemas/lengthcheck.json',
      $defs: {
        LengthCheck: {
          type: 'object',
          properties: { code: { type: 'string', minLength: 1 } },
          required: ['code']
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('condition CodeLength:');
    expect(text).toContain('code count >= 1');
    await assertParses(text);
  });

  it('pattern emits a custom-stub condition + diagnostic, NOT a native regex condition', async () => {
    const schema = {
      $id: 'https://example.com/schemas/patterncheck.json',
      $defs: {
        PatternCheck: {
          type: 'object',
          properties: { code: { type: 'string', pattern: '^[A-Z]{3}$' } },
          required: ['code']
        }
      }
    };
    const { text, diagnostics } = importToRune(schema);
    expect(text).toContain('condition CodePattern:');
    expect(text).toContain('TODO: manual translation required — source pattern: ^[A-Z]{3}$');
    expect(text).toContain('True');
    const untranslatable = diagnostics.filter((d) => (d as { code: string }).code === 'untranslatable-construct');
    expect(untranslatable.length).toBe(1); // REGRESSION: previously double-diagnosed (reader + translator both pushed one for the same pattern constraint).
    await assertParses(text);
  });
});

describe('json-schema-reader — acceptance scenario 6: oneOf + discriminator', () => {
  it('translates a discriminated union into a Rune one-of (required choice) condition', async () => {
    const schema = {
      $id: 'https://example.com/schemas/priceable.json',
      $defs: {
        PriceableAmount: {
          type: 'object',
          oneOf: [
            { type: 'object', properties: { currency: { type: 'string' } }, required: ['currency'] },
            { type: 'object', properties: { capacityUnit: { type: 'string' } }, required: ['capacityUnit'] }
          ],
          discriminator: { propertyName: 'unitType' }
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('condition OneOf:');
    expect(text).toContain('required choice currency, capacityUnit');
    await assertParses(text);
  });

  it("REGRESSION: the union branches' properties are merged onto the type as real (0..1) attributes, not dropped", async () => {
    // Reviewer probe: previously the emitted type had ZERO attributes yet a
    // `required choice currency, capacityUnit` condition referencing
    // property names that did not exist anywhere on the type — parseable
    // (unresolved refs don't fail parse) but silently wrong, with the
    // branch property TYPES lost entirely and no diagnostic.
    const schema = {
      $id: 'https://example.com/schemas/priceable2.json',
      $defs: {
        PriceableAmount: {
          type: 'object',
          oneOf: [
            { type: 'object', properties: { currency: { type: 'string' } }, required: ['currency'] },
            { type: 'object', properties: { capacityUnit: { type: 'integer' } }, required: ['capacityUnit'] }
          ],
          discriminator: { propertyName: 'unitType' }
        }
      }
    };
    const { model, text } = { ...importToRune(schema), model: readJsonSchema(schema as never).model };
    const priceable = model.types.find((t) => t.name === 'PriceableAmount')!;
    expect(priceable.attributes.map((a) => a.name).sort()).toEqual(['capacityUnit', 'currency']);
    const currency = priceable.attributes.find((a) => a.name === 'currency')!;
    expect(currency.typeName).toBe('string');
    expect(currency.cardinality).toEqual({ inf: 0, sup: 1 });
    const capacityUnit = priceable.attributes.find((a) => a.name === 'capacityUnit')!;
    expect(capacityUnit.typeName).toBe('int');
    expect(text).toContain('currency string (0..1)');
    expect(text).toContain('capacityUnit int (0..1)');
    expect(text).toContain('required choice currency, capacityUnit');
    await assertParses(text);
  });

  it('REGRESSION: a property declared with conflicting types across branches is diagnosed and skipped, not silently merged', async () => {
    const schema = {
      $id: 'https://example.com/schemas/priceable3.json',
      $defs: {
        PriceableAmount: {
          type: 'object',
          oneOf: [
            { type: 'object', properties: { amount: { type: 'string' } }, required: ['amount'] },
            { type: 'object', properties: { amount: { type: 'integer' } }, required: ['amount'] }
          ],
          discriminator: { propertyName: 'unitType' }
        }
      }
    };
    const { model, diagnostics } = readJsonSchema(schema as never);
    const priceable = model.types.find((t) => t.name === 'PriceableAmount')!;
    expect(priceable.attributes.find((a) => a.name === 'amount')).toBeUndefined();
    expect(diagnostics.some((d) => d.code === 'untranslatable-construct')).toBe(true);
  });
});

describe('json-schema-reader — allOf combined with a top-level oneOf+discriminator (Minor)', () => {
  it('REGRESSION: an allOf type that ALSO carries oneOf+discriminator keeps the choice condition (previously dropped silently)', async () => {
    const schema = {
      $id: 'https://example.com/schemas/allofoneof.json',
      $defs: {
        Base: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        Extended: {
          allOf: [{ $ref: '#/$defs/Base' }, { type: 'object', properties: { note: { type: 'string' } } }],
          oneOf: [
            { type: 'object', properties: { currency: { type: 'string' } }, required: ['currency'] },
            { type: 'object', properties: { capacityUnit: { type: 'string' } }, required: ['capacityUnit'] }
          ],
          discriminator: { propertyName: 'unitType' }
        }
      }
    };
    const { model, text } = { ...importToRune(schema), model: readJsonSchema(schema as never).model };
    const extended = model.types.find((t) => t.name === 'Extended')!;
    expect(extended.extends).toBe('Base');
    expect(extended.attributes.map((a) => a.name).sort()).toEqual(['capacityUnit', 'currency', 'note']);
    expect(extended.constraints).toEqual([{ kind: 'oneOf', paths: ['currency', 'capacityUnit'] }]);
    expect(text).toContain('type Extended extends Base:');
    expect(text).toContain('required choice currency, capacityUnit');
    await assertParses(text);
  });
});

describe('json-schema-reader — inline nested object property (Minor)', () => {
  it('REGRESSION: an inline nested object property emits a diagnostic instead of silently becoming string', async () => {
    const schema = {
      $id: 'https://example.com/schemas/nestedobj.json',
      $defs: {
        Outer: {
          type: 'object',
          properties: {
            nested: { type: 'object', properties: { inner: { type: 'string' } } }
          },
          required: []
        }
      }
    };
    const { model, diagnostics } = readJsonSchema(schema as never);
    const outer = model.types.find((t) => t.name === 'Outer')!;
    const nested = outer.attributes.find((a) => a.name === 'nested')!;
    expect(nested.typeName).toBe('string'); // still the MVP fallback — the point is the diagnostic, not a new type
    expect(diagnostics.some((d) => d.code === 'unsupported-inline-object')).toBe(true);
  });
});

describe('json-schema-reader — $ref resolution', () => {
  it('resolves an internal $defs $ref to the referenced type/enum name', async () => {
    const schema = {
      $id: 'https://example.com/schemas/trade.json',
      $defs: {
        CurrencyEnum: { type: 'string', enum: ['USD', 'EUR'] },
        Trade: {
          type: 'object',
          properties: { currency: { $ref: '#/$defs/CurrencyEnum' } },
          required: ['currency']
        }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('currency CurrencyEnum (1..1)');
    await assertParses(text);
  });

  it('an external $ref falls back to string + external-ref diagnostic (does not throw)', () => {
    const schema = {
      $id: 'https://example.com/schemas/ext.json',
      $defs: {
        Ext: {
          type: 'object',
          properties: { thing: { $ref: 'https://other.example.com/schemas/thing.json#/def' } },
          required: []
        }
      }
    };
    const { model, diagnostics } = readJsonSchema(schema as never);
    const attr = model.types[0]!.attributes[0]!;
    expect(attr.typeName).toBe('string');
    expect(diagnostics.some((d) => d.code === 'external-ref')).toBe(true);
  });

  it('REGRESSION: a hyphenated $defs key (a legal JSON Schema key, illegal Rune identifier) is sanitized for BOTH a type and an enum definition (hard invariant)', async () => {
    // Reviewer finding: $defs keys were used VERBATIM as SourceType.name /
    // SourceEnum.name; escapeId only escapes reserved keywords, not invalid
    // identifier characters, so a legal key like "day-count" previously
    // emitted `enum day-count:` / `type day-count:` — an unparseable
    // hard-invariant breach (a hyphen is not in ValidID).
    const schema = {
      $id: 'https://example.com/schemas/hyphenated.json',
      $defs: {
        'day-count': { type: 'string', enum: ['ACT_360', 'ACT_365'] },
        'trade-details': {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: []
        }
      }
    };
    const { model, text } = { ...importToRune(schema), model: readJsonSchema(schema as never).model };
    const enumNode = model.enums.find((e) => e.sourceKey === 'day-count')!;
    expect(enumNode.name).not.toBe('day-count');
    expect(enumNode.name).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    const typeNode = model.types.find((t) => t.sourceKey === 'trade-details')!;
    expect(typeNode.name).not.toBe('trade-details');
    expect(typeNode.name).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    expect(text).not.toContain('enum day-count:');
    expect(text).not.toContain('type trade-details:');
    await assertParses(text);
  });

  it('REGRESSION: an internal $ref to a hyphenated enum key resolves to the SAME sanitized name as the declaration (DRY, not two conversions)', async () => {
    const schema = {
      $id: 'https://example.com/schemas/hyphenated2.json',
      $defs: {
        'day-count': { type: 'string', enum: ['ACT_360', 'ACT_365'] },
        Trade: {
          type: 'object',
          properties: { dayCount: { $ref: '#/$defs/day-count' } },
          required: ['dayCount']
        }
      }
    };
    const { model, text } = { ...importToRune(schema), model: readJsonSchema(schema as never).model };
    const enumNode = model.enums.find((e) => e.sourceKey === 'day-count')!;
    const trade = model.types.find((t) => t.name === 'Trade')!;
    const dayCountAttr = trade.attributes.find((a) => a.name === 'dayCount')!;
    // The attribute's resolved type name MUST equal the enum's own
    // (sanitized) declaration name, or the reference is dangling.
    expect(dayCountAttr.typeName).toBe(enumNode.name);
    expect(text).toContain(`dayCount ${enumNode.name} (1..1)`);
    await assertParses(text);
  });
});

describe('json-schema-reader — namespace derivation ($id → reverse-DNS-ish; --namespace fallback; error)', () => {
  it('derives from $id host + path', () => {
    const { model } = readJsonSchema({ $id: 'https://example.com/schemas/trade.json', $defs: {} } as never);
    expect(model.namespace).toBe('com.example.schemas.trade');
  });

  it('falls back to --namespace when $id is absent', () => {
    const { model } = readJsonSchema({ $defs: {} } as never, { namespace: 'my.custom.ns' });
    expect(model.namespace).toBe('my.custom.ns');
  });

  it('throws when neither $id nor --namespace yields a valid namespace', () => {
    expect(() => readJsonSchema({ $defs: {} } as never)).toThrow(/Unable to derive a Rune namespace/);
  });

  it('REGRESSION: an INVALID --namespace override is blamed by name, not misreported as "no override supplied"', () => {
    // Reviewer finding: the error previously always said "no --namespace
    // override was supplied" even when an invalid one WAS supplied.
    expect(() => readJsonSchema({ $defs: {} } as never, { namespace: '1-not-valid!' })).toThrow(
      /supplied --namespace override \('1-not-valid!'\) is not a valid Rune namespace/
    );
  });

  it('an absent $id with no --namespace still reports the original "no override was supplied" message', () => {
    expect(() => readJsonSchema({ $defs: {} } as never)).toThrow(/no --namespace override was supplied/);
  });
});

describe('json-schema-reader — includeUnreferencedDefs option', () => {
  it('includeUnreferencedDefs: false drops defs no other def references', () => {
    const schema = {
      $id: 'https://example.com/test',
      $defs: {
        Root: { type: 'object', properties: { child: { $ref: '#/$defs/Referenced' } } },
        Referenced: { type: 'object', properties: { x: { type: 'string' } } },
        Orphan: { type: 'object', properties: { y: { type: 'string' } } }
      }
    } as unknown as Parameters<typeof readJsonSchema>[0];
    const { model } = readJsonSchema(schema, { includeUnreferencedDefs: false });
    const names = model.types.map((t) => t.name);
    expect(names).toContain('Root');
    expect(names).toContain('Referenced');
    expect(names).not.toContain('Orphan');
  });

  it('includeUnreferencedDefs: true (default) imports every def regardless of reachability', () => {
    const schema = {
      $id: 'https://example.com/test',
      $defs: {
        Root: { type: 'object', properties: { child: { $ref: '#/$defs/Referenced' } } },
        Referenced: { type: 'object', properties: { x: { type: 'string' } } },
        Orphan: { type: 'object', properties: { y: { type: 'string' } } }
      }
    } as unknown as Parameters<typeof readJsonSchema>[0];
    const { model } = readJsonSchema(schema);
    expect(model.types.map((t) => t.name)).toContain('Orphan');
  });
});

describe('json-schema-reader — round-trip against a synonym-annotated Rune fixture', () => {
  it('property named identically to its Rune-safe form still gets a synonym annotation (MVP always-emit default)', async () => {
    const schema = {
      $id: 'https://example.com/schemas/simple.json',
      $defs: {
        Simple: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
      }
    };
    const { text } = importToRune(schema);
    expect(text).toContain('[synonym JsonSchema value "name"]');
    await assertParses(text);
  });
});
