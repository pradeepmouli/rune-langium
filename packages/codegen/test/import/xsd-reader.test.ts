// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { readXsd, type XsdImportOptions } from '../../src/import/sources/xsd-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';

/** Full pipeline: XSD document text → SourceModel → Rune AST nodes → .rune text, with the synonym-source declaration spliced in exactly where renderModel places namespace/version — mirrors json-schema-reader.test.ts's `importToRune` helper exactly. */
function importToRune(
  xml: string,
  options?: XsdImportOptions
): {
  text: string;
  model: ReturnType<typeof readXsd>['model'];
  diagnostics: ReturnType<typeof readXsd>['diagnostics'];
} {
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

/** The inbound hard invariant: every reader's rendered .rune text MUST parse with zero errors via the real @rune-langium/core parse(). */
async function assertParses(text: string): Promise<void> {
  const result = await parse(text);
  if (result.hasErrors) {
    throw new Error(
      `expected zero parse errors for:\n${text}\ngot: ${JSON.stringify([...result.lexerErrors, ...result.parserErrors])}`
    );
  }
  expect(result.hasErrors).toBe(false);
}

describe('xsd-reader — top-level complexType → SourceType', () => {
  it('xs:sequence children become attributes; xs:attribute children also become attributes', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="Party">
    <xs:sequence>
      <xs:element name="partyId" type="xs:string" minOccurs="1" maxOccurs="1"/>
      <xs:element name="partyName" type="xs:string" minOccurs="0"/>
    </xs:sequence>
    <xs:attribute name="version" type="xs:string"/>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml);
    expect(model.types).toHaveLength(1);
    const party = model.types[0]!;
    expect(party.name).toBe('Party');
    expect(party.attributes.map((a) => a.name)).toEqual(['partyId', 'partyName', 'version']);
    expect(party.attributes[0]!.cardinality).toEqual({ inf: 1, sup: 1 });
    expect(party.attributes[1]!.cardinality).toEqual({ inf: 0, sup: 1 });
    expect(text).toContain('type Party:');
    expect(text).toContain('partyId string (1..1)');
    expect(text).toContain('partyName string (0..1)');
    expect(text).toContain('version string (0..1)');
    expect(text).toContain('[synonym Xsd value "partyId"]');
    await assertParses(text);
  });

  it('xs:all children become attributes the same way xs:sequence does', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="Pair">
    <xs:all>
      <xs:element name="left" type="xs:string"/>
      <xs:element name="right" type="xs:string"/>
    </xs:all>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml);
    const pair = model.types[0]!;
    expect(pair.attributes.map((a) => a.name)).toEqual(['left', 'right']);
    await assertParses(text);
  });
});

describe('xsd-reader — builtin type mapping', () => {
  it.each([
    ['xs:string', 'string'],
    ['xs:decimal', 'number'],
    ['xs:double', 'number'],
    ['xs:float', 'number'],
    ['xs:int', 'int'],
    ['xs:integer', 'int'],
    ['xs:long', 'int'],
    ['xs:short', 'int'],
    ['xs:boolean', 'boolean'],
    ['xs:date', 'date'],
    ['xs:dateTime', 'dateTime']
  ])('%s -> %s', async (xsdType, runeType) => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="Holder">
    <xs:sequence>
      <xs:element name="value" type="${xsdType}" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml);
    expect(model.types[0]!.attributes[0]!.typeName).toBe(runeType);
    expect(text).toContain(`value ${runeType} (0..1)`);
    await assertParses(text);
  });
});

describe('xsd-reader — a @_type referencing another named complexType', () => {
  it('resolves to a typed attribute referencing that Rune type by name', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="Address">
    <xs:sequence>
      <xs:element name="city" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Party">
    <xs:sequence>
      <xs:element name="address" type="Address" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml);
    const party = model.types.find((t) => t.name === 'Party')!;
    expect(party.attributes[0]!.typeName).toBe('Address');
    expect(text).toContain('address Address (0..1)');
    await assertParses(text);
  });
});

