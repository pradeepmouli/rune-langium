// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { buildModel, buildDataType, buildEnumeration } from '../../src/import/ast-builder.js';
import type { SourceModel, SourceType, SourceEnum } from '../../src/import/source-model.js';

/** Assembles a full `.rune` document from a `buildModel()` result, splicing the synonym-source declaration exactly where `renderModel` places its own hand-assembled namespace/version lines. */
function assemble(namespace: string, built: ReturnType<typeof buildModel>): string {
  const rendered = renderModel({ name: namespace, version: '0.0.0', elements: built.elements as never[] });
  if (!built.synonymSourceDeclaration) return rendered;
  const lines = rendered.split('\n');
  const versionIdx = lines.findIndex((l) => l.startsWith('version '));
  lines.splice(versionIdx + 1, 0, '', built.synonymSourceDeclaration);
  return lines.join('\n');
}

const PARTY_TYPE: SourceType = {
  name: 'Party',
  sourceKey: 'party',
  attributes: [
    {
      name: 'partyId',
      typeName: 'string',
      cardinality: { inf: 1, sup: 1 },
      sourceKey: 'partyId',
      constraints: []
    },
    {
      name: 'partyName',
      typeName: 'string',
      cardinality: { inf: 0, sup: 1 },
      sourceKey: 'partyName',
      constraints: []
    },
    {
      name: 'tags',
      typeName: 'string',
      cardinality: { inf: 0 },
      sourceKey: 'tags',
      constraints: []
    }
  ],
  constraints: []
};

describe('ast-builder — buildDataType', () => {
  it('renders + reparses a type with cardinality variants and synonyms', async () => {
    const built = buildModel({ namespace: 'test.inbound', sourceName: 'JsonSchema', types: [PARTY_TYPE], enums: [] });
    const text = assemble('test.inbound', built);
    expect(text).toContain('type Party:');
    expect(text).toContain('[synonym JsonSchema value "party"]');
    expect(text).toContain('partyId string (1..1)');
    expect(text).toContain('partyName string (0..1)');
    expect(text).toContain('tags string (0..*)');
    expect(text).toContain('[synonym JsonSchema value "partyId"]');
    const result = await parse(text);
    expect(result.hasErrors).toBe(false);
  });

  it('--no-synonyms suppresses every synonym annotation and the source declaration', async () => {
    const built = buildModel(
      { namespace: 'test.inbound', sourceName: 'JsonSchema', types: [PARTY_TYPE], enums: [] },
      { emitSynonyms: false }
    );
    expect(built.synonymSourceDeclaration).toBeUndefined();
    const text = assemble('test.inbound', built);
    expect(text).not.toContain('synonym');
    const result = await parse(text);
    expect(result.hasErrors).toBe(false);
  });

  it('extends composes a superType reference', async () => {
    const child: SourceType = {
      name: 'Employee',
      sourceKey: 'employee',
      extends: 'Party',
      attributes: [
        { name: 'title', typeName: 'string', cardinality: { inf: 0, sup: 1 }, sourceKey: 'title', constraints: [] }
      ],
      constraints: []
    };
    const built = buildModel({
      namespace: 'test.inbound',
      sourceName: 'JsonSchema',
      types: [PARTY_TYPE, child],
      enums: []
    });
    const text = assemble('test.inbound', built);
    expect(text).toContain('type Employee extends Party:');
    const result = await parse(text);
    expect(result.hasErrors).toBe(false);
  });

  it('type-level and attribute-level constraints both attach as Data-scoped Conditions', async () => {
    const withConstraints: SourceType = {
      name: 'NumericCheck',
      sourceKey: 'numericCheck',
      attributes: [
        {
          name: 'value',
          typeName: 'int',
          cardinality: { inf: 1, sup: 1 },
          sourceKey: 'value',
          constraints: [{ kind: 'range', path: 'value', min: 0 }]
        }
      ],
      constraints: [{ kind: 'oneOf', paths: ['value'] }]
    };
    const built = buildDataType(withConstraints, 'JsonSchema', true, []);
    const text = renderModel({ name: 'test.inbound', version: '0.0.0', elements: [built as never] });
    expect(text).toContain('condition OneOf:\n    required choice value');
    expect(text).toContain('condition ValueRange:\n    value >= 0');
    const result = await parse(text);
    expect(result.hasErrors).toBe(false);
  });

  it('condition names dedupe across type-level and attribute-level constraints sharing one type', async () => {
    const dupe: SourceType = {
      name: 'Dupe',
      sourceKey: 'dupe',
      attributes: [
        {
          name: 'value',
          typeName: 'int',
          cardinality: { inf: 1, sup: 1 },
          sourceKey: 'value',
          constraints: [{ kind: 'range', path: 'value', min: 0 }]
        }
      ],
      constraints: [{ kind: 'range', path: 'value', max: 100 }]
    };
    const built = buildDataType(dupe, 'JsonSchema', false, []);
    expect(built.conditions.map((c) => c.name)).toEqual(['ValueRange', 'ValueRange2']);
  });
});

