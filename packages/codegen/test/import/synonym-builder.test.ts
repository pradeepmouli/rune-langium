// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import {
  buildClassSynonym,
  buildAttributeSynonym,
  buildEnumValueSynonym,
  buildSynonymSourceDeclaration
} from '../../src/import/synonym-builder.js';

/** Splices a `synonym source <Name>` line right after `version "..."`, mirroring renderModel's own hand-assembled namespace/version lines (no renderNode case exists for RosettaSynonymSource — see synonym-builder.ts's module doc). */
function withSynonymSource(rendered: string, decl: string): string {
  const lines = rendered.split('\n');
  const versionIdx = lines.findIndex((l) => l.startsWith('version '));
  lines.splice(versionIdx + 1, 0, '', decl);
  return lines.join('\n');
}

describe('synonym-builder — node shapes render + reparse', () => {
  it('buildClassSynonym renders on a Data as [synonym Source value "key"]', async () => {
    const data = {
      $type: 'Data',
      name: 'Party',
      synonyms: [buildClassSynonym('JsonSchema', 'party')],
      attributes: [],
      conditions: []
    };
    const rendered = renderModel({ name: 'test.inbound', version: '0.0.0', elements: [data] });
    expect(rendered).toContain('[synonym JsonSchema value "party"]');
    const source = withSynonymSource(rendered, buildSynonymSourceDeclaration('JsonSchema'));
    const result = await parse(source);
    expect(result.hasErrors).toBe(false);
  });

  it('buildAttributeSynonym renders on an Attribute as [synonym Source value "key"]', async () => {
    const attr = {
      $type: 'Attribute',
      name: 'partyId',
      typeCall: { type: { $refText: 'string' } },
      card: { inf: 1, sup: 1 },
      synonyms: [buildAttributeSynonym('JsonSchema', 'partyId')]
    };
    const data = {
      $type: 'Data',
      name: 'Party',
      synonyms: [],
      attributes: [attr],
      conditions: []
    };
    const rendered = renderModel({ name: 'test.inbound', version: '0.0.0', elements: [data] });
    expect(rendered).toContain('partyId string (1..1)');
    expect(rendered).toContain('[synonym JsonSchema value "partyId"]');
    const source = withSynonymSource(rendered, buildSynonymSourceDeclaration('JsonSchema'));
    const result = await parse(source);
    expect(result.hasErrors).toBe(false);
  });

  it('buildAttributeSynonym also renders on an Enumeration (shares RosettaSynonym, not RosettaClassSynonym)', async () => {
    const enumNode = {
      $type: 'RosettaEnumeration',
      name: 'CurrencyEnum',
      synonyms: [buildAttributeSynonym('JsonSchema', 'currency')],
      enumValues: [{ $type: 'RosettaEnumValue', name: 'USD' }]
    };
    const rendered = renderModel({ name: 'test.inbound', version: '0.0.0', elements: [enumNode] });
    expect(rendered).toContain('[synonym JsonSchema value "currency"]');
    const source = withSynonymSource(rendered, buildSynonymSourceDeclaration('JsonSchema'));
    const result = await parse(source);
    expect(result.hasErrors).toBe(false);
  });

  it('buildEnumValueSynonym renders on a RosettaEnumValue, preserving a non-ValidID-safe source literal', async () => {
    const enumValue = {
      $type: 'RosettaEnumValue',
      name: 'ACT_360',
      display: 'ACT/360',
      enumSynonyms: [buildEnumValueSynonym('JsonSchema', 'ACT/360')]
    };
    const enumNode = {
      $type: 'RosettaEnumeration',
      name: 'DayCountFractionEnum',
      synonyms: [],
      enumValues: [enumValue]
    };
    const rendered = renderModel({ name: 'test.inbound', version: '0.0.0', elements: [enumNode] });
    expect(rendered).toContain('ACT_360 displayName "ACT/360"');
    expect(rendered).toContain('[synonym JsonSchema value "ACT/360"]');
    const source = withSynonymSource(rendered, buildSynonymSourceDeclaration('JsonSchema'));
    const result = await parse(source);
    expect(result.hasErrors).toBe(false);
  });

  it('buildSynonymSourceDeclaration produces the literal declaration text', () => {
    expect(buildSynonymSourceDeclaration('JsonSchema')).toBe('synonym source JsonSchema');
  });

  it('omitting the synonym source declaration still parses with zero lexer/parser errors (documented gap — see inbound-report.md)', async () => {
    const data = {
      $type: 'Data',
      name: 'Party',
      synonyms: [buildClassSynonym('JsonSchema', 'party')],
      attributes: [],
      conditions: []
    };
    const rendered = renderModel({ name: 'test.inbound', version: '0.0.0', elements: [data] });
    const result = await parse(rendered);
    expect(result.hasErrors).toBe(false);
  });
});
