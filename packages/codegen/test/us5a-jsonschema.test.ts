// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * US5A JSON Schema target — Tier 1 fixture-diff tests.
 *
 * T090: cardinality fixture — assert specific JSON Schema cardinality encoding.
 * T091: enums fixture — assert enum shape + ajv meta-schema validation.
 * T092: byte-identical fixture-diff tests for both cardinality and enums fixtures.
 *
 * All tests parse the shared input.rune files and compare against committed
 * expected.schema.json fixtures (SC-007: byte-identical output required).
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import Ajv from 'ajv/dist/2020.js';
import { generate } from '../src/index.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures');

/**
 * Parse a .rune fixture and generate JSON Schema output.
 */
async function runJsonSchemaFixture(fixtureName: string): Promise<string> {
  const fixtureDir = join(FIXTURES_DIR, fixtureName);
  const inputPath = join(fixtureDir, 'input.rune');

  const content = await readFile(inputPath, 'utf-8');

  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    content,
    URI.parse(`inmemory:///${fixtureName}.rosetta`)
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);

  if (doc.parseResult.parserErrors.length > 0) {
    const msgs = doc.parseResult.parserErrors.map((e: { message: string }) => e.message).join(', ');
    throw new Error(`Parse errors in ${fixtureName}/input.rune: ${msgs}`);
  }

  const outputs = generate(doc, { target: 'json-schema' });
  if (outputs.length === 0) {
    throw new Error(`Generator produced no output for ${fixtureName}`);
  }
  return outputs[0]!.content;
}

/**
 * Parse the generated JSON Schema output string to an object.
 */
