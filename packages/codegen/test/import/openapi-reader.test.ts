// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { readOpenApi, parseOpenApiDocument } from '../../src/import/sources/openapi-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';

/** Full pipeline: OpenAPI document (parsed object) → SourceModel → Rune AST nodes → .rune text, with the synonym-source declaration spliced in exactly where renderModel places namespace/version — mirrors json-schema-reader.test.ts's importToRune helper. */
function importToRune(doc: object, options?: { namespace?: string }): { text: string; diagnostics: unknown[] } {
  const { model, diagnostics: readerDiagnostics } = readOpenApi(doc as never, options);
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

const OAS30_PARTY: object = {
  openapi: '3.0.3',
  info: { title: 'Party Service', version: '1.0.0' },
  paths: {},
  components: {
    schemas: {
      Party: {
        type: 'object',
        required: ['partyId'],
        properties: {
          partyId: { type: 'string' },
          partyName: { type: 'string', nullable: true }
        }
      }
    }
  }
};

describe('openapi-reader — OAS 3.0 basics', () => {
  it('imports an object schema with a nullable property floored to (0..1)', async () => {
    const { text } = importToRune(OAS30_PARTY);
    expect(text).toContain('type Party:');
    expect(text).toContain('[synonym OpenApi value "party"]'.replace('party', 'Party')); // sanity: class synonym present
    expect(text).toContain('partyId string (1..1)');
    expect(text).toContain('partyName string (0..1)');
    await assertParses(text);
  });

  it('derives the namespace from info.title, sanitized', () => {
    const { model } = readOpenApi(OAS30_PARTY as never);
    expect(model.namespace).toBe('Party.Service');
  });

  it('--namespace override always wins over info.title', () => {
    const { model } = readOpenApi(OAS30_PARTY as never, { namespace: 'com.example.override' });
    expect(model.namespace).toBe('com.example.override');
  });

  it('falls back to servers[0].url when info.title is absent', () => {
    const doc = {
      openapi: '3.0.3',
      info: { version: '1.0.0' },
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: {},
      components: { schemas: { Foo: { type: 'object', properties: { x: { type: 'string' } } } } }
    };
    const { model } = readOpenApi(doc as never);
    expect(model.namespace).toBe('com.example.api.v1');
  });

  it('records the synonym source as OpenApi (not JsonSchema)', async () => {
    const { text } = importToRune(OAS30_PARTY);
    expect(text).toContain('synonym source OpenApi');
    await assertParses(text);
  });

  it('REGRESSION: nullable:true on a REQUIRED property emits an info diagnostic (the floor to (0..1) erases a real distinction)', () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Nullable Required Demo', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Party: {
            type: 'object',
            required: ['partyId', 'partyName'],
            properties: {
              partyId: { type: 'string' },
              partyName: { type: 'string', nullable: true }
            }
          }
        }
      }
    };
    const { diagnostics } = readOpenApi(doc as never);
    const floored = diagnostics.find((d: any) => d.code === 'nullable-required-floored');
    expect(floored).toBeDefined();
    expect((floored as any).severity).toBe('info');
    expect((floored as any).message).toContain('partyName');
  });

  it('nullable:true on an OPTIONAL (non-required) property does NOT emit the floored diagnostic (both sides are already (0..1))', () => {
    const { diagnostics } = readOpenApi(OAS30_PARTY as never);
    expect(diagnostics.some((d: any) => d.code === 'nullable-required-floored')).toBe(false);
  });
});

describe('openapi-reader — allOf extends (scenario 4 analog)', () => {
  it('translates allOf [$ref base, own properties] into extends', async () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Extends Demo', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Base: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } }
          },
          Derived: {
            allOf: [
              { $ref: '#/components/schemas/Base' },
              { type: 'object', properties: { extra: { type: 'string' } } }
            ]
          }
        }
      }
    };
    const { text } = importToRune(doc);
    expect(text).toContain('type Derived extends Base:');
    expect(text).toContain('extra string (0..1)');
    await assertParses(text);
  });
});

