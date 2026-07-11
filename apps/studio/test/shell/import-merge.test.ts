// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { mergeImportedText } from '../../src/shell/import-merge.js';
import { importModel } from '@rune-langium/codegen/import';

const EXISTING = `namespace example
version "0.0.0"

type Party:
  name string (1..1)
`;

const IMPORTED_NO_COLLISION = `namespace example
version "0.0.0"

type Trade:
  quantity number (1..1)
`;

const IMPORTED_ALL_COLLIDE = `namespace example
version "0.0.0"

type Party:
  id string (1..1)
`;

describe('mergeImportedText', () => {
  it('appends every imported element when there are no collisions', async () => {
    const result = await mergeImportedText(EXISTING, IMPORTED_NO_COLLISION);
    expect(result.skipped).toEqual([]);
    expect(result.mergedText).toContain('type Party');
    expect(result.mergedText).toContain('type Trade');
  });

  it('skips a colliding element and keeps the existing one', async () => {
    const result = await mergeImportedText(EXISTING, IMPORTED_ALL_COLLIDE);
    expect(result.skipped).toEqual(['Party']);
    expect(result.mergedText).toContain('name string (1..1)');
    expect(result.mergedText).not.toContain('id string (1..1)');
  });

  it('drops every imported element when all collide, leaving existingText unchanged', async () => {
    const result = await mergeImportedText(EXISTING, IMPORTED_ALL_COLLIDE);
    expect(result.mergedText).toBe(EXISTING);
  });

  it('always produces text that re-parses with zero errors', async () => {
    const { parse } = await import('@rune-langium/core');
    const result = await mergeImportedText(EXISTING, IMPORTED_NO_COLLISION);
    const reparsed = await parse(result.mergedText);
    expect(reparsed.hasErrors).toBe(false);
  });

  it('throws when existingText fails to parse', async () => {
    const INVALID = 'not valid rune syntax at all !!!';
    const { parse } = await import('@rune-langium/core');
    const check = await parse(INVALID, 'inmemory:///check-existing.rosetta');
    expect(check.hasErrors).toBe(true);

    await expect(mergeImportedText(INVALID, IMPORTED_NO_COLLISION)).rejects.toThrow(/existingText failed to parse/);
  });

  it('throws when importedText fails to parse', async () => {
    const INVALID = 'not valid rune syntax at all !!!';
    const { parse } = await import('@rune-langium/core');
    const check = await parse(INVALID, 'inmemory:///check-imported.rosetta');
    expect(check.hasErrors).toBe(true);

    await expect(mergeImportedText(EXISTING, INVALID)).rejects.toThrow(/importedText failed to parse/);
  });
});

describe('mergeImportedText — onCollision', () => {
  const existingText = 'namespace demo\n\ntype Foo:\n\ta string (1..1)\n';
  const importedText = 'namespace demo\n\ntype Foo:\n\tb string (1..1)\n\ntype Bar:\n\tc string (1..1)\n';

  it('overwrite replaces the existing Foo with the incoming Foo, keeps Bar', async () => {
    const result = await mergeImportedText(existingText, importedText, { onCollision: 'overwrite' });
    expect(result.mergedText).toContain('b string');
    expect(result.mergedText).not.toContain('a string');
    expect(result.mergedText).toContain('type Bar');
    expect(result.overwritten).toEqual(['Foo']);
    expect(result.skipped).toEqual([]);
  });

  it('rename keeps both Foo declarations under distinct names', async () => {
    const result = await mergeImportedText(existingText, importedText, { onCollision: 'rename' });
    expect(result.mergedText).toContain('type Foo:');
    expect(result.mergedText).toContain('type Foo_2:');
    expect(result.mergedText).toContain('type Bar');
    expect(result.renamed).toEqual([{ from: 'Foo', to: 'Foo_2' }]);
    expect(result.skipped).toEqual([]);
  });

  it('skip (default, no options arg) is unchanged from before this task', async () => {
    const result = await mergeImportedText(existingText, importedText);
    expect(result.mergedText).toContain('a string');
    expect(result.mergedText).not.toContain('b string');
    expect(result.skipped).toEqual(['Foo']);
  });

  it('rename does not crash on a colliding shared meta-declaration (synonym source), and still renames the real type collision', async () => {
    // Every importModel() output carries a `synonym source <Name>` declaration
    // (buildSynonymSourceDeclaration) — a top-level element with a `name`, but
    // not a type/enum/choice/func, so it can never be safely renamed (other
    // declarations' own synonym refs still point at the original name). Two
    // json-schema imports into the same namespace collide on BOTH the shared
    // synonym source AND a same-named type — the synonym-source collision must
    // fall back to skip, not throw, while the type collision still renames.
    const widgetSchema = (x: string) =>
      JSON.stringify({ $defs: { Widget: { type: 'object', properties: { [x]: { type: 'string' } } } } });
    const { text: existingText } = await importModel(widgetSchema('a'), { from: 'json-schema', namespace: 'demo' });
    const { text: importedText } = await importModel(widgetSchema('b'), { from: 'json-schema', namespace: 'demo' });

    const result = await mergeImportedText(existingText, importedText, { onCollision: 'rename' });

    expect(result.skipped).toEqual(['JsonSchema']);
    expect(result.renamed).toEqual([{ from: 'Widget', to: 'Widget_2' }]);
    expect(result.mergedText).toContain('type Widget:');
    expect(result.mergedText).toContain('type Widget_2:');
    expect((result.mergedText.match(/synonym source JsonSchema/g) ?? []).length).toBe(1);

    const { parse } = await import('@rune-langium/core');
    const reparsed = await parse(result.mergedText, 'inmemory:///rename-synonym-source-check.rosetta');
    expect(reparsed.hasErrors).toBe(false);
  });
});
