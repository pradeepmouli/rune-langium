// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Structural round-trip half of T5 (specs/021-codegen-inbound Phase 1 item
 * 7, split-oracle per the 2026-07-04 spec amendment).
 *
 * `.rune` → (real outbound JSON Schema emitter) → (inbound json-schema-reader)
 * → `.rune`, asserting structural equivalence: same types, attributes,
 * cardinalities, enums, inheritance. This half uses the REAL outbound
 * emitter as its oracle exactly as originally designed — the condition
 * half (round-trip-conditions.test.ts) does NOT use this oracle, since the
 * outbound emitter's own `x-rune-conditions` metadata is intentionally
 * opaque (see spec.md's "Round-Trip as a Test Oracle").
 */

import { describe, it, expect } from 'vitest';
import { createRuneDslServices, parse } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/index.js';
import { importModel } from '../../src/import/index.js';

const SOURCE_RUNE = `namespace test.roundtrip
version "1.0.0"

enum CurrencyEnum:
    USD
    EUR
    GBP

type Party:
    partyId string (1..1)
    partyName string (0..1)
    tags string (0..*)

type Employee extends Party:
    title string (0..1)
    reports string (2..5)
`;

async function emitJsonSchema(source: string): Promise<string> {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///roundtrip.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  expect(doc.parseResult.parserErrors).toHaveLength(0);

  const outputs = await generate(doc, { target: 'json-schema' });
  expect(outputs.length).toBeGreaterThan(0);
  return outputs[0]!.content;
}

describe('round-trip (structural half) — .rune -> outbound JSON Schema -> inbound -> .rune', () => {
  it('recovers the same types, attributes, and cardinalities', async () => {
    const schemaText = await emitJsonSchema(SOURCE_RUNE);
    const result = importModel(schemaText, { from: 'json-schema', namespace: 'test.roundtrip' });

    const parseResult = await parse(result.text);
    expect(parseResult.hasErrors).toBe(false);

    const typeNames = result.model.types.map((t) => t.name).sort();
    expect(typeNames).toEqual(['Employee', 'Party']);

    const party = result.model.types.find((t) => t.name === 'Party')!;
    const partyAttrs = Object.fromEntries(party.attributes.map((a) => [a.name, a.cardinality]));
    expect(partyAttrs['partyId']).toEqual({ inf: 1, sup: 1 });
    expect(partyAttrs['partyName']).toEqual({ inf: 0, sup: 1 });
    expect(partyAttrs['tags']).toEqual({ inf: 0 });
  });

  it('recovers the inheritance relationship (Employee extends Party)', async () => {
    const schemaText = await emitJsonSchema(SOURCE_RUNE);
    const result = importModel(schemaText, { from: 'json-schema', namespace: 'test.roundtrip' });

    const employee = result.model.types.find((t) => t.name === 'Employee')!;
    expect(employee.extends).toBe('Party');
    const employeeAttrNames = employee.attributes.map((a) => a.name).sort();
    // Only the ADDITIONAL attributes, not partyId/partyName/tags (inherited).
    expect(employeeAttrNames).toEqual(['reports', 'title']);
    const reports = employee.attributes.find((a) => a.name === 'reports')!;
    expect(reports.cardinality).toEqual({ inf: 2, sup: 5 });
  });

  it('recovers the enum and its values', async () => {
    const schemaText = await emitJsonSchema(SOURCE_RUNE);
    const result = importModel(schemaText, { from: 'json-schema', namespace: 'test.roundtrip' });

    const currencyEnum = result.model.enums.find((e) => e.name === 'CurrencyEnum');
    expect(currencyEnum).toBeDefined();
    expect(currencyEnum!.values.map((v) => v.name).sort()).toEqual(['EUR', 'GBP', 'USD']);
  });

  it('the re-imported .rune text parses with zero errors end to end (hard invariant)', async () => {
    const schemaText = await emitJsonSchema(SOURCE_RUNE);
    const result = importModel(schemaText, { from: 'json-schema', namespace: 'test.roundtrip' });
    const parseResult = await parse(result.text);
    expect(parseResult.hasErrors).toBe(false);
    expect(result.text).toContain('type Party:');
    expect(result.text).toContain('type Employee extends Party:');
    expect(result.text).toContain('enum CurrencyEnum:');
  });
});
