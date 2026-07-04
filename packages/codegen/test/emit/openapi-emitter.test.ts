// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * OpenApiNamespaceEmitter — Rune → OpenAPI 3.1 outbound target (spec.md
 * Phase 2b Implementation Addendum decisions 2-5).
 *
 * Decision 2 (byte-stability): every assertion in this file that touches
 * `components.schemas` shape is the SAME structural shape the existing
 * JSON Schema emitter produces (composed via its own untouched public
 * `emitNamespace()`, then wrapped) — this file does not re-derive or
 * duplicate that emitter's own test coverage (see
 * json-schema-choice.test.ts / json-schema-data-extends-data-ajv.test.ts
 * for that), it verifies the WRAPPING + additions (keywords, operations,
 * YAML, CRUD) this new emitter is responsible for.
 */

import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { parse as parseYaml } from 'yaml';
import { generate } from '../../src/export.js';

async function gen(source: string, options: Record<string, unknown> = {}) {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse('inmemory:///t.rosetta'));
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc], { validation: false });
  return generate(doc, { target: 'openapi', ...options } as never);
}

describe('OpenApiNamespaceEmitter — schema wrapping (composes the untouched JSON Schema emitter)', () => {
  it('emits an OAS 3.1 document with components.schemas per type, cardinality-derived required/optional', async () => {
    const out = await gen(`namespace test.basic

type Party:
  partyId string (1..1)
  partyName string (0..1)
`);
    expect(out).toHaveLength(1);
    expect(out[0]!.relativePath).toBe('test/basic.openapi.json');
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    expect(doc['openapi']).toMatch(/^3\.1\./);
    expect((doc['info'] as { title?: string }).title).toBe('test.basic');
    const schemas = (doc['components'] as { schemas: Record<string, unknown> }).schemas;
    const party = schemas['Party'] as Record<string, unknown>;
    expect(party['type']).toBe('object');
    expect(party['required']).toEqual(['partyId']);
    expect((party['properties'] as Record<string, unknown>)['partyName']).toEqual({ type: 'string' });
  });

  it('rewrites internal $refs from #/$defs/X to #/components/schemas/X (inheritance via allOf)', async () => {
    const out = await gen(`namespace test.inherit

type Animal:
  name string (1..1)

type Dog extends Animal:
  breed string (1..1)
`);
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    const schemas = (doc['components'] as { schemas: Record<string, unknown> }).schemas;
    const dog = schemas['Dog'] as { allOf: Array<{ $ref?: string }> };
    expect(dog.allOf[0]!.$ref).toBe('#/components/schemas/Animal');
    // No stray #/$defs/ reference anywhere in the document.
    expect(out[0]!.content).not.toContain('#/$defs/');
  });

  it('enums are emitted the same shape json-schema does, referenced via components/schemas', async () => {
    const out = await gen(`namespace test.enums

enum CurrencyEnum:
  USD
  EUR

type Trade:
  currency CurrencyEnum (1..1)
`);
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    const schemas = (doc['components'] as { schemas: Record<string, unknown> }).schemas;
    expect(schemas['CurrencyEnum']).toEqual({ type: 'string', enum: ['USD', 'EUR'] });
    const trade = schemas['Trade'] as { properties: Record<string, unknown> };
    expect(trade.properties['currency']).toEqual({ $ref: '#/components/schemas/CurrencyEnum' });
  });

  it('does not mutate json-schema-emitter output: same document generated as json-schema is byte-identical modulo the wrapping', async () => {
    const source = `namespace test.parity

type Party:
  partyId string (1..1)
  partyName string (0..1)
`;
    const { RuneDsl } = createRuneDslServices();
    const doc1 = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse('inmemory:///a.rosetta'));
    await RuneDsl.shared.workspace.DocumentBuilder.build([doc1], { validation: false });
    const jsonSchemaOut = await generate(doc1, { target: 'json-schema' });
    const jsonSchemaDefs = (JSON.parse(jsonSchemaOut[0]!.content) as { $defs: unknown }).$defs;

    const { RuneDsl: RuneDsl2 } = createRuneDslServices();
    const doc2 = RuneDsl2.shared.workspace.LangiumDocumentFactory.fromString(
      source,
      URI.parse('inmemory:///b.rosetta')
    );
    await RuneDsl2.shared.workspace.DocumentBuilder.build([doc2], { validation: false });
    const openApiOut = await generate(doc2, { target: 'openapi' } as never);
    const openApiSchemas = (JSON.parse(openApiOut[0]!.content) as { components: { schemas: unknown } }).components
      .schemas;

    expect(openApiSchemas).toEqual(jsonSchemaDefs);
  });
});

