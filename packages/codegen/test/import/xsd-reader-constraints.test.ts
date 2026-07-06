// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * xsd-reader T2 — constraint-gap closure (spec 021 Phase 3's exact facet
 * mapping): every restriction facet exercised end to end through `readXsd`
 * -> `buildModel` -> `.rune` text, with tree-equivalence against a
 * hand-written `.rune` expectation for every condition-producing case —
 * mirrors `sql-reader-constraints.test.ts`'s established pattern (one
 * `describe` block per construct).
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { treesEquivalent } from '../emit/rosetta/expression-tree-equivalence.js';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { readXsd, type XsdImportOptions } from '../../src/import/sources/xsd-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';

type DataLike = { $type: string; conditions?: Array<{ name?: string; expression: unknown }> };

function firstDataElement(elements: readonly unknown[]): DataLike {
  const data = elements.find((e) => (e as DataLike).$type === 'Data') as DataLike | undefined;
  expect(data).toBeDefined();
  return data!;
}

async function conditionsByName(source: string): Promise<Record<string, unknown>> {
  const result = await parse(source);
  expect(result.hasErrors).toBe(false);
  const data = firstDataElement(result.value.elements);
  const out: Record<string, unknown> = {};
  for (const c of data.conditions ?? []) {
    if (c.name) out[c.name] = c.expression;
  }
  return out;
}

