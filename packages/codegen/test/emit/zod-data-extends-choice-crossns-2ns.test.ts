// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Item 4 (docs/superpowers/specs/2026-07-02-emitter-crossns-hardening-
 * design.md): "the 2-namespace fixture (data-extends-choice-crossns) has a
 * TS-side multi-file compile check but no zod-side runtime-import
 * counterpart" — this closes that gap using the SAME
 * `mkdtempWithNodeModules` pattern zod-data-extends-choice-crossns.test.ts
 * (the 3-namespace multilevel fixture) already established.
 *
 * Fixture: `TransferableProduct` (ns test.decxns.product) extends `Asset`
 * (choice, ns test.decxns.base) — test/fixtures/data-extends-choice-
 * crossns/, shared with data-extends-choice-crossns.test.ts's TS coverage.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, it, expect } from 'vitest';
import { mkdtempWithNodeModules } from './emitted-module-dir.js';
import { generate } from '../../src/index.js';

const FIXTURE_DIR = resolve(new URL('.', import.meta.url).pathname, '../fixtures/data-extends-choice-crossns');

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
      URI.parse(`inmemory:///data-extends-choice-crossns/${baseName}.rosetta`)
    );
    docs.push(doc);
  }
  await RuneDsl.shared.workspace.DocumentBuilder.build(docs);
  for (const doc of docs) {
    expect(doc.parseResult.parserErrors, 'fixture must parse without errors').toHaveLength(0);
  }
  return docs;
}

describe('zod — Data-extends-Choice, 2-namespace fixture, multi-file dynamic-import guard', () => {
  it('imports AssetSchema from the base namespace', async () => {
    const docs = await parseFixtureFiles();
    const outputs = await generate(docs, { target: 'zod' });
    const productOutput = outputs.find((o) => o.relativePath.includes('product'));
    expect(productOutput).toBeDefined();
    expect(productOutput!.content).toContain("import { AssetSchema } from './base.zod.js';");
    expect(productOutput!.content).toContain('runeExtendChoice(AssetSchema, {');
  });

  it('MULTI-FILE dynamic-import: the emitted product module actually imports/executes across namespaces', async () => {
    const docs = await parseFixtureFiles();
    const outputs = await generate(docs, { target: 'zod' });
    const tmpDir = await mkdtempWithNodeModules('rune-codegen-dec-crossns-2ns-zod-');
    let productPath = '';
    for (const output of outputs) {
      const outPath = join(tmpDir, output.relativePath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, output.content, 'utf-8');
      if (output.relativePath.includes('product')) productPath = outPath;
    }
    expect(productPath).not.toBe('');

    // Dynamic-import the REAL emitted product module — a missing import
    // fails here at module-init (ReferenceError: AssetSchema is not
    // defined), which a single-file virtual check cannot catch.
    const mod = (await import(/* @vite-ignore */ pathToFileURL(productPath).toString())) as Record<string, unknown>;
    const schema = mod['TransferableProductSchema'] as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema).toBeDefined();

    expect(schema.safeParse({ commodity: { quantity: 2 }, weight: 3 }).success).toBe(true);
    expect(schema.safeParse({ weight: 3 }).success).toBe(false);
    expect(schema.safeParse({ cash: { amount: 1 }, commodity: { quantity: 2 }, weight: 3 }).success).toBe(false);
  });
});