describe('OpenApiNamespaceEmitter — constraint keywords (T1 recognizer, additive to x-rune-conditions)', () => {
  it('a recognized range condition renders minimum/maximum on the property schema', async () => {
    const out = await gen(`namespace test.constraints

type Quantity:
  value number (1..1)

  condition ValueRange:
    value >= 0
`);
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    const schemas = (doc['components'] as { schemas: Record<string, unknown> }).schemas;
    const quantity = schemas['Quantity'] as {
      properties: Record<string, Record<string, unknown>>;
      'x-rune-conditions'?: unknown[];
    };
    expect(quantity.properties['value']!['minimum']).toBe(0);
    // The opaque metadata stays too — additive, nothing removed.
    expect(quantity['x-rune-conditions']).toEqual([{ name: 'ValueRange', kind: 'condition' }]);
  });

  it('a recognized length condition renders minLength/maxLength', async () => {
    const out = await gen(`namespace test.constraints2

type Party:
  partyId string (1..1)

  condition PartyIdLength:
    partyId count >= 1 and partyId count <= 5
`);
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    const schemas = (doc['components'] as { schemas: Record<string, unknown> }).schemas;
    const party = schemas['Party'] as { properties: Record<string, Record<string, unknown>> };
    expect(party.properties['partyId']!['minLength']).toBe(1);
    expect(party.properties['partyId']!['maxLength']).toBe(5);
  });

  it('an unrecognized condition shape is left as opaque x-rune-conditions only (no keyword added)', async () => {
    const out = await gen(`namespace test.constraints3

type Trade:
  a string (0..1)
  b string (0..1)

  condition Weird:
    if a exists then b exists
`);
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    const schemas = (doc['components'] as { schemas: Record<string, unknown> }).schemas;
    const trade = schemas['Trade'] as { 'x-rune-conditions'?: unknown[] };
    expect(trade['x-rune-conditions']).toEqual([{ name: 'Weird', kind: 'condition' }]);
  });
});

describe('OpenApiNamespaceEmitter — funcs → RPC-style operations', () => {
  it('emits POST /functions/{FuncName} with operationId, requestBody (inputs), 200 response (output)', async () => {
    const out = await gen(`namespace test.funcs

func Double:
  inputs:
    value int (1..1)
  output:
    result int (1..1)
  set result: value
`);
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    const paths = doc['paths'] as Record<string, Record<string, unknown>>;
    const op = paths['/functions/Double']!['post'] as Record<string, unknown>;
    expect(op['operationId']).toBe('Double');
    const requestBody = op['requestBody'] as { content: { 'application/json': { schema: { properties: unknown } } } };
    expect(requestBody.content['application/json'].schema.properties).toEqual({
      value: { type: 'integer' }
    });
    const responses = op['responses'] as { '200': { content: { 'application/json': { schema: unknown } } } };
    expect(responses['200'].content['application/json'].schema).toEqual({ type: 'integer' });
  });

  it('marks optional inputs correctly in the requestBody schema (not required)', async () => {
    const out = await gen(`namespace test.funcs2

func Maybe:
  inputs:
    a int (1..1)
    b int (0..1)
  output:
    result int (1..1)
  set result: a
`);
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    const paths = doc['paths'] as Record<string, Record<string, unknown>>;
    const op = paths['/functions/Maybe']!['post'] as Record<string, unknown>;
    const schema = (op['requestBody'] as { content: { 'application/json': { schema: { required?: string[] } } } })
      .content['application/json'].schema;
    expect(schema.required).toEqual(['a']);
  });

  it('attaches the func↔operation carrier annotation info via x-rune-operation (so T4 can reconstruct the same string)', async () => {
    const out = await gen(`namespace test.funcs3

func Triple:
  inputs:
    value int (1..1)
  output:
    result int (1..1)
  set result: value
`);
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    const paths = doc['paths'] as Record<string, Record<string, unknown>>;
    const op = paths['/functions/Triple']!['post'] as Record<string, unknown>;
    expect(op['x-rune-operation']).toBe('POST /functions/Triple');
  });
});

describe('OpenApiNamespaceEmitter — YAML/JSON output format', () => {
  it('emits JSON when the relativePath has no explicit yaml option', async () => {
    const out = await gen(`namespace test.fmt

type T:
  a string (1..1)
`);
    expect(out[0]!.relativePath.endsWith('.json')).toBe(true);
    expect(() => JSON.parse(out[0]!.content)).not.toThrow();
  });

  it('emits YAML when openapi.format is "yaml"', async () => {
    const out = await gen(
      `namespace test.fmt2

type T:
  a string (1..1)
`,
      { openapi: { format: 'yaml' } }
    );
    expect(out[0]!.relativePath.endsWith('.yaml')).toBe(true);
    const parsed = parseYaml(out[0]!.content) as Record<string, unknown>;
    expect(parsed['openapi']).toMatch(/^3\.1\./);
  });
});

describe('OpenApiNamespaceEmitter — CRUD generation (opt-in emitter option)', () => {
  it('does NOT generate CRUD paths by default', async () => {
    const out = await gen(`namespace test.crud1

type Party:
  partyId string (1..1)
`);
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    const paths = doc['paths'] as Record<string, unknown>;
    expect(paths['/parties']).toBeUndefined();
  });

  it('generates the standard CRUD operation set when opted in for all types', async () => {
    const out = await gen(
      `namespace test.crud2

type Party:
  partyId string (1..1)
`,
      { openapi: { crud: true } }
    );
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    const paths = doc['paths'] as Record<string, Record<string, unknown>>;
    expect(Object.keys(paths['/parties']!).sort()).toEqual(['get', 'post']);
    expect(Object.keys(paths['/parties/{id}']!).sort()).toEqual(['delete', 'get', 'put']);
    const getById = paths['/parties/{id}']!['get'] as { responses: { '200': { content: unknown } } };
    expect(getById.responses['200'].content).toBeDefined();
  });

  it('CRUD generation can be scoped to selected type names', async () => {
    const out = await gen(
      `namespace test.crud3

type Party:
  partyId string (1..1)

type Trade:
  tradeId string (1..1)
`,
      { openapi: { crud: { types: ['Party'] } } }
    );
    const doc = JSON.parse(out[0]!.content) as Record<string, unknown>;
    const paths = doc['paths'] as Record<string, unknown>;
    expect(paths['/parties']).toBeDefined();
    expect(paths['/trades']).toBeUndefined();
  });
});
