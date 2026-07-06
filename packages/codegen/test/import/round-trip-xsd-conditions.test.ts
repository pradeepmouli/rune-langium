// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * XSD constraint round-trip oracle (spec 021 Phase 3): THE SINGLE-ARTIFACT
 * ORACLE, condition half — `.rune` (with hand-written `range`/`length`
 * conditions) → outbound `-t xsd` emitter → inbound `readXsd` → `.rune`,
 * asserting the recovered conditions are TREE-EQUIVALENT (via
 * `treesEquivalent`) to the ORIGINAL source's own condition ASTs — not a
 * hand-written DDL/JSON-Schema-style split oracle (unlike
 * `round-trip-sql-conditions.test.ts`, which had to fall back to a
 * hand-written-DDL half because the SQL emitter never emits comparison
 * CHECKs outbound): the real XSD emitter DOES emit `xs:minInclusive` /
 * `xs:maxExclusive` / `xs:minLength` / `xs:maxLength` facets, and the
 * reader already translates those facets back into `range`/`length`
 * ConstraintIRs (`xsd-reader.test.ts`'s own "restriction numeric/string
 * facets" suite) — so this is a literal single-artifact round trip,
 * exactly like `round-trip-openapi-emitter.test.ts`'s condition case.
 *
 * FINDING (recorded, not silently worked around): `constraint-recognizer.
 * ts`'s `readRangeOrLength` deliberately REJECTS a single `range` condition
 * whose two bounds have DIFFERING exclusivity (`notional >= 0 and notional
 * < 1000000` — inclusive min, exclusive max) — see that file's own
 * "REGRESSION FIX" doc comment: a genuinely mixed-exclusivity PAIR is not
 * representable as one `range` IR (the IR carries a single `exclusive` flag
 * for the whole constraint), so such a condition is UNRECOGNIZED end to end
 * (this emitter never sees it, matches the SQL/OpenAPI emitters' identical
 * behavior since they share the same recognizer). This is orthogonal to
 * XSD's OWN restriction-facet shape, which DOES support mixed per-bound
 * exclusivity natively in one `xs:restriction` (`constraintIRToXsdFacets`
 * combines both bounds from a single recognized `range` IR when its own
 * `exclusive` flag applies uniformly) — so "mixed exclusivity on both
 * bounds" is exercised here across TWO independent single-bound `range`
 * conditions on two different attributes (one exclusive-min-only, one
 * inclusive-max-only), each independently recognizable, rather than one
 * combined two-bound condition with differing per-bound exclusivity (which
 * the shared recognizer cannot accept as input in the first place — a
 * pre-existing constraint-recognizer limitation, not an XSD-emitter gap).
 *
 * Covers: an exclusive-min-only range, an inclusive-max-only range (the two
 * together exercise both exclusivity flavors), and a length constraint
 * (min+max, distinct bounds so it does NOT collapse to `xs:length`).
 */

import { describe, it, expect } from 'vitest';
import { createRuneDslServices, parse } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/export.js';
import { readXsd } from '../../src/import/sources/xsd-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { treesEquivalent } from '../emit/rosetta/expression-tree-equivalence.js';

const SOURCE_RUNE = `namespace test.xsdconditions
version "1.0.0"

type Trade:
    notional number (1..1)
    price number (1..1)
    code string (1..1)

    condition NotionalRange:
        notional > 0

    condition PriceRange:
        price <= 1000000

    condition CodeLength:
        code count >= 2 and code count <= 10
`;

async function emitXsd(source: string): Promise<string> {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///xsdconditions.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  expect(doc.parseResult.parserErrors).toHaveLength(0);

  const outputs = await generate(doc, { target: 'xsd' } as never);
  expect(outputs.length).toBeGreaterThan(0);
  return outputs[0]!.content;
}

function importXsdToRune(xml: string) {
  const { model, diagnostics } = readXsd(xml, { namespace: 'test.xsdconditions' });
  const built = buildModel(model);
  const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
  const lines = rendered.split('\n');
  if (built.synonymSourceDeclaration) {
    const versionIdx = lines.findIndex((l) => l.startsWith('version '));
    lines.splice(versionIdx + 1, 0, '', built.synonymSourceDeclaration);
  }
  return { model, text: lines.join('\n'), diagnostics: [...diagnostics, ...built.diagnostics] };
}

type DataLike = { $type: string; name?: string; conditions?: Array<{ name?: string; expression: unknown }> };

function dataByName(elements: readonly unknown[], name: string): DataLike {
  const data = elements.find((e) => (e as DataLike).$type === 'Data' && (e as DataLike).name === name) as
    | DataLike
    | undefined;
  expect(data).toBeDefined();
  return data!;
}

async function conditionsByAttrPath(source: string, typeName: string): Promise<Record<string, unknown>> {
  const result = await parse(source);
  expect(result.hasErrors).toBe(false);
  const data = dataByName(result.value.elements, typeName);
  const out: Record<string, unknown> = {};
  for (const c of data.conditions ?? []) {
    if (c.name) out[c.name] = c.expression;
  }
  return out;
}

describe('THE ORACLE — .rune (range/length conditions) -> outbound xsd emitter -> inbound readXsd -> .rune, tree-equivalence', () => {
  it('emits an exclusive-min range facet as a separately-named top-level simpleType, referenced from the element via @_type', async () => {
    const xml = await emitXsd(SOURCE_RUNE);
    expect(xml).toContain('<xs:minExclusive value="0"/>');
    // FINDING (see xsd-emitter.ts's module doc): xsd-reader.ts only ever
    // resolves scalar facets through a NAMED top-level simpleType via
    // @_type — an inline anonymous nested restriction is silently ignored
    // by the reader (verified empirically), so the emitter must synthesize
    // a named simpleType rather than nest the restriction inline.
    expect(xml).toMatch(
      /<xs:simpleType name="NotionalType">\s*<xs:restriction base="xs:decimal">\s*<xs:minExclusive value="0"\/>/
    );
    expect(xml).toContain('<xs:element name="notional" type="NotionalType"/>');
  });

  it('emits an inclusive-max range facet the same named-top-level-simpleType way', async () => {
    const xml = await emitXsd(SOURCE_RUNE);
    expect(xml).toContain('<xs:maxInclusive value="1000000"/>');
    expect(xml).toMatch(
      /<xs:simpleType name="PriceType">\s*<xs:restriction base="xs:decimal">\s*<xs:maxInclusive value="1000000"\/>/
    );
    expect(xml).toContain('<xs:element name="price" type="PriceType"/>');
  });

  it('emits the length facets (min+max, distinct bounds) as minLength/maxLength', async () => {
    const xml = await emitXsd(SOURCE_RUNE);
    expect(xml).toContain('<xs:minLength value="2"/>');
    expect(xml).toContain('<xs:maxLength value="10"/>');
  });

  it('recovers the exclusive-min range condition as tree-equivalent to the original', async () => {
    const xml = await emitXsd(SOURCE_RUNE);
    const { text, diagnostics } = importXsdToRune(xml);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const parseResult = await parse(text);
    expect(parseResult.hasErrors).toBe(false);

    const importedConds = await conditionsByAttrPath(text, 'Trade');
    const expectedConds = await conditionsByAttrPath(SOURCE_RUNE, 'Trade');

    // Condition NAMES are regenerated deterministically by the reader
    // (`<AttributeName><Kind>`), independent of the original source's own
    // names — match by recognized ConstraintIR path/kind instead of by name.
    const importedRange = Object.values(importedConds).find(
      (expr) =>
        (expr as { $type?: string }).$type === 'ComparisonOperation' && (expr as { operator?: string }).operator === '>'
    );
    expect(importedRange).toBeDefined();
    expect(treesEquivalent(importedRange, expectedConds['NotionalRange'])).toBe(true);
  });

  it('recovers the inclusive-max range condition as tree-equivalent to the original', async () => {
    const xml = await emitXsd(SOURCE_RUNE);
    const { text } = importXsdToRune(xml);

    const importedConds = await conditionsByAttrPath(text, 'Trade');
    const expectedConds = await conditionsByAttrPath(SOURCE_RUNE, 'Trade');

    const importedRange = Object.values(importedConds).find(
      (expr) =>
        (expr as { $type?: string }).$type === 'ComparisonOperation' &&
        (expr as { operator?: string }).operator === '<='
    );
    expect(importedRange).toBeDefined();
    expect(treesEquivalent(importedRange, expectedConds['PriceRange'])).toBe(true);
  });

  it('recovers the length condition as tree-equivalent to the original', async () => {
    const xml = await emitXsd(SOURCE_RUNE);
    const { text } = importXsdToRune(xml);

    const importedConds = await conditionsByAttrPath(text, 'Trade');
    const expectedConds = await conditionsByAttrPath(SOURCE_RUNE, 'Trade');

    const importedLength = Object.values(importedConds).find(
      (expr) => (expr as { $type?: string }).$type === 'LogicalOperation'
    );
    expect(importedLength).toBeDefined();
    expect(treesEquivalent(importedLength, expectedConds['CodeLength'])).toBe(true);
  });

  it('the re-imported .rune text parses with zero errors end to end (hard invariant)', async () => {
    const xml = await emitXsd(SOURCE_RUNE);
    const { text } = importXsdToRune(xml);
    const parseResult = await parse(text);
    expect(parseResult.hasErrors).toBe(false);
    expect(text).toContain('type Trade:');
  });
});

// --- Finding 5 (coupled reader+emitter fix): optional choice round trip -----

const OPTIONAL_CHOICE_SOURCE_RUNE = `namespace test.xsdoptionalchoice
version "1.0.0"

type Rate:
    fixedRate number (0..1)
    floatingRate number (0..1)

    condition RateChoice:
        optional choice fixedRate, floatingRate
`;

async function emitXsdOptionalChoice(source: string): Promise<string> {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///xsdoptionalchoice.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  expect(doc.parseResult.parserErrors).toHaveLength(0);

  const outputs = await generate(doc, { target: 'xsd' } as never);
  expect(outputs.length).toBeGreaterThan(0);
  return outputs[0]!.content;
}

describe('THE ORACLE — optional choice (Finding 5 coupled fix): .rune -> outbound xsd emitter -> inbound readXsd -> .rune', () => {
  it('emits <xs:choice minOccurs="0"> (the whole group optional), with NEITHER member carrying its own minOccurs', async () => {
    const xml = await emitXsdOptionalChoice(OPTIONAL_CHOICE_SOURCE_RUNE);
    expect(xml).toContain('<xs:choice minOccurs="0">');
    const choiceBlock = xml.slice(xml.indexOf('<xs:choice minOccurs="0">'), xml.indexOf('</xs:choice>'));
    // The wrapping tag itself is the only minOccurs occurrence in the block
    // — neither <xs:element> member gets its own (Finding 4's fix applies
    // identically to an optional choice group).
    expect(choiceBlock.match(/minOccurs/g)?.length ?? 0).toBe(1);
  });

  it('recovers an OPTIONAL choice constraint ({kind: "choice"}), not a mandatory oneOf', async () => {
    const xml = await emitXsdOptionalChoice(OPTIONAL_CHOICE_SOURCE_RUNE);
    const { model, diagnostics } = importXsdToRune(xml);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const rate = model.types.find((t) => t.name === 'Rate')!;
    expect(rate.constraints).toEqual(
      expect.arrayContaining([{ kind: 'choice', paths: expect.arrayContaining(['fixedRate', 'floatingRate']) }])
    );
  });

  it('the re-imported .rune text renders "optional choice" (not "required choice") and parses with zero errors', async () => {
    const xml = await emitXsdOptionalChoice(OPTIONAL_CHOICE_SOURCE_RUNE);
    const { text, diagnostics } = importXsdToRune(xml);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    expect(text).toContain('optional choice fixedRate, floatingRate');
    expect(text).not.toContain('required choice');

    const parseResult = await parse(text);
    expect(parseResult.hasErrors).toBe(false);
  });
});