function parseSchema(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// T090 — Cardinality fixture: assert cardinality encoding shapes
// ---------------------------------------------------------------------------

describe('US5A T090: cardinality fixture — JSON Schema cardinality encoding', () => {
  it('(1..*) encodes as "type": "array", "minItems": 1', async () => {
    const content = await runJsonSchemaFixture('cardinality');
    const schema = parseSchema(content);
    const defs = schema['$defs'] as Record<string, unknown>;
    const cardTest = defs['CardTest'] as Record<string, unknown>;
    const props = cardTest['properties'] as Record<string, unknown>;

    const oneOrMore = props['oneOrMore'] as Record<string, unknown>;
    expect(oneOrMore['type']).toBe('array');
    expect(oneOrMore['minItems']).toBe(1);
    expect(oneOrMore['maxItems']).toBeUndefined();
  });

  it('(2..5) encodes as "type": "array", "minItems": 2, "maxItems": 5', async () => {
    const content = await runJsonSchemaFixture('cardinality');
    const schema = parseSchema(content);
    const defs = schema['$defs'] as Record<string, unknown>;
    const cardTest = defs['CardTest'] as Record<string, unknown>;
    const props = cardTest['properties'] as Record<string, unknown>;

    const bounded = props['bounded'] as Record<string, unknown>;
    expect(bounded['type']).toBe('array');
    expect(bounded['minItems']).toBe(2);
    expect(bounded['maxItems']).toBe(5);
  });

  it('(0..*) has no "minItems" or "maxItems"', async () => {
    const content = await runJsonSchemaFixture('cardinality');
    const schema = parseSchema(content);
    const defs = schema['$defs'] as Record<string, unknown>;
    const cardTest = defs['CardTest'] as Record<string, unknown>;
    const props = cardTest['properties'] as Record<string, unknown>;

    const zeroOrMore = props['zeroOrMore'] as Record<string, unknown>;
    expect(zeroOrMore['type']).toBe('array');
    expect(zeroOrMore['minItems']).toBeUndefined();
    expect(zeroOrMore['maxItems']).toBeUndefined();
  });

  it('(1..1) field is listed in "required" array', async () => {
    const content = await runJsonSchemaFixture('cardinality');
    const schema = parseSchema(content);
    const defs = schema['$defs'] as Record<string, unknown>;
    const cardTest = defs['CardTest'] as Record<string, unknown>;

    const required = cardTest['required'] as string[];
    expect(required).toContain('scalarAttr');
    // (0..1) field must NOT be required
    expect(required).not.toContain('optionalAttr');
  });

  it('(3..3) encodes as "type": "array", "minItems": 3, "maxItems": 3', async () => {
    const content = await runJsonSchemaFixture('cardinality');
    const schema = parseSchema(content);
    const defs = schema['$defs'] as Record<string, unknown>;
    const cardTest = defs['CardTest'] as Record<string, unknown>;
    const props = cardTest['properties'] as Record<string, unknown>;

    const exact = props['exact'] as Record<string, unknown>;
    expect(exact['type']).toBe('array');
    expect(exact['minItems']).toBe(3);
    expect(exact['maxItems']).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// T091 — Enums fixture: assert enum shape + ajv meta-schema validation
// ---------------------------------------------------------------------------

describe('US5A T091: enums fixture — enum shape and ajv meta-schema validation', () => {
  it('enum def has "enum": ["Buy", "Sell"] shape (using ColorEnum members)', async () => {
    const content = await runJsonSchemaFixture('enums');
    const schema = parseSchema(content);
    const defs = schema['$defs'] as Record<string, unknown>;
    const colorEnum = defs['ColorEnum'] as Record<string, unknown>;

    expect(colorEnum['type']).toBe('string');
    expect(colorEnum['enum']).toEqual(['Red', 'Green', 'Blue']);
  });

  it('StatusEnum has enum members without display names in the "enum" array', async () => {
    const content = await runJsonSchemaFixture('enums');
    const schema = parseSchema(content);
    const defs = schema['$defs'] as Record<string, unknown>;
    const statusEnum = defs['StatusEnum'] as Record<string, unknown>;

    expect(statusEnum['type']).toBe('string');
    expect(statusEnum['enum']).toEqual(['Active', 'Inactive', 'Pending']);
  });

  it('validates against JSON Schema 2020-12 meta-schema via ajv (cardinality fixture)', async () => {
    const content = await runJsonSchemaFixture('cardinality');
    const schema = parseSchema(content);

    const ajv = new Ajv({ strict: false });
    // Validate that the emitted schema itself is valid JSON Schema 2020-12
    const isValid = ajv.validateSchema(schema);
    expect(isValid).toBe(true);
    if (!isValid) {
      console.error('AJV schema validation errors:', ajv.errors);
    }
  });

  it('validates against JSON Schema 2020-12 meta-schema via ajv (enums fixture)', async () => {
    const content = await runJsonSchemaFixture('enums');
    const schema = parseSchema(content);

    const ajv = new Ajv({ strict: false });
    const isValid = ajv.validateSchema(schema);
    expect(isValid).toBe(true);
    if (!isValid) {
      console.error('AJV schema validation errors:', ajv.errors);
    }
  });
});

// ---------------------------------------------------------------------------
// T092 — Byte-identical fixture-diff tests
// ---------------------------------------------------------------------------

describe('US5A T092: byte-identical fixture-diff — cardinality', () => {
  it('generates byte-identical JSON Schema output for the cardinality fixture', async () => {
    const fixtureDir = join(FIXTURES_DIR, 'cardinality');
    const expectedPath = join(fixtureDir, 'expected.schema.json');

    const [actual, expected] = await Promise.all([
      runJsonSchemaFixture('cardinality'),
      readFile(expectedPath, 'utf-8')
    ]);

    expect(actual).toBe(expected);
  });
});

describe('US5A T092: byte-identical fixture-diff — enums', () => {
  it('generates byte-identical JSON Schema output for the enums fixture', async () => {
    const fixtureDir = join(FIXTURES_DIR, 'enums');
    const expectedPath = join(fixtureDir, 'expected.schema.json');

    const [actual, expected] = await Promise.all([
      runJsonSchemaFixture('enums'),
      readFile(expectedPath, 'utf-8')
    ]);

    expect(actual).toBe(expected);
  });
});