describe('openapi-reader — discriminated oneOf with mapping', () => {
  it('inlines $ref branches via discriminator.mapping and merges branch properties as real attributes', async () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Priceable Demo', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          CurrencyAmount: {
            type: 'object',
            required: ['currency'],
            properties: { currency: { type: 'string' } }
          },
          CapacityAmount: {
            type: 'object',
            required: ['capacityUnit'],
            properties: { capacityUnit: { type: 'string' } }
          },
          PriceableAmount: {
            type: 'object',
            oneOf: [{ $ref: '#/components/schemas/CurrencyAmount' }, { $ref: '#/components/schemas/CapacityAmount' }],
            discriminator: {
              propertyName: 'unitType',
              mapping: {
                CURRENCY: '#/components/schemas/CurrencyAmount',
                CAPACITY: '#/components/schemas/CapacityAmount'
              }
            }
          }
        }
      }
    };
    const { model, text } = { ...importToRune(doc), model: readOpenApi(doc as never).model };
    const priceable = model.types.find((t) => t.name === 'PriceableAmount')!;
    expect(priceable.attributes.map((a) => a.name).sort()).toEqual(['capacityUnit', 'currency']);
    expect(text).toContain('condition OneOf:');
    expect(text).toContain('required choice currency, capacityUnit');
    await assertParses(text);
  });

  it('diagnoses (but still includes) a oneOf branch missing from discriminator.mapping', () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Unmapped Demo', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          A: { type: 'object', properties: { a: { type: 'string' } } },
          B: { type: 'object', properties: { b: { type: 'string' } } },
          Union: {
            type: 'object',
            oneOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }],
            discriminator: { propertyName: 'kind', mapping: { KIND_A: '#/components/schemas/A' } }
          }
        }
      }
    };
    const { diagnostics } = readOpenApi(doc as never);
    expect(diagnostics.some((d: any) => d.code === 'unmapped-discriminator-branch')).toBe(true);
  });

  it('REGRESSION: a bare-name discriminator.mapping value (a schema NAME, not a full $ref) does NOT trigger a false unmapped-discriminator-branch warning', () => {
    // discriminator.mapping values are legal in two forms per the OpenAPI
    // spec: a full $ref-style path OR a bare schema name. A prior version
    // only recognized the full-$ref form, so `mapping: { KIND_A: 'A' }`
    // (bare name) was treated as unmapped even though it correctly
    // identifies the branch (review finding).
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Bare Mapping Demo', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          A: { type: 'object', properties: { a: { type: 'string' } } },
          B: { type: 'object', properties: { b: { type: 'string' } } },
          Union: {
            type: 'object',
            oneOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }],
            discriminator: { propertyName: 'kind', mapping: { KIND_A: 'A', KIND_B: 'B' } }
          }
        }
      }
    };
    const { diagnostics } = readOpenApi(doc as never);
    expect(diagnostics.some((d: any) => d.code === 'unmapped-discriminator-branch')).toBe(false);
  });

  it('REGRESSION: a PURE oneOf+discriminator schema (no type/properties/allOf of its own) is NOT silently dropped', async () => {
    // The dominant real-world OpenAPI discriminated-union idiom writes the
    // union schema as bare { oneOf: [...], discriminator: {...} } with no
    // "type": "object" of its own (the actual Petstore polymorphism spec
    // does exactly this) — every OTHER test/fixture in this suite added an
    // explicit `type: 'object'` to the union schema, which masked a real
    // bug: readJsonSchema's own classification gate (`def.type === 'object'
    // || def.properties !== undefined || def.allOf !== undefined`) never
    // matches a schema that is ONLY `oneOf`+`discriminator`, so the whole
    // type — attributes, choice condition, everything — silently vanished
    // (falling to the generic 'unrecognized-def' diagnostic, output still
    // parsed, but the union was gone). Fixed in normalizeSchema: a
    // discriminated oneOf schema now gets `type: 'object'` stamped onto it
    // before delegation when it doesn't already declare one.
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Bare Discriminator Demo', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Dog: { type: 'object', required: ['bark'], properties: { bark: { type: 'string' } } },
          Cat: { type: 'object', required: ['meow'], properties: { meow: { type: 'string' } } },
          Pet: {
            oneOf: [{ $ref: '#/components/schemas/Dog' }, { $ref: '#/components/schemas/Cat' }],
            discriminator: {
              propertyName: 'petType',
              mapping: { dog: '#/components/schemas/Dog', cat: '#/components/schemas/Cat' }
            }
          }
        }
      }
    };
    const { model, diagnostics } = readOpenApi(doc as never);
    expect(diagnostics.some((d: any) => d.code === 'unrecognized-def')).toBe(false);
    const pet = model.types.find((t) => t.name === 'Pet');
    expect(pet).toBeDefined();
    expect(pet!.attributes.map((a) => a.name).sort()).toEqual(['bark', 'meow']);

    const { text } = importToRune(doc);
    expect(text).toContain('type Pet:');
    expect(text).toContain('condition OneOf:');
    expect(text).toContain('required choice bark, meow');
    await assertParses(text);
  });
});

describe('openapi-reader — enums with unsafe values', () => {
  it('imports a string enum with a non-ValidID-safe value, retaining it as displayName', async () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Enum Demo', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          DayCountFractionEnum: { type: 'string', enum: ['ACT/360', 'ACT/365'] }
        }
      }
    };
    const { text } = importToRune(doc);
    expect(text).toContain('enum DayCountFractionEnum:');
    expect(text).toContain('ACT_360');
    expect(text).toContain('displayName "ACT/360"');
    await assertParses(text);
  });
});

