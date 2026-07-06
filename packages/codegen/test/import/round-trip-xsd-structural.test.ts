// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * XSD structural round-trip oracle (spec 021 Phase 3): THE SINGLE-ARTIFACT
 * ORACLE — `.rune` → (real outbound `-t xsd` emitter, `xsd-emitter.ts`) →
 * (inbound `readXsd`, `xsd-reader.ts`) → `.rune`, asserting structural
 * identity: types, attributes, cardinalities, cross-type references, enum
 * values, the `extends` relationship, and a `required choice` condition
 * recovered as an `xs:choice` group — mirrors
 * `round-trip-openapi-emitter.test.ts`'s established single-artifact
 * pattern exactly (both directions built together in this same effort, so
 * — unlike the SQL/JSON-Schema pairs — a literal round trip is achievable,
 * per spec.md Phase 3's own "Oracle" paragraph).
 *
 * `renderModel`/`buildModel`/`readSql`-equivalent plumbing here is
 * `buildModel` + `readXsd`, matching `round-trip-sql-structural.test.ts`'s
 * `importToRune` helper shape.
 */

import { describe, it, expect } from 'vitest';
import { createRuneDslServices, parse } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/export.js';
import { readXsd } from '../../src/import/sources/xsd-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';

const SOURCE_RUNE = `namespace test.xsdroundtrip
version "1.0.0"

enum CurrencyEnum:
    USD
    EUR
    GBP

type Party:
    partyId string (1..1)
    partyName string (0..1)
    currency CurrencyEnum (0..1)

type Trade extends Party:
    notional number (1..1)
    counterparty Party (0..1)
    fixedRate number (0..1)
    floatingRate number (0..1)

    condition RateChoice:
        required choice fixedRate, floatingRate
`;

async function emitXsd(source: string): Promise<{ content: string; relativePath: string }> {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///xsdroundtrip.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  expect(doc.parseResult.parserErrors).toHaveLength(0);

  const outputs = await generate(doc, { target: 'xsd' } as never);
  expect(outputs.length).toBeGreaterThan(0);
  return { content: outputs[0]!.content, relativePath: outputs[0]!.relativePath };
}

function importXsdToRune(xml: string) {
  const { model, diagnostics } = readXsd(xml, { namespace: 'test.xsdroundtrip' });
  const built = buildModel(model);
  const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
  const lines = rendered.split('\n');
  if (built.synonymSourceDeclaration) {
    const versionIdx = lines.findIndex((l) => l.startsWith('version '));
    lines.splice(versionIdx + 1, 0, '', built.synonymSourceDeclaration);
  }
  return { model, text: lines.join('\n'), diagnostics: [...diagnostics, ...built.diagnostics] };
}

describe('THE ORACLE — .rune -> outbound `-t xsd` emitter -> inbound readXsd -> .rune', () => {
  it('emits a well-formed XSD document with the expected top-level shape', async () => {
    const { content, relativePath } = await emitXsd(SOURCE_RUNE);
    expect(relativePath.endsWith('.xsd')).toBe(true);
    expect(content).toContain('<xs:schema');
    expect(content).toContain('<xs:complexType name="Party">');
    expect(content).toContain('<xs:complexType name="Trade">');
    expect(content).toContain('<xs:simpleType name="CurrencyEnum">');
    expect(content).toContain('<xs:extension base="Party">');
  });

  it('recovers the same types, attributes, and cardinalities', async () => {
    const { content } = await emitXsd(SOURCE_RUNE);
    const { model } = importXsdToRune(content);

    const typeNames = model.types.map((t) => t.name).sort();
    expect(typeNames).toEqual(['Party', 'Trade']);

    const party = model.types.find((t) => t.name === 'Party')!;
    const partyAttrs = Object.fromEntries(party.attributes.map((a) => [a.sourceKey, a.cardinality]));
    expect(partyAttrs['partyId']).toEqual({ inf: 1, sup: 1 });
    expect(partyAttrs['partyName']).toEqual({ inf: 0, sup: 1 });
    expect(partyAttrs['currency']).toEqual({ inf: 0, sup: 1 });
  });

  it('recovers the inheritance relationship (Trade extends Party), without re-declaring Party attributes on Trade', async () => {
    const { content } = await emitXsd(SOURCE_RUNE);
    const { model } = importXsdToRune(content);

    const trade = model.types.find((t) => t.name === 'Trade')!;
    expect(trade.extends).toBe('Party');
    expect(trade.attributes.some((a) => a.sourceKey === 'partyId')).toBe(false);
    expect(trade.attributes.some((a) => a.sourceKey === 'partyName')).toBe(false);
  });

  it('recovers the reference attribute (Trade.counterparty -> Party) as a typed attribute', async () => {
    const { content } = await emitXsd(SOURCE_RUNE);
    const { model } = importXsdToRune(content);

    const trade = model.types.find((t) => t.name === 'Trade')!;
    const counterparty = trade.attributes.find((a) => a.sourceKey === 'counterparty');
    expect(counterparty).toBeDefined();
    expect(counterparty!.typeName).toBe('Party');
    expect(counterparty!.cardinality).toEqual({ inf: 0, sup: 1 });
  });

  it('recovers the enum and its values', async () => {
    const { content } = await emitXsd(SOURCE_RUNE);
    const { model } = importXsdToRune(content);

    expect(model.enums).toHaveLength(1);
    const currencyEnum = model.enums[0]!;
    expect(currencyEnum.name).toBe('CurrencyEnum');
    expect(currencyEnum.values.map((v) => v.name).sort()).toEqual(['EUR', 'GBP', 'USD']);

    const party = model.types.find((t) => t.name === 'Party')!;
    const currencyAttr = party.attributes.find((a) => a.sourceKey === 'currency')!;
    expect(currencyAttr.typeName).toBe('CurrencyEnum');
  });

  it('recovers the `required choice` condition as an xs:choice group -> (0..1) attributes + oneOf constraint', async () => {
    const { content } = await emitXsd(SOURCE_RUNE);
    expect(content).toContain('<xs:choice>');

    const { model } = importXsdToRune(content);
    const trade = model.types.find((t) => t.name === 'Trade')!;

    const fixedRate = trade.attributes.find((a) => a.sourceKey === 'fixedRate');
    const floatingRate = trade.attributes.find((a) => a.sourceKey === 'floatingRate');
    expect(fixedRate).toBeDefined();
    expect(floatingRate).toBeDefined();
    expect(fixedRate!.cardinality).toEqual({ inf: 0, sup: 1 });
    expect(floatingRate!.cardinality).toEqual({ inf: 0, sup: 1 });

    expect(trade.constraints).toEqual(
      expect.arrayContaining([{ kind: 'oneOf', paths: expect.arrayContaining(['fixedRate', 'floatingRate']) }])
    );
  });

  it('the re-imported .rune text parses with zero errors end to end (hard invariant)', async () => {
    const { content } = await emitXsd(SOURCE_RUNE);
    const { text, diagnostics } = importXsdToRune(content);

    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const parseResult = await parse(text);
    expect(parseResult.hasErrors).toBe(false);
    expect(text).toContain('type Party:');
    expect(text).toContain('type Trade extends Party:');
    expect(text).toContain('enum CurrencyEnum:');
    expect(text).toContain('required choice');
  });

  it('records the synonym source as Xsd', async () => {
    const { content } = await emitXsd(SOURCE_RUNE);
    expect(readXsd(content, { namespace: 'test.xsdroundtrip' }).model.sourceName).toBe('Xsd');
  });
});
