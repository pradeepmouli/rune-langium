// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * T5 (spec 021 Phase 2 Addendum item 5, task order step 5) — round-trips a
 * Rune model through the outbound JSON Schema emitter, WRAPPED as an OAS
 * 3.0 `components.schemas` set, then back through the OpenAPI importer,
 * asserting structural equivalence.
 *
 * Mirrors `round-trip-structural.test.ts`'s SAME split-oracle rule from
 * Phase 1 (spec.md "Round-Trip as a Test Oracle" / the 2026-07-04
 * amendment): the outbound JSON Schema emitter's `x-rune-conditions`
 * metadata is intentionally opaque (no condition expression content), so
 * this suite — like its JSON-Schema-only counterpart — asserts STRUCTURAL
 * equivalence (types/attributes/cardinalities/enums/inheritance), not
 * condition-expression equivalence. Condition-expression coverage for the
 * OpenAPI path is already exercised end-to-end by openapi-reader.test.ts's
 * range/length assertions and openapi-fixtures.test.ts (those go through
 * REAL, hand-authored OpenAPI documents with genuine constraint keywords —
 * exactly the shape the JSON Schema path's own `round-trip-conditions.test.ts`
 * uses for its condition half, per the same spec.md rule).
 *
 * The wrapping step (`wrapAsOpenApiComponents`) is the actual NEW oracle
 * machinery this test adds: the outbound emitter emits `{ $defs: {...} }`
 * with internal refs as `#/$defs/X` (json-schema-emitter.ts, unchanged by
 * this effort); OAS 3.0's `components.schemas` uses `#/components/schemas/X`
 * instead. This wrapper is deliberately NOT part of the outbound emitter
 * (out of scope for this effort — the outbound emitters are shipped,
 * corpus-validated machinery) and lives only in this test file, exactly
 * mirroring how `round-trip-structural.test.ts`'s own `emitJsonSchema`
 * helper is local to that test file.
 */

import { describe, it, expect } from 'vitest';
import { createRuneDslServices, parse } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/export.js';
import { readOpenApi } from '../../src/import/sources/openapi-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';

const SOURCE_RUNE = `namespace test.roundtrip.openapi
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

async function emitJsonSchemaDefs(source: string): Promise<Record<string, unknown>> {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///roundtrip-openapi.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  expect(doc.parseResult.parserErrors).toHaveLength(0);

  const outputs = await generate(doc, { target: 'json-schema' });
  expect(outputs.length).toBeGreaterThan(0);
  const parsed = JSON.parse(outputs[0]!.content) as { $defs?: Record<string, unknown> };
  return parsed.$defs ?? {};
}

/** Rewrites every `#/$defs/X` ref (recursively, anywhere in the tree) to `#/components/schemas/X` and wraps the result as a minimal OAS 3.0 document's `components.schemas`. */
function wrapAsOpenApiComponents(defs: Record<string, unknown>, title: string): object {
  return {
    openapi: '3.0.3',
    info: { title, version: '1.0.0' },
    paths: {},
    components: { schemas: rewriteDefsRefs(defs) }
  };
}

function rewriteDefsRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteDefsRefs);
  if (typeof node !== 'object' || node === null) return node;
  const entries = Object.entries(node as Record<string, unknown>).map(([k, v]) => {
    if (k === '$ref' && typeof v === 'string') {
      return [k, v.replace(/^#\/\$defs\//, '#/components/schemas/')];
    }
    return [k, rewriteDefsRefs(v)];
  });
  return Object.fromEntries(entries);
}

function importOpenApiToRune(doc: object) {
  const { model, diagnostics } = readOpenApi(doc as never);
  const built = buildModel(model);
  const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
  return { model, text: rendered, diagnostics: [...diagnostics, ...built.diagnostics] };
}

describe('round-trip (OpenAPI) — .rune -> outbound JSON Schema -> OAS 3.0 components.schemas -> inbound openapi -> .rune', () => {
  it('recovers the same types, attributes, and cardinalities', async () => {
    const defs = await emitJsonSchemaDefs(SOURCE_RUNE);
    const doc = wrapAsOpenApiComponents(defs, 'Roundtrip Openapi Demo');
    const result = importOpenApiToRune(doc);

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

  it('recovers the inheritance relationship (Employee extends Party) through allOf + the rewritten $ref', async () => {
    const defs = await emitJsonSchemaDefs(SOURCE_RUNE);
    const doc = wrapAsOpenApiComponents(defs, 'Roundtrip Openapi Demo');
    const result = importOpenApiToRune(doc);

    const employee = result.model.types.find((t) => t.name === 'Employee')!;
    expect(employee.extends).toBe('Party');
    const employeeAttrNames = employee.attributes.map((a) => a.name).sort();
    expect(employeeAttrNames).toEqual(['reports', 'title']);
    const reports = employee.attributes.find((a) => a.name === 'reports')!;
    expect(reports.cardinality).toEqual({ inf: 2, sup: 5 });
  });

  it('recovers the enum and its values', async () => {
    const defs = await emitJsonSchemaDefs(SOURCE_RUNE);
    const doc = wrapAsOpenApiComponents(defs, 'Roundtrip Openapi Demo');
    const result = importOpenApiToRune(doc);

    const currencyEnum = result.model.enums.find((e) => e.name === 'CurrencyEnum');
    expect(currencyEnum).toBeDefined();
    expect(currencyEnum!.values.map((v) => v.name).sort()).toEqual(['EUR', 'GBP', 'USD']);
  });

  it('the re-imported .rune text parses with zero errors end to end (the inbound hard invariant)', async () => {
    const defs = await emitJsonSchemaDefs(SOURCE_RUNE);
    const doc = wrapAsOpenApiComponents(defs, 'Roundtrip Openapi Demo');
    const result = importOpenApiToRune(doc);

    const parseResult = await parse(result.text);
    expect(parseResult.hasErrors).toBe(false);
    expect(result.text).toContain('type Party:');
    expect(result.text).toContain('type Employee extends Party:');
    expect(result.text).toContain('enum CurrencyEnum:');
  });

  it('records the synonym source as OpenApi even though the content originated from the outbound JSON Schema emitter', async () => {
    const defs = await emitJsonSchemaDefs(SOURCE_RUNE);
    const doc = wrapAsOpenApiComponents(defs, 'Roundtrip Openapi Demo');
    expect(readOpenApi(doc as never).model.sourceName).toBe('OpenApi');
  });
});