describe('openapi-reader — range/length constraints (scenario 5 analog)', () => {
  it('translates minimum/maximum/minLength/maxLength into conditions', async () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Constraints Demo', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Trade: {
            type: 'object',
            required: ['notional', 'partyId'],
            properties: {
              notional: { type: 'number', minimum: 0 },
              partyId: { type: 'string', minLength: 1, maxLength: 20 }
            }
          }
        }
      }
    };
    const { text } = importToRune(doc);
    expect(text).toContain('notional >= 0');
    expect(text).toContain('partyId count >= 1');
    expect(text).toContain('partyId count <= 20');
    await assertParses(text);
  });
});

describe('openapi-reader — OAS 3.1 near-passthrough', () => {
  it('imports a 3.1 document (2020-12 dialect, no nullable keyword) unchanged through the same pipeline', async () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 'ThreeOne Demo', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Party: {
            type: 'object',
            required: ['partyId'],
            properties: {
              partyId: { type: 'string' },
              partyName: { type: ['string', 'null'] }
            }
          }
        }
      }
    };
    const { text } = importToRune(doc);
    expect(text).toContain('type Party:');
    expect(text).toContain('partyId string (1..1)');
    expect(text).toContain('partyName string (0..1)');
    await assertParses(text);
  });

  it('3.1 exclusiveMinimum/exclusiveMaximum are numeric (2020-12 form), read the same as JSON Schema', async () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 'ThreeOneRange Demo', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Trade: {
            type: 'object',
            required: ['notional'],
            properties: { notional: { type: 'number', exclusiveMinimum: 0 } }
          }
        }
      }
    };
    const { text } = importToRune(doc);
    expect(text).toContain('notional > 0');
    await assertParses(text);
  });
});

describe('openapi-reader — YAML parsing', () => {
  it('parseOpenApiDocument parses a YAML OpenAPI document identically to the equivalent JSON', async () => {
    const yamlSource = `
openapi: 3.0.3
info:
  title: Yaml Demo
  version: 1.0.0
paths: {}
components:
  schemas:
    Party:
      type: object
      required:
        - partyId
      properties:
        partyId:
          type: string
        partyName:
          type: string
          nullable: true
`;
    const parsed = parseOpenApiDocument(yamlSource);
    const { text } = importToRune(parsed as object);
    expect(text).toContain('type Party:');
    expect(text).toContain('partyId string (1..1)');
    expect(text).toContain('partyName string (0..1)');
    await assertParses(text);
  });

  it('parseOpenApiDocument parses plain JSON text too (JSON is a YAML subset, but JSON.parse is tried first)', () => {
    const parsed = parseOpenApiDocument(JSON.stringify(OAS30_PARTY));
    expect(parsed).toEqual(OAS30_PARTY);
  });
});

describe('openapi-reader — external ref handling', () => {
  it('diagnoses an allOf base $ref that is not an internal components/schemas reference', () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'External Demo', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Derived: {
            allOf: [{ $ref: 'https://external.example.com/schemas/Base.json' }, { type: 'object', properties: {} }]
          }
        }
      }
    };
    const { diagnostics } = readOpenApi(doc as never);
    expect(diagnostics.some((d: any) => d.code === 'external-ref')).toBe(true);
  });
});

describe('readOpenApi input guard (PR #374 Copilot finding)', () => {
  // A YAML parse legally yields null for an empty document or a literal
  // `null` body; scalars and arrays are equally possible. Pre-fix these
  // crashed with an unhelpful TypeError on document.openapi access.
  it.each([
    ['null (empty YAML)', null],
    ['a scalar', 42],
    ['a string', 'openapi: 3.1'],
    ['an array', []]
  ])('fails with a clear import error for %s, not a TypeError', (_label, doc) => {
    expect(() => readOpenApi(doc as never)).toThrowError(/not an OpenAPI document: expected a top-level object/);
  });

  it('parseOpenApiDocument of an empty YAML source flows into the clear error end-to-end', () => {
    const parsed = parseOpenApiDocument('');
    expect(() => readOpenApi(parsed)).toThrowError(/not an OpenAPI document/);
  });
});

describe('openapi-reader — includeOperations', () => {
  it('includeOperations: false skips path-derived functions', () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Demo', version: '1.0.0' },
      paths: { '/widgets': { get: { operationId: 'listWidgets', responses: { '200': { description: 'ok' } } } } },
      components: { schemas: { Widget: { type: 'object', properties: { id: { type: 'string' } } } } }
    };
    const { model } = readOpenApi(doc, { includeOperations: false });
    expect(model.funcs).toEqual([]);
    expect(model.types.map((t) => t.name)).toContain('Widget');
  });
});