describe('xsd-reader — simpleType enum detection', () => {
  it('a restriction with ONLY xs:enumeration children -> SourceEnum', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="DayCountFractionEnum">
    <xs:restriction base="xs:string">
      <xs:enumeration value="ACT_360"/>
      <xs:enumeration value="ACT_365"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="Trade">
    <xs:sequence>
      <xs:element name="dayCountFraction" type="DayCountFractionEnum" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml);
    expect(model.enums).toHaveLength(1);
    const dcf = model.enums[0]!;
    expect(dcf.name).toBe('DayCountFractionEnum');
    expect(dcf.values.map((v) => v.name)).toEqual(['ACT_360', 'ACT_365']);
    const trade = model.types[0]!;
    expect(trade.attributes[0]!.typeName).toBe('DayCountFractionEnum');
    expect(text).toContain('enum DayCountFractionEnum:');
    expect(text).toContain('dayCountFraction DayCountFractionEnum (0..1)');
    await assertParses(text);
  });

  it('sanitizes a non-ValidID-safe enum literal (e.g. "ACT/360")', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="DayCountFractionEnum">
    <xs:restriction base="xs:string">
      <xs:enumeration value="ACT/360"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="Trade">
    <xs:sequence>
      <xs:element name="dayCountFraction" type="DayCountFractionEnum"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml);
    const value = model.enums[0]!.values[0]!;
    expect(value.name).toBe('ACT_360');
    expect(value.sourceKey).toBe('ACT/360');
    expect(value.displayName).toBe('ACT/360');
    await assertParses(text);
  });

  it('a simpleType restriction with OTHER facets alongside enumeration is NOT an enum', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="Weird">
    <xs:restriction base="xs:string">
      <xs:enumeration value="A"/>
      <xs:maxLength value="5"/>
    </xs:restriction>
  </xs:simpleType>
</xs:schema>`;
    const { model } = importToRune(xml);
    expect(model.enums).toHaveLength(0);
  });

  it('a scalar-restricted simpleType (no enumeration) resolves the REFERENCING attribute to its base builtin + attaches facets there, not to the simpleType itself', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="PercentageType">
    <xs:restriction base="xs:decimal">
      <xs:minInclusive value="0"/>
      <xs:maxInclusive value="100"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="Trade">
    <xs:sequence>
      <xs:element name="rate" type="PercentageType" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml);
    expect(model.enums).toHaveLength(0);
    const trade = model.types[0]!;
    const rateAttr = trade.attributes[0]!;
    expect(rateAttr.typeName).toBe('number');
    expect(rateAttr.constraints).toEqual(
      expect.arrayContaining([
        { kind: 'range', path: 'rate', min: 0 },
        { kind: 'range', path: 'rate', max: 100 }
      ])
    );
    expect(text).toContain('rate number (0..1)');
    expect(text).toContain('condition RateRange:');
    await assertParses(text);
  });
});

describe('xsd-reader — minOccurs/maxOccurs cardinality', () => {
  it('absent -> (1..1); explicit "0" -> (0..1); "unbounded" -> (0..*); numeric >1 -> (n..*)', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="T">
    <xs:sequence>
      <xs:element name="a" type="xs:string"/>
      <xs:element name="b" type="xs:string" minOccurs="0"/>
      <xs:element name="c" type="xs:string" minOccurs="0" maxOccurs="unbounded"/>
      <xs:element name="d" type="xs:string" minOccurs="2" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml);
    const [a, b, c, d] = model.types[0]!.attributes;
    expect(a!.cardinality).toEqual({ inf: 1, sup: 1 });
    expect(b!.cardinality).toEqual({ inf: 0, sup: 1 });
    expect(c!.cardinality).toEqual({ inf: 0 });
    expect(d!.cardinality).toEqual({ inf: 2 });
    expect(text).toContain('a string (1..1)');
    expect(text).toContain('b string (0..1)');
    expect(text).toContain('c string (0..*)');
    expect(text).toContain('d string (2..*)');
    await assertParses(text);
  });
});

describe('xsd-reader — xs:choice', () => {
  it('every choice member becomes a (0..1) attribute plus a type-level oneOf constraint', async () => {
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
    const { text, model } = importToRune(xml);
    const rate = model.types[0]!;
    expect(rate.attributes.map((a) => a.name)).toEqual(['fixedRate', 'floatingRate']);
    expect(rate.attributes.every((a) => a.cardinality.inf === 0 && a.cardinality.sup === 1)).toBe(true);
    expect(rate.constraints).toEqual(expect.arrayContaining([{ kind: 'oneOf', paths: ['fixedRate', 'floatingRate'] }]));
    expect(text).toContain('required choice fixedRate, floatingRate');
    await assertParses(text);
  });

  it('every choice member becomes (0..1) even when its own minOccurs/maxOccurs says otherwise', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="Rate">
    <xs:sequence>
      <xs:choice>
        <xs:element name="fixedRate" type="xs:decimal" minOccurs="1"/>
        <xs:element name="floatingRate" type="xs:decimal" minOccurs="1"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { model } = importToRune(xml);
    const rate = model.types[0]!;
    expect(rate.attributes.every((a) => a.cardinality.inf === 0 && a.cardinality.sup === 1)).toBe(true);
  });
});

describe('xsd-reader — xs:extension via xs:complexContent', () => {
  it("-> SourceType.extends, resolved via the namespace map to the local base type name; the base type's own attributes are NOT re-emitted", async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="Base">
    <xs:sequence>
      <xs:element name="id" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Trade">
    <xs:complexContent>
      <xs:extension base="Base">
        <xs:sequence>
          <xs:element name="notional" type="xs:decimal"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml);
    const trade = model.types.find((t) => t.name === 'Trade')!;
    expect(trade.extends).toBe('Base');
    // Only the extending type's OWN new attribute ('notional') is emitted —
    // the base type's own attribute ('id') is NOT re-declared on Trade
    // (matches inheritance elsewhere in this codebase: the child type only
    // carries its own new attributes).
    expect(trade.attributes.map((a) => a.name)).toEqual(['notional']);
    expect(text).toContain('type Trade extends Base:');
    const tradeBlock = text.slice(text.indexOf('type Trade extends Base:'));
    expect(tradeBlock).not.toContain('id string');
    await assertParses(text);
  });
});

describe('xsd-reader — restriction numeric/string facets', () => {
  it('minInclusive/maxInclusive -> range (inclusive, no exclusive flag)', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="PctType">
    <xs:restriction base="xs:decimal">
      <xs:minInclusive value="0"/>
      <xs:maxInclusive value="100"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="T">
    <xs:sequence>
      <xs:element name="pct" type="PctType"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { model } = importToRune(xml);
    const attr = model.types[0]!.attributes[0]!;
    expect(attr.constraints).toEqual(
      expect.arrayContaining([
        { kind: 'range', path: 'pct', min: 0 },
        { kind: 'range', path: 'pct', max: 100 }
      ])
    );
  });

  it('minExclusive/maxExclusive -> range with exclusive: true, one IR per bound (never coalesced)', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="PctType">
    <xs:restriction base="xs:decimal">
      <xs:minExclusive value="0"/>
      <xs:maxExclusive value="100"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="T">
    <xs:sequence>
      <xs:element name="pct" type="PctType"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { model } = importToRune(xml);
    const attr = model.types[0]!.attributes[0]!;
    expect(attr.constraints).toEqual(
      expect.arrayContaining([
        { kind: 'range', path: 'pct', min: 0, exclusive: true },
        { kind: 'range', path: 'pct', max: 100, exclusive: true }
      ])
    );
  });

  it('mixed exclusivity (minInclusive + maxExclusive) is representable as two independent IRs', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="PctType">
    <xs:restriction base="xs:decimal">
      <xs:minInclusive value="0"/>
      <xs:maxExclusive value="100"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="T">
    <xs:sequence>
      <xs:element name="pct" type="PctType"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml);
    const attr = model.types[0]!.attributes[0]!;
    expect(attr.constraints).toEqual(
      expect.arrayContaining([
        { kind: 'range', path: 'pct', min: 0 },
        { kind: 'range', path: 'pct', max: 100, exclusive: true }
      ])
    );
    await assertParses(text);
  });

  it('xs:pattern -> pattern stub (always a stub + diagnostic, no expression-level regex)', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="CodeType">
    <xs:restriction base="xs:string">
      <xs:pattern value="[A-Z]{3}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="T">
    <xs:sequence>
      <xs:element name="code" type="CodeType"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model, diagnostics } = importToRune(xml);
    const attr = model.types[0]!.attributes[0]!;
    expect(attr.constraints).toEqual([{ kind: 'pattern', path: 'code', regex: '[A-Z]{3}' }]);
    expect(diagnostics.some((d) => (d as { code: string }).code === 'untranslatable-construct')).toBe(true);
    expect(text).toContain('TODO: manual translation required');
    await assertParses(text);
  });

  it('minLength/maxLength/length -> length ConstraintIR', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="ShortCode">
    <xs:restriction base="xs:string">
      <xs:minLength value="2"/>
      <xs:maxLength value="5"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="FixedCode">
    <xs:restriction base="xs:string">
      <xs:length value="4"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="T">
    <xs:sequence>
      <xs:element name="short" type="ShortCode"/>
      <xs:element name="fixed" type="FixedCode"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml);
    const [shortAttr, fixedAttr] = model.types[0]!.attributes;
    expect(shortAttr!.constraints).toEqual([{ kind: 'length', path: 'short', min: 2, max: 5 }]);
    expect(fixedAttr!.constraints).toEqual([{ kind: 'length', path: 'fixed', min: 4, max: 4 }]);
    await assertParses(text);
  });
});

describe('xsd-reader — out-of-MVP-scope constructs (diagnostic, never silently dropped)', () => {
  it('xs:union -> diagnostic, member types ignored', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="Code">
    <xs:union memberTypes="xs:string xs:int"/>
  </xs:simpleType>
</xs:schema>`;
    const { model, diagnostics } = importToRune(xml);
    expect(model.enums).toHaveLength(0);
    expect(model.types).toHaveLength(0);
    expect(diagnostics.some((d) => (d as { code: string }).code === 'unsupported-xsd-union')).toBe(true);
  });

  it('xs:import -> diagnostic, no fetch attempted, single document still reads', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:import namespace="urn:other" schemaLocation="other.xsd"/>
  <xs:complexType name="T">
    <xs:sequence>
      <xs:element name="a" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { model, diagnostics } = importToRune(xml);
    expect(model.types).toHaveLength(1);
    expect(diagnostics.some((d) => (d as { code: string }).code === 'unsupported-xsd-import')).toBe(true);
  });

  it('xs:include -> diagnostic, no fetch attempted', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:include schemaLocation="other.xsd"/>
  <xs:complexType name="T">
    <xs:sequence>
      <xs:element name="a" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { model, diagnostics } = importToRune(xml);
    expect(model.types).toHaveLength(1);
    expect(diagnostics.some((d) => (d as { code: string }).code === 'unsupported-xsd-include')).toBe(true);
  });

  it('substitutionGroup -> diagnostic + best-effort structural handling, does not crash', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:element name="base" type="xs:string" abstract="true"/>
  <xs:element name="derived" type="xs:string" substitutionGroup="base"/>
  <xs:complexType name="T">
    <xs:sequence>
      <xs:element name="a" type="xs:string" substitutionGroup="base"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model, diagnostics } = importToRune(xml);
    expect(model.types).toHaveLength(1);
    expect(diagnostics.some((d) => (d as { code: string }).code === 'unsupported-substitution-group')).toBe(true);
    await assertParses(text);
  });

  it('abstract types/elements -> diagnostic, still emitted structurally (Rune has no abstract-type concept)', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="AbstractBase" abstract="true">
    <xs:sequence>
      <xs:element name="a" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model, diagnostics } = importToRune(xml);
    expect(model.types).toHaveLength(1);
    expect(model.types[0]!.name).toBe('AbstractBase');
    expect(diagnostics.some((d) => (d as { code: string }).code === 'unsupported-abstract-type')).toBe(true);
    expect(text).toContain('type AbstractBase:');
    await assertParses(text);
  });

  it('xs:group / xs:attributeGroup references -> diagnostic + skip, does not crash', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:group name="commonFields">
    <xs:sequence>
      <xs:element name="a" type="xs:string"/>
    </xs:sequence>
  </xs:group>
  <xs:attributeGroup name="commonAttrs">
    <xs:attribute name="b" type="xs:string"/>
  </xs:attributeGroup>
  <xs:complexType name="T">
    <xs:sequence>
      <xs:element name="c" type="xs:string"/>
      <xs:group ref="commonFields"/>
    </xs:sequence>
    <xs:attributeGroup ref="commonAttrs"/>
  </xs:complexType>
</xs:schema>`;
    const { text, model, diagnostics } = importToRune(xml);
    expect(model.types).toHaveLength(1);
    expect(model.types[0]!.attributes.map((a) => a.name)).toEqual(['c']);
    expect(diagnostics.some((d) => (d as { code: string }).code === 'unsupported-xsd-group-decl')).toBe(true);
    expect(diagnostics.some((d) => (d as { code: string }).code === 'unsupported-xsd-attribute-group-decl')).toBe(true);
    expect(diagnostics.some((d) => (d as { code: string }).code === 'unsupported-xsd-group-ref')).toBe(true);
    expect(diagnostics.some((d) => (d as { code: string }).code === 'unsupported-xsd-attribute-group-ref')).toBe(true);
    await assertParses(text);
  });

  it('mixed content -> diagnostic, text content not imported', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="T" mixed="true">
    <xs:sequence>
      <xs:element name="a" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, diagnostics } = importToRune(xml);
    expect(diagnostics.some((d) => (d as { code: string }).code === 'unsupported-mixed-content')).toBe(true);
    await assertParses(text);
  });
});

describe('xsd-reader — namespace-prefix resolution (design decision 2)', () => {
  it('a document using "xsd:" as its prefix parses IDENTICALLY to one using "xs:"', async () => {
    const xsXml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="StatusEnum">
    <xs:restriction base="xs:string">
      <xs:enumeration value="ACTIVE"/>
      <xs:enumeration value="INACTIVE"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="Base">
    <xs:sequence>
      <xs:element name="id" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Party">
    <xs:complexContent>
      <xs:extension base="Base">
        <xs:sequence>
          <xs:element name="status" type="StatusEnum" minOccurs="0"/>
          <xs:choice>
            <xs:element name="fixedRate" type="xs:decimal"/>
            <xs:element name="floatingRate" type="xs:decimal"/>
          </xs:choice>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>
</xs:schema>`;
    // Swap BOTH the prefix declaration (`xmlns:xs=`) and every use (`xs:foo`)
    // — a naive `/xs:/g` replace misses `xmlns:xs=` (the colon there
    // separates `xmlns` from the prefix `xs`, not the prefix from a local
    // name, so the substring `xs:` never actually occurs in `xmlns:xs=`).
    const xsdXml = xsXml.replace(/xmlns:xs=/g, 'xmlns:xsd=').replace(/\bxs:/g, 'xsd:');

    const { text: xsText, model: xsModel } = importToRune(xsXml);
    const { text: xsdText, model: xsdModel } = importToRune(xsdXml);

    expect(xsdModel.types).toEqual(xsModel.types);
    expect(xsdModel.enums).toEqual(xsModel.enums);
    expect(xsText).toBe(xsdText);
    await assertParses(xsText);
    await assertParses(xsdText);
  });

  it('a default-namespace document (no prefix at all) also resolves correctly', async () => {
    const xml = `<?xml version="1.0"?>
<schema xmlns="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <complexType name="T">
    <sequence>
      <element name="a" type="string"/>
    </sequence>
  </complexType>
</schema>`;
    const { text, model } = importToRune(xml);
    expect(model.types).toHaveLength(1);
    expect(model.types[0]!.attributes[0]!.typeName).toBe('string');
    await assertParses(text);
  });
});

