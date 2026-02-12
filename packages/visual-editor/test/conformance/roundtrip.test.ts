/**
 * Round-trip conformance tests — edit → serialize → re-parse (T003).
 *
 * Verifies that graph edits produce valid .rosetta output that
 * can be re-parsed by @rune-langium/core.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToGraph } from '../../src/adapters/ast-to-graph.js';
import { graphToModels } from '../../src/adapters/graph-to-ast.js';
import type {
  SyntheticElement,
  SyntheticData,
  SyntheticChoice,
  SyntheticEnum
} from '../../src/adapters/graph-to-ast.js';
import {
  SIMPLE_INHERITANCE_SOURCE,
  COMBINED_MODEL_SOURCE,
  DEEP_INHERITANCE_SOURCE
} from '../helpers/fixture-loader.js';

// ---------------------------------------------------------------------------
// Inline serializer (same approach as RuneTypeGraph for roundtrip)
// ---------------------------------------------------------------------------

function serializeSyntheticElement(el: SyntheticElement): string {
  if (el.$type === 'Data') return serializeData(el as SyntheticData);
  if (el.$type === 'Choice') return serializeChoice(el as SyntheticChoice);
  if (el.$type === 'RosettaEnumeration') return serializeEnum(el as SyntheticEnum);
  return '';
}

function serializeData(data: SyntheticData): string {
  const lines: string[] = [];
  let header = `type ${data.name}`;
  const parent = data.superType?.ref?.name ?? data.superType?.$refText;
  if (parent) header += ` extends ${parent}`;
  header += ':';
  lines.push(header);
  for (const attr of data.attributes) {
    const typeName = attr.typeCall?.type?.$refText ?? 'string';
    const card = attr.card;
    const cardStr = card.unbounded ? `(${card.inf}..*)` : `(${card.inf}..${card.sup ?? card.inf})`;
    const prefix = attr.override ? 'override ' : '';
    lines.push(`  ${prefix}${attr.name} ${typeName} ${cardStr}`);
  }
  return lines.join('\n');
}

function serializeChoice(choice: SyntheticChoice): string {
  const lines: string[] = [];
  lines.push(`choice ${choice.name}:`);
  for (const opt of choice.attributes ?? []) {
    const name = opt.typeCall?.type?.$refText ?? '???';
    lines.push(`  ${name}`);
  }
  return lines.join('\n');
}

function serializeEnum(enumType: SyntheticEnum): string {
  const lines: string[] = [];
  lines.push(`enum ${enumType.name}:`);
  for (const val of enumType.enumValues ?? []) {
    lines.push(`  ${val.name}`);
  }
  return lines.join('\n');
}

function serializeModels(models: ReturnType<typeof graphToModels>): string {
  const parts: string[] = [];
  for (const model of models) {
    const header = `namespace ${model.name}`;
    const elements = model.elements.map(serializeSyntheticElement).filter(Boolean);
    parts.push([header, '', ...elements].join('\n'));
  }
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Round-trip Conformance (T003)', () => {
  async function roundtrip(source: string) {
    // Step 1: Parse original (may have minor validation issues)
    const original = await parse(source);

    // Step 2: Convert to graph
    const { nodes, edges } = astToGraph([original.value]);

    // Step 3: Convert graph back to models
    const syntheticModels = graphToModels(nodes, edges);

    // Step 4: Serialize to .rosetta text
    const serialized = serializeModels(syntheticModels);

    // Step 5: Re-parse
    const reparsed = await parse(serialized);

    return { original, nodes, edges, syntheticModels, serialized, reparsed };
  }

  it('should round-trip simple inheritance model', async () => {
    const { serialized, reparsed } = await roundtrip(SIMPLE_INHERITANCE_SOURCE);
    expect(serialized.length).toBeGreaterThan(0);
    // Re-parse should succeed (may have validation warnings, but no parse errors)
    expect(reparsed.parserErrors).toHaveLength(0);
  });

  it('should round-trip combined model with Data+Choice+Enum', async () => {
    const { serialized, reparsed } = await roundtrip(COMBINED_MODEL_SOURCE);
    expect(serialized).toContain('type Trade');
    expect(serialized).toContain('choice PaymentType');
    expect(serialized).toContain('enum CurrencyEnum');
    expect(reparsed.parserErrors).toHaveLength(0);
  });

  it('should round-trip deep inheritance chain', async () => {
    const { serialized, reparsed } = await roundtrip(DEEP_INHERITANCE_SOURCE);
    expect(serialized).toContain('type Base');
    expect(serialized).toContain('extends Base');
    expect(serialized).toContain('extends Middle');
    expect(reparsed.parserErrors).toHaveLength(0);
  });

  it('should preserve type count across roundtrip', async () => {
    const { nodes, syntheticModels } = await roundtrip(SIMPLE_INHERITANCE_SOURCE);
    const totalElements = syntheticModels.reduce((sum, m) => sum + m.elements.length, 0);
    expect(totalElements).toBe(nodes.length);
  });

  it('should preserve namespace across roundtrip', async () => {
    const { syntheticModels } = await roundtrip(SIMPLE_INHERITANCE_SOURCE);
    expect(syntheticModels.length).toBeGreaterThan(0);
    for (const model of syntheticModels) {
      expect(model.name).toBeTruthy();
    }
  });
});
