/**
 * Round-trip conformance tests — edit → serialize → re-parse (T003).
 *
 * Verifies that graph edits produce valid .rosetta output that
 * can be re-parsed by @rune-langium/core.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToModel } from '../../src/adapters/ast-to-model.js';
import { modelsToAst } from '../../src/adapters/model-to-ast.js';
import type { ModelOutput } from '../../src/adapters/model-to-ast.js';
import {
  SIMPLE_INHERITANCE_SOURCE,
  COMBINED_MODEL_SOURCE,
  DEEP_INHERITANCE_SOURCE
} from '../helpers/fixture-loader.js';

// ---------------------------------------------------------------------------
// Inline serializer (same approach as RuneTypeGraph for roundtrip)
// ---------------------------------------------------------------------------

// Use Record-based element type since ModelOutput.elements is unknown[]
type AnyElement = Record<string, unknown>;

function serializeElement(el: unknown): string {
  const e = el as AnyElement;
  if (e.$type === 'Data') return serializeData(e);
  if (e.$type === 'Choice') return serializeChoice(e);
  if (e.$type === 'RosettaEnumeration') return serializeEnum(e);
  return '';
}

function serializeData(data: AnyElement): string {
  const lines: string[] = [];
  let header = `type ${data.name as string}`;
  const superType = data.superType as { ref?: { name?: string }; $refText?: string } | undefined;
  const parent = superType?.ref?.name ?? superType?.$refText;
  if (parent) header += ` extends ${parent}`;
  header += ':';
  lines.push(header);
  const attributes = (data.attributes ?? []) as Array<{
    name: string;
    typeCall?: { type?: { $refText?: string } };
    card: { inf: number; sup?: number; unbounded: boolean };
    override?: boolean;
  }>;
  for (const attr of attributes) {
    const typeName = attr.typeCall?.type?.$refText ?? 'string';
    const card = attr.card;
    const cardStr = card.unbounded ? `(${card.inf}..*)` : `(${card.inf}..${card.sup ?? card.inf})`;
    const prefix = attr.override ? 'override ' : '';
    lines.push(`  ${prefix}${attr.name} ${typeName} ${cardStr}`);
  }
  return lines.join('\n');
}

function serializeChoice(choice: AnyElement): string {
  const lines: string[] = [];
  lines.push(`choice ${choice.name as string}:`);
  const attributes = (choice.attributes ?? []) as Array<{
    typeCall?: { type?: { $refText?: string } };
  }>;
  for (const opt of attributes) {
    const name = opt.typeCall?.type?.$refText ?? '???';
    lines.push(`  ${name}`);
  }
  return lines.join('\n');
}

function serializeEnum(enumType: AnyElement): string {
  const lines: string[] = [];
  lines.push(`enum ${enumType.name as string}:`);
  const enumValues = (enumType.enumValues ?? []) as Array<{ name: string }>;
  for (const val of enumValues) {
    lines.push(`  ${val.name}`);
  }
  return lines.join('\n');
}

function serializeModels(models: ModelOutput[]): string {
  const parts: string[] = [];
  for (const model of models) {
    const header = `namespace ${model.name}`;
    const elements = model.elements.map(serializeElement).filter(Boolean);
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
    const { nodes, edges } = astToModel([original.value]);

    // Step 3: Convert graph back to models
    const syntheticModels = modelsToAst(nodes, edges);

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