describe('xsd-reader — namespace derivation', () => {
  it('--namespace override always wins', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:complexType name="T">
    <xs:sequence><xs:element name="a" type="xs:string"/></xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { model, text } = importToRune(xml, { namespace: 'my.override' });
    expect(model.namespace).toBe('my.override');
    expect(text).toContain('namespace my.override');
  });

  it('falls back to a sanitized targetNamespace when --namespace is omitted', () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="https://example.com/schemas/trade">
  <xs:complexType name="T">
    <xs:sequence><xs:element name="a" type="xs:string"/></xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { model } = readXsd(xml);
    expect(model.namespace).toBe('com.example.schemas.trade');
  });

  it('throws a clear error when neither --namespace nor a usable targetNamespace is present', () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="T">
    <xs:sequence><xs:element name="a" type="xs:string"/></xs:sequence>
  </xs:complexType>
</xs:schema>`;
    expect(() => readXsd(xml)).toThrow(/unable to derive a Rune namespace/i);
  });
});

describe('xsd-reader — skipConditions (structural-only import)', () => {
  it('never populates constraints arrays when skipConditions is set', async () => {
    const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
  <xs:simpleType name="PctType">
    <xs:restriction base="xs:decimal">
      <xs:minInclusive value="0"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="Rate">
    <xs:sequence>
      <xs:element name="pct" type="PctType"/>
      <xs:choice>
        <xs:element name="fixedRate" type="xs:decimal"/>
        <xs:element name="floatingRate" type="xs:decimal"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`;
    const { text, model } = importToRune(xml, { skipConditions: true });
    expect(model.types[0]!.attributes[0]!.constraints).toEqual([]);
    expect(model.types[0]!.constraints).toEqual([]);
    expect(text).not.toContain('condition ');
    await assertParses(text);
  });
});