/** Mirrors sql-reader-constraints.test.ts's `importToRune` helper exactly, for the xsd-reader. */
async function importToRune(
  xml: string,
  options?: XsdImportOptions
): Promise<{ text: string; model: ReturnType<typeof readXsd>['model']; diagnostics: unknown[] }> {
  const { model, diagnostics: readerDiagnostics } = readXsd(xml, { namespace: 'test.xsd', ...options });
  const built = buildModel(model);
  const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
  const lines = rendered.split('\n');
  if (built.synonymSourceDeclaration) {
    const versionIdx = lines.findIndex((l) => l.startsWith('version '));
    lines.splice(versionIdx + 1, 0, '', built.synonymSourceDeclaration);
  }
  return { text: lines.join('\n'), model, diagnostics: [...readerDiagnostics, ...built.diagnostics] };
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

function scalarRestrictionXml(facetsXml: string, elementType = 'xs:decimal'): string {
  return `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="Restricted">
    <xs:restriction base="${elementType}">
      ${facetsXml}
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="T">
    <xs:sequence>
      <xs:element name="notional" type="Restricted"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
}

describe('xsd-reader constraints — xs:minInclusive/xs:maxInclusive -> range (inclusive)', () => {
  it('minInclusive -> range { min }', async () => {
    const xml = scalarRestrictionXml('<xs:minInclusive value="0"/>');
    const { text } = await importToRune(xml);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  notional number (1..1)\n\n  condition NotionalRange:\n    notional >= 0\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });

  it('maxInclusive -> range { max }', async () => {
    const xml = scalarRestrictionXml('<xs:maxInclusive value="100"/>');
    const { text } = await importToRune(xml);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  notional number (1..1)\n\n  condition NotionalRange:\n    notional <= 100\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });
});

describe('xsd-reader constraints — xs:minExclusive/xs:maxExclusive -> range { exclusive: true }', () => {
  it('minExclusive -> range { min, exclusive }', async () => {
    const xml = scalarRestrictionXml('<xs:minExclusive value="0"/>');
    const { text } = await importToRune(xml);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  notional number (1..1)\n\n  condition NotionalRange:\n    notional > 0\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });

  it('maxExclusive -> range { max, exclusive }', async () => {
    const xml = scalarRestrictionXml('<xs:maxExclusive value="100"/>');
    const { text } = await importToRune(xml);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  notional number (1..1)\n\n  condition NotionalRange:\n    notional < 100\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });

  it('mixed exclusivity (minInclusive + maxExclusive) never coalesces into one shared-flag IR — the per-bound-exclusivity discipline', async () => {
    const xml = scalarRestrictionXml('<xs:minInclusive value="0"/><xs:maxExclusive value="100"/>');
    const { text, model } = await importToRune(xml);
    const attr = model.types[0]!.attributes[0]!;
    expect(attr.constraints).toEqual([
      { kind: 'range', path: 'notional', min: 0 },
      { kind: 'range', path: 'notional', max: 100, exclusive: true }
    ]);
    // Each bound becomes its OWN condition (NotionalRange / NotionalRange2)
    // — matches every other reader's per-bound-exclusivity discipline: two
    // `range` IRs for the same path are two independent Condition nodes,
    // never merged into one `and`-combined expression.
    const imported = await conditionsByName(text);
    const conditionNames = Object.keys(imported);
    expect(conditionNames).toEqual(['NotionalRange', 'NotionalRange2']);
    const expectedMin = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  notional number (1..1)\n\n  condition NotionalRange:\n    notional >= 0\n'
    );
    const expectedMax = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  notional number (1..1)\n\n  condition NotionalRange:\n    notional < 100\n'
    );
    expect(treesEquivalent(imported['NotionalRange'], expectedMin['NotionalRange'])).toBe(true);
    expect(treesEquivalent(imported['NotionalRange2'], expectedMax['NotionalRange'])).toBe(true);
    await assertParses(text);
  });
});

describe('xsd-reader constraints — xs:pattern (always a stub, no expression-level regex)', () => {
  it('emits a pattern stub condition + an untranslatable-construct diagnostic', async () => {
    const xml = scalarRestrictionXml('<xs:pattern value="[A-Z]{3}"/>', 'xs:string');
    const { text, model, diagnostics } = await importToRune(xml);
    const attr = model.types[0]!.attributes[0]!;
    expect(attr.constraints).toEqual([{ kind: 'pattern', path: 'notional', regex: '[A-Z]{3}' }]);
    expect(
      diagnostics.some(
        (d) =>
          (d as { code: string }).code === 'untranslatable-construct' &&
          (d as { message: string }).message.includes('[A-Z]{3}')
      )
    ).toBe(true);
    expect(text).toContain('condition NotionalPattern:');
    await assertParses(text);
  });
});

describe('xsd-reader constraints — xs:minLength/xs:maxLength/xs:length -> length', () => {
  it('minLength + maxLength -> length { min, max }', async () => {
    const xml = scalarRestrictionXml('<xs:minLength value="2"/><xs:maxLength value="10"/>', 'xs:string');
    const { text, model } = await importToRune(xml);
    const attr = model.types[0]!.attributes[0]!;
    expect(attr.constraints).toEqual([{ kind: 'length', path: 'notional', min: 2, max: 10 }]);
    expect(text).toContain('condition NotionalLength:');
    await assertParses(text);
  });

  it('length alone -> length { min, max } both equal to the fixed length', async () => {
    const xml = scalarRestrictionXml('<xs:length value="5"/>', 'xs:string');
    const { model } = await importToRune(xml);
    const attr = model.types[0]!.attributes[0]!;
    expect(attr.constraints).toEqual([{ kind: 'length', path: 'notional', min: 5, max: 5 }]);
  });

  it('maxLength alone -> length { max } only', async () => {
    const xml = scalarRestrictionXml('<xs:maxLength value="10"/>', 'xs:string');
    const { model } = await importToRune(xml);
    const attr = model.types[0]!.attributes[0]!;
    expect(attr.constraints).toEqual([{ kind: 'length', path: 'notional', max: 10 }]);
  });
});

describe('xsd-reader constraints — xs:choice -> required choice condition', () => {
  it('two choice members -> a type-level oneOf ConstraintIR rendering as "required choice a, b"', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="Rate">
    <xs:sequence>
      <xs:choice>
        <xs:element name="fixedRate" type="xs:decimal"/>
        <xs:element name="floatingRate" type="xs:decimal"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = await importToRune(xml);
    expect(model.types[0]!.constraints).toEqual([{ kind: 'oneOf', paths: ['fixedRate', 'floatingRate'] }]);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype Rate:\n  fixedRate number (0..1)\n  floatingRate number (0..1)\n\n  condition OneOf:\n    required choice fixedRate, floatingRate\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });

  it('three choice members render as "required choice a, b, c"', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="Rate">
    <xs:sequence>
      <xs:choice>
        <xs:element name="a" type="xs:decimal"/>
        <xs:element name="b" type="xs:decimal"/>
        <xs:element name="c" type="xs:decimal"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = await importToRune(xml);
    expect(model.types[0]!.constraints).toEqual([{ kind: 'oneOf', paths: ['a', 'b', 'c'] }]);
    expect(text).toContain('required choice a, b, c');
    await assertParses(text);
  });
});

describe('xsd-reader constraints — facet path uses the SANITIZED attribute name, not the raw XML element name', () => {
  it('a hyphenated element name (e.g. "trade-id") produces a condition referencing the sanitized attribute ("trade_id"), and the rendered text parses with zero errors', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="TradeIdType">
    <xs:restriction base="xs:string"><xs:maxLength value="10"/></xs:restriction>
  </xs:simpleType>
  <xs:complexType name="Trade">
    <xs:sequence><xs:element name="trade-id" type="TradeIdType"/></xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = await importToRune(xml);
    const attr = model.types[0]!.attributes[0]!;
    // The Rune attribute itself is sanitized...
    expect(attr.name).toBe('trade_id');
    // ...and the constraint's `path` MUST match that sanitized name, not the
    // original unsanitized XML element name ('trade-id') — a real PR-review
    // finding: passing el.name (the raw XML name) here produced a condition
    // like `trade-id count <= 10`, which is not a valid Rune identifier and
    // fails the real parser with a hard syntax error.
    expect(attr.constraints).toEqual([{ kind: 'length', path: 'trade_id', max: 10 }]);
    expect(text).toContain('trade_id count <= 10');
    // The original unsanitized name legitimately appears ONLY inside the
    // quoted synonym annotation (`[synonym Xsd value "trade-id"]`) — never
    // as a bare (unquoted) identifier anywhere else in the rendered text,
    // which is what the condition body would have contained pre-fix.
    expect(text).toContain('[synonym Xsd value "trade-id"]');
    const conditionBlock = text.slice(text.indexOf('condition '));
    expect(conditionBlock).not.toContain('trade-id');
    await assertParses(text);
  });
});

describe('xsd-reader constraints — skipConditions suppresses every restriction-derived constraint', () => {
  it('no conditions are emitted, though the attribute retypes/cardinalities are unaffected', async () => {
    const xml = scalarRestrictionXml('<xs:minInclusive value="0"/><xs:maxInclusive value="100"/>');
    const { text, model } = await importToRune(xml, { skipConditions: true });
    expect(model.types[0]!.attributes[0]!.constraints).toEqual([]);
    expect(model.types[0]!.attributes[0]!.typeName).toBe('number');
    expect(text).not.toContain('condition ');
    await assertParses(text);
  });
});