describe('ast-builder — buildEnumeration', () => {
  const DAY_COUNT_ENUM: SourceEnum = {
    name: 'DayCountFractionEnum',
    sourceKey: 'dayCountFraction',
    values: [
      { name: 'ACT_360', sourceKey: 'ACT/360', displayName: 'ACT/360' },
      { name: 'ACT_365', sourceKey: 'ACT/365' }
    ]
  };

  it('renders + reparses enum values with displayName + enum-value synonym for non-safe originals', async () => {
    const node = buildEnumeration(DAY_COUNT_ENUM, 'JsonSchema', true);
    const rendered = renderModel({ name: 'test.inbound', version: '0.0.0', elements: [node as never] });
    expect(rendered).toContain('enum DayCountFractionEnum:');
    expect(rendered).toContain('[synonym JsonSchema value "dayCountFraction"]');
    expect(rendered).toContain('ACT_360 displayName "ACT/360"');
    expect(rendered).toContain('[synonym JsonSchema value "ACT/360"]');
    expect(rendered).toContain('ACT_365');
    const lines = rendered.split('\n');
    const versionIdx = lines.findIndex((l) => l.startsWith('version '));
    lines.splice(versionIdx + 1, 0, '', 'synonym source JsonSchema');
    const result = await parse(lines.join('\n'));
    expect(result.hasErrors).toBe(false);
  });

  it('REGRESSION: the enum-value synonym records sourceKey (the original source literal), NOT displayName (a presentational label)', async () => {
    // Reviewer finding: a prior version emitted the synonym from
    // v.displayName, which is the human-readable label (e.g. from the
    // outbound emitter's own x-rune-enum-display map) — NOT necessarily the
    // original source literal. Fixture where the safe name, the source
    // literal, and the display label all differ from each other, so the
    // three cannot be confused for one another.
    const enumWithDivergentFields: SourceEnum = {
      name: 'StatusEnum',
      sourceKey: 'status',
      values: [{ name: 'Active_Status', sourceKey: 'ACTIVE', displayName: 'Currently Active' }]
    };
    const node = buildEnumeration(enumWithDivergentFields, 'JsonSchema', true);
    const rendered = renderModel({ name: 'test.inbound', version: '0.0.0', elements: [node as never] });
    expect(rendered).toContain('Active_Status displayName "Currently Active"');
    expect(rendered).toContain('[synonym JsonSchema value "ACTIVE"]');
    expect(rendered).not.toContain('[synonym JsonSchema value "Currently Active"]');
    const lines = rendered.split('\n');
    const versionIdx = lines.findIndex((l) => l.startsWith('version '));
    lines.splice(versionIdx + 1, 0, '', 'synonym source JsonSchema');
    const result = await parse(lines.join('\n'));
    expect(result.hasErrors).toBe(false);
  });
});

describe('ast-builder — buildModel end to end', () => {
  it('produces a full document (enums before types) that parses and resolves the enum type reference', async () => {
    const currencyEnum: SourceEnum = {
      name: 'CurrencyEnum',
      sourceKey: 'currency',
      values: [
        { name: 'USD', sourceKey: 'USD' },
        { name: 'EUR', sourceKey: 'EUR' }
      ]
    };
    const trade: SourceType = {
      name: 'Trade',
      sourceKey: 'trade',
      attributes: [
        {
          name: 'currency',
          typeName: 'CurrencyEnum',
          cardinality: { inf: 1, sup: 1 },
          sourceKey: 'currency',
          constraints: []
        }
      ],
      constraints: []
    };
    const model: SourceModel = {
      namespace: 'test.inbound',
      sourceName: 'JsonSchema',
      types: [trade],
      enums: [currencyEnum]
    };
    const built = buildModel(model);
    const text = assemble(model.namespace, built);
    const result = await parse(text);
    expect(result.hasErrors).toBe(false);
    // Cross-reference resolution: the `currency` attribute's typeCall must resolve to the CurrencyEnum declared in the same document.
    const tradeData = result.value.elements.find((e) => (e as { name?: string }).name === 'Trade') as
      | { attributes?: Array<{ typeCall?: { type?: { ref?: unknown } } }> }
      | undefined;
    expect(tradeData?.attributes?.[0]?.typeCall?.type?.ref).toBeDefined();
  });
});
