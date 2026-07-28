// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * T5 (spec.md Phase 2b Implementation Addendum decision 6) — THE SINGLE-
 * ARTIFACT ORACLE: `Rune → OpenAPI emitter (T3) → OpenAPI reader (T4) →
 * Rune`, as an identity for types/attributes/cardinality/enums/inheritance,
 * RECOGNIZABLE conditions (through T1's keywords), and funcs (through T3's
 * operations + T2's carrier).
 *
 * This is the oracle the Phase 2 JSON Schema pair (`round-trip-openapi.test.ts`)
 * COULDN'T have: that suite drives the outbound JSON SCHEMA emitter (whose
 * `x-rune-conditions` metadata is deliberately opaque — no keyword content)
 * wrapped as OAS components by a TEST-LOCAL helper. Here, the REAL `-t
 * openapi` emitter (T3) is driven directly via `generate()` — no wrapping
 * helper needed, since T3 already emits `components.schemas` natively —
 * and its own constraint-keyword rendering (T1) plus func→operation
 * translation (T3/T4/T2) make conditions and funcs round-trippable through
 * ONE emitted artifact for the first time in this feature.
 *
 * Plus: a YAML round trip (emit YAML via `options.openapi.format`, parse it
 * back with the same reader) — the reader auto-detects YAML vs JSON
 * (`parseOpenApiDocument`), so this is a real, not merely notional, check.
 */

import { describe, it, expect } from 'vitest';
import { createRuneDslServices, parse } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/export.js';
import { readOpenApi, parseOpenApiDocument } from '../../src/import/sources/openapi-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { treesEquivalent } from '../emit/rosetta/expression-tree-equivalence.js';

const SOURCE_RUNE = `namespace test.roundtrip.openapiemitter
version "1.0.0"

enum CurrencyEnum:
    USD
    EUR
    GBP

type Party:
    partyId string (1..1)
    partyName string (0..1)
    tags string (0..*)

    condition PartyIdLength:
        partyId count >= 1

type Employee extends Party:
    title string (0..1)
    reports string (2..5)

func Greet:
    inputs:
        name string (1..1)
    output:
        result string (1..1)
    set result: name
`;

async function emitOpenApi(
  source: string,
  options: Record<string, unknown> = {}
): Promise<{
  content: string;
  relativePath: string;
}> {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///roundtrip-openapi-emitter.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  expect(doc.parseResult.parserErrors).toHaveLength(0);

  const outputs = await generate(doc, { target: 'openapi', ...options } as never);
  expect(outputs.length).toBeGreaterThan(0);
  return { content: outputs[0]!.content, relativePath: outputs[0]!.relativePath };
}

function importOpenApiDocToRune(parsedDoc: unknown) {
  const { model, diagnostics } = readOpenApi(parsedDoc as never);
  const built = buildModel(model);
  const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
  const lines = rendered.split('\n');
  const declarations = [built.synonymSourceDeclaration, built.operationAnnotationDeclaration].filter(
    (d): d is string => d !== undefined
  );
  if (declarations.length > 0) {
    const versionIdx = lines.findIndex((l) => l.startsWith('version '));
    lines.splice(versionIdx + 1, 0, ...declarations.flatMap((d) => ['', d]));
  }
  return { model, text: lines.join('\n'), diagnostics: [...diagnostics, ...built.diagnostics] };
}

