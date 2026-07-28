// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Data-extends-Choice — MULTI-LEVEL CROSS-NAMESPACE chain, zod surface.
 *
 * Fixture: child in ns C (`BasketConstituent extends ObservableItem`) →
 * Data in ns B (`ObservableItem extends Asset`, carrying a Data-typed
 * attribute `holding Cash` whose type lives in ns A) → Choice in ns A
 * (`Asset`). test/fixtures/data-extends-choice-crossns-multilevel/.
 *
 * Closes a PR-review (Copilot) finding: `buildSuperTypeSchemaExpr`'s
 * choice-ancestor branch emits `runeExtendChoice(<ChoiceAncestor>Schema,
 * {...})` into the CHILD's file, but `collectCrossNamespaceImports` only
 * tracked the IMMEDIATE parentRef's `<name>Schema` — so the Choice
 * ancestor's schema (2+ links up, here in ns A which the child's document
 * does not even import directly) was referenced with NO import. Adjacent
 * gap fixed in the same walk: `buildRuneExtendChoiceExpr` folds the own
 * attributes of the immediate parent + every intermediate INLINE into the
 * child's file, so those attributes' schema refs (here `CashSchema`, from
 * the child namespace's perspective a foreign symbol) are emitted in the
 * child's file too and were equally untracked — the attribute-tracking
 * loop only iterates the emitting namespace's own data.
 *
 * (The DIRECT cross-ns Data-extends-Choice case was already correct: the
 * immediate parentRef IS the Choice, covered by the unconditional
 * supertype trackRef, with no foreign attributes folded.)
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
  '../fixtures/data-extends-choice-crossns-multilevel'
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
      URI.parse(`inmemory:///data-extends-choice-crossns-multilevel/${baseName}.rosetta`)
    );
    docs.push(doc);
  }
  await RuneDsl.shared.workspace.DocumentBuilder.build(docs);
  for (const doc of docs) {
    expect(doc.parseResult.parserErrors, 'fixture must parse without errors').toHaveLength(0);
  }
  return docs;
}

describe('zod — Data-extends-Choice, multi-level chain crossing namespaces', () => {
  it('parses with zero errors (ground-truth check before any assertion depends on the fixture)', async () => {
    await parseFixtureFiles();
  });

  it("the child module derives from the Choice ANCESTOR's schema and imports it plus the inlined foreign attribute schemas", async () => {
    const docs = await parseFixtureFiles();
    const outputs = await generate(docs, { target: 'zod' });
    const childOutput = outputs.find((o) => o.relativePath.includes('/c.zod'));
    expect(childOutput).toBeDefined();

    // The emitted derivation references AssetSchema (ns A — two links up
    // the extends chain; the child's own document only imports ns B).
    expect(childOutput!.content).toContain('runeExtendChoice(AssetSchema, {');
    // The intermediate's own attributes are folded inline — including the
    // ns-A-typed `holding Cash`, so CashSchema is referenced HERE.
    expect(childOutput!.content).toContain('holding: CashSchema.optional()');
    expect(childOutput!.content).toContain('weight: z.number().optional()');

    // Both foreign symbols must be IMPORTED from ns A (sorted, merged into
    // one line per namespace by buildCrossNsImportLines). Before the fix,
    // neither was tracked: AssetSchema and CashSchema were referenced with
    // no import at all.
    expect(childOutput!.content).toContain("import { AssetSchema, CashSchema } from './a.zod.js';");
    expect(childOutput!.content).not.toContain('DIAGNOSTIC');
  });

  it('emitted-runtime: the child module actually imports/executes across all three namespaces', async () => {
    const docs = await parseFixtureFiles();
    const outputs = await generate(docs, { target: 'zod' });
    const tmpDir = await mkdtempWithNodeModules('rune-codegen-dec-crossns-ml-zod-');
    let childPath = '';
    for (const output of outputs) {
      const outPath = join(tmpDir, output.relativePath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, output.content, 'utf-8');
      if (output.relativePath.includes('/c.zod')) childPath = outPath;
    }
    expect(childPath).not.toBe('');

    // Dynamic-import the REAL emitted child module — this is the exact
    // failure mode the missing imports produced (ReferenceError:
    // AssetSchema is not defined, at module-init).
    const mod = (await import(/* @vite-ignore */ pathToFileURL(childPath).toString())) as Record<string, unknown>;
    const schema = mod['BasketConstituentSchema'] as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema).toBeDefined();

    // One option + inlined intermediate attr + own attr → parses.
    expect(schema.safeParse({ commodity: { quantity: 2 }, holding: { amount: 5 }, weight: 3 }).success).toBe(true);
    // No option key → fails (exactly-one-of preserved through the chain).
    expect(schema.safeParse({ holding: { amount: 5 }, weight: 3 }).success).toBe(false);
    // Two option keys → fails.
    expect(schema.safeParse({ cash: { amount: 1 }, commodity: { quantity: 2 }, weight: 3 }).success).toBe(false);
  });
});
