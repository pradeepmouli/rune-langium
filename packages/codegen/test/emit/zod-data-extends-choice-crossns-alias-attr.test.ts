// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * PR #469 final-review finding (2026-08-04): `collectCrossNamespaceImports`'s
 * inlined-ancestor-attribute scan (the loop folding a Data-extends-Choice
 * intermediate's own attributes into the CHILD's file — see
 * zod-data-extends-choice-crossns.test.ts for the base case) read
 * `attr.typeCall?.type?.ref` directly and only tracked it when it was a
 * Data or Enum. A `RosettaTypeAlias` node is neither, so an inlined
 * ancestor attribute typed VIA an alias to a foreign Data was silently
 * untracked — the value-emission side (`resolveTypeExpr`, routed through
 * `resolveTypeCallTarget`) already correctly chases the alias to its
 * terminal target and emits `CashSchema`, but no `import { CashSchema }`
 * line was ever generated for it. Now routed through the same
 * `trackTypeCallImport` helper the ordinary attribute-tracking loop uses.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { mkdtempWithNodeModules } from './emitted-module-dir.js';
import { pathToFileURL } from 'node:url';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, it, expect } from 'vitest';
import { generate } from '../../src/export.js';

const FIXTURE_DIR = resolve(
  new URL('.', import.meta.url).pathname,
  '../fixtures/data-extends-choice-crossns-alias-attr'
);

async function parseFixtureFiles() {
  const runeFiles = readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.rune'))
    .sort();
  const { RuneDsl } = createRuneDslServices();
  const docs = [];
  for (const file of runeFiles) {
    const content = readFileSync(join(FIXTURE_DIR, file), 'utf-8');
    const baseName = file.replace(/\.rune$/, '');
    const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      content,
      URI.parse(`inmemory:///data-extends-choice-crossns-alias-attr/${baseName}.rosetta`)
    );
    docs.push(doc);
  }
  await RuneDsl.shared.workspace.DocumentBuilder.build(docs);
  for (const doc of docs) {
    expect(doc.parseResult.parserErrors, 'fixture must parse without errors').toHaveLength(0);
  }
  return docs;
}

describe('zod — Data-extends-Choice, inlined ancestor attribute typed via a cross-namespace RosettaTypeAlias', () => {
  it('parses with zero errors (ground-truth check before any assertion depends on the fixture)', async () => {
    await parseFixtureFiles();
  });

  it("imports the alias's terminal Data schema, not just tracking the (untracked) alias itself", async () => {
    const docs = await parseFixtureFiles();
    const outputs = await generate(docs, { target: 'zod' });
    const childOutput = outputs.find((o) => o.relativePath.includes('/c.zod'));
    expect(childOutput).toBeDefined();

    // Value emission already resolves the alias to its terminal target.
    expect(childOutput!.content).toContain('holding: CashSchema.optional()');
    // Before the fix, this import line was missing entirely — the
    // inlined-ancestor loop's direct `.ref` check never matched the
    // RosettaTypeAlias node standing between `holding` and `Cash`.
    expect(childOutput!.content).toContain("import { AssetSchema, CashSchema } from './a.zod.js';");
  });

  it('emitted-runtime: the child module actually imports/executes across all three namespaces', async () => {
    const docs = await parseFixtureFiles();
    const outputs = await generate(docs, { target: 'zod' });
    const tmpDir = await mkdtempWithNodeModules('rune-codegen-dec-crossns-alias-attr-zod-');
    let childPath = '';
    for (const output of outputs) {
      const outPath = join(tmpDir, output.relativePath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, output.content, 'utf-8');
      if (output.relativePath.includes('/c.zod')) childPath = outPath;
    }
    expect(childPath).not.toBe('');

    // Dynamic-import the REAL emitted child module — the exact failure
    // mode the missing import produced (ReferenceError: CashSchema is not
    // defined, at module-init).
    const mod = (await import(/* @vite-ignore */ pathToFileURL(childPath).toString())) as Record<string, unknown>;
    const schema = mod['BasketConstituentSchema'] as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema).toBeDefined();
    expect(schema.safeParse({ cash: { amount: 1 }, holding: { amount: 5 }, weight: 3 }).success).toBe(true);
    expect(schema.safeParse({ holding: { amount: 5 }, weight: 3 }).success).toBe(false);
  });
});