describe('THE ORACLE — .rune -> outbound `-t openapi` emitter (T3) -> inbound openapi (T4) -> .rune', () => {
  it('recovers the same types, attributes, and cardinalities', async () => {
    const { content } = await emitOpenApi(SOURCE_RUNE);
    const result = importOpenApiDocToRune(JSON.parse(content));

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
    const { content } = await emitOpenApi(SOURCE_RUNE);
    const result = importOpenApiDocToRune(JSON.parse(content));

    const employee = result.model.types.find((t) => t.name === 'Employee')!;
    expect(employee.extends).toBe('Party');
    const employeeAttrNames = employee.attributes.map((a) => a.name).sort();
    expect(employeeAttrNames).toEqual(['reports', 'title']);
    const reports = employee.attributes.find((a) => a.name === 'reports')!;
    expect(reports.cardinality).toEqual({ inf: 2, sup: 5 });
  });

  it('recovers the enum and its values', async () => {
    const { content } = await emitOpenApi(SOURCE_RUNE);
    const result = importOpenApiDocToRune(JSON.parse(content));

    const currencyEnum = result.model.enums.find((e) => e.name === 'CurrencyEnum');
    expect(currencyEnum).toBeDefined();
    expect(currencyEnum!.values.map((v) => v.name).sort()).toEqual(['EUR', 'GBP', 'USD']);
  });

  it('THE NEW CAPABILITY: recovers the RECOGNIZABLE condition (length via minLength keyword) tree-equivalent to the original — impossible through the JSON Schema pair', async () => {
    const { content } = await emitOpenApi(SOURCE_RUNE);
    // Confirm the keyword really is in the emitted artifact (not asserting
    // against opaque metadata only).
    const doc = JSON.parse(content) as {
      components: { schemas: Record<string, { properties: Record<string, unknown> }> };
    };
    expect((doc.components.schemas['Party']!.properties['partyId'] as Record<string, unknown>)['minLength']).toBe(1);

    const result = importOpenApiDocToRune(doc);
    const parseResult = await parse(result.text);
    expect(parseResult.hasErrors).toBe(false);

    const partyModel = result.model.types.find((t) => t.name === 'Party')!;
    // Find the recognized length constraint on partyId (attribute-level, per json-schema-reader's own convention).
    const partyIdAttr = partyModel.attributes.find((a) => a.name === 'partyId')!;
    expect(partyIdAttr.constraints).toContainEqual({ kind: 'length', path: 'partyId', min: 1 });

    // Tree-equivalence: the imported condition's expression vs. a hand-written expectation.
    const parsedResultAst = await parse(result.text);
    const partyNode = parsedResultAst.value.elements.find(
      (e) => (e as { $type?: string; name?: string }).$type === 'Data' && (e as { name?: string }).name === 'Party'
    ) as { conditions?: Array<{ expression: unknown }> } | undefined;
    expect(partyNode?.conditions?.length).toBeGreaterThan(0);
    const importedExpr = partyNode!.conditions![0]!.expression;

    const expectedParse = await parse(
      'namespace test.expect\nversion "0.0.0"\n\ntype Party:\n  partyId string (1..1)\n\n  condition PartyIdLength:\n    partyId count >= 1\n'
    );
    expect(expectedParse.hasErrors).toBe(false);
    const expectedData = expectedParse.value.elements.find((e) => (e as { $type?: string }).$type === 'Data') as {
      conditions?: Array<{ expression: unknown }>;
    };
    const expectedExpr = expectedData.conditions![0]!.expression;

    expect(treesEquivalent(importedExpr, expectedExpr)).toBe(true);
  });

  it('THE NEW CAPABILITY: recovers the func (name/inputs/output/definition) + the carrier, through operations — impossible through the JSON Schema pair', async () => {
    const { content } = await emitOpenApi(SOURCE_RUNE);
    const doc = JSON.parse(content) as { paths: Record<string, Record<string, { 'x-rune-operation'?: string }>> };
    expect(doc.paths['/functions/Greet']!['post']!['x-rune-operation']).toBe('POST /functions/Greet');

    const result = importOpenApiDocToRune(doc);
    const parseResult = await parse(result.text);
    expect(parseResult.hasErrors).toBe(false);

    const greetFunc = result.model.funcs.find((f) => f.name === 'Greet')!;
    expect(greetFunc).toBeDefined();
    expect(greetFunc.inputs).toEqual([{ name: 'name', typeName: 'string', cardinality: { inf: 1, sup: 1 } }]);
    expect(greetFunc.output).toEqual({ name: 'result', typeName: 'string', cardinality: { inf: 1, sup: 1 } });
    expect(greetFunc.operation).toBe('POST /functions/Greet');

    expect(result.text).toContain('func Greet:');
    expect(result.text).toContain('[openApi op "value"="POST /functions/Greet"]');
  });

  it('the re-imported .rune text parses with zero errors end to end (the inbound hard invariant)', async () => {
    const { content } = await emitOpenApi(SOURCE_RUNE);
    const result = importOpenApiDocToRune(JSON.parse(content));

    const parseResult = await parse(result.text);
    expect(parseResult.hasErrors).toBe(false);
    expect(result.text).toContain('type Party:');
    expect(result.text).toContain('type Employee extends Party:');
    expect(result.text).toContain('enum CurrencyEnum:');
    expect(result.text).toContain('func Greet:');
  });

  it('YAML round trip: emit YAML (T3), read it back (T4 auto-detects), identical structural result', async () => {
    const { content, relativePath } = await emitOpenApi(SOURCE_RUNE, { openapi: { format: 'yaml' } });
    expect(relativePath.endsWith('.yaml')).toBe(true);

    const parsedFromYaml = parseOpenApiDocument(content);
    const result = importOpenApiDocToRune(parsedFromYaml);
    const parseResult = await parse(result.text);
    expect(parseResult.hasErrors).toBe(false);

    const typeNames = result.model.types.map((t) => t.name).sort();
    expect(typeNames).toEqual(['Employee', 'Party']);
    expect(result.model.funcs.map((f) => f.name)).toEqual(['Greet']);
  });

  it('records the synonym source as OpenApi', async () => {
    const { content } = await emitOpenApi(SOURCE_RUNE);
    expect(readOpenApi(JSON.parse(content) as never).model.sourceName).toBe('OpenApi');
  });
});
