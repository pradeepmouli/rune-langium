// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';
import { resolveImportPath, type NamespaceRegistry } from '../src/emit/namespace-registry.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures/cross-namespace');

async function parseFixtureFiles(fixtureName: string) {
  const fixtureDir = join(FIXTURES_DIR, fixtureName);
  const runeFiles = readdirSync(fixtureDir)
    .filter((f) => f.endsWith('.rune'))
    .sort();

  const { RuneDsl } = createRuneDslServices();
  const docs = [];

  for (const file of runeFiles) {
    const content = readFileSync(join(fixtureDir, file), 'utf-8');
    // Langium's service registry matches files by extension. The core package
    // registers '.rosetta' — use that extension for in-memory documents.
    const baseName = file.replace(/\.rune$/, '');
    const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      content,
      URI.parse(`inmemory:///${fixtureName}/${baseName}.rosetta`)
    );
    docs.push(doc);
  }

  await RuneDsl.shared.workspace.DocumentBuilder.build(docs);
  return docs;
}

describe('US12: Cross-Namespace Import Resolution', () => {
  it('T042 inheritance — generates output for both namespaces', async () => {
    const docs = await parseFixtureFiles('inheritance');
    const outputs = await generate(docs, { target: 'typescript' });
    expect(outputs.length).toBeGreaterThanOrEqual(2);
  });

  it('T042 inheritance — derived namespace references base types', async () => {
    const docs = await parseFixtureFiles('inheritance');
    const outputs = await generate(docs, { target: 'typescript' });
    const derivedOutput = outputs.find((o) => o.relativePath.includes('derived'));
    expect(derivedOutput).toBeDefined();
    // The derived namespace should reference base types (import or inline)
    expect(derivedOutput!.content).toContain('BaseEntity');
  });

  it('T043 attribute-ref — usage namespace references types namespace', async () => {
    const docs = await parseFixtureFiles('attribute-ref');
    const outputs = await generate(docs, { target: 'typescript' });
    const usageOutput = outputs.find((o) => o.relativePath.includes('usage'));
    expect(usageOutput).toBeDefined();
    expect(usageOutput!.content).toContain('Address');
  });

  it('T044 func-params — funcs namespace references models namespace', async () => {
    const docs = await parseFixtureFiles('func-params');
    const outputs = await generate(docs, { target: 'typescript' });
    const funcsOutput = outputs.find((o) => o.relativePath.includes('funcs'));
    expect(funcsOutput).toBeDefined();
    expect(funcsOutput!.content).toContain('Amount');
  });

  it('T045 circular — both namespaces generate without errors', async () => {
    const docs = await parseFixtureFiles('circular');
    const outputs = await generate(docs, { target: 'typescript' });
    expect(outputs.length).toBeGreaterThanOrEqual(2);
    // Neither should have error diagnostics
    for (const output of outputs) {
      const errors = output.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    }
  });

  it('T045 circular — Zod target handles circular refs', async () => {
    const docs = await parseFixtureFiles('circular');
    const outputs = await generate(docs, { target: 'zod' });
    expect(outputs.length).toBeGreaterThanOrEqual(2);
    for (const output of outputs) {
      const errors = output.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    }
  });
});

describe('resolveImportPath unit tests', () => {
  // Semantics: getTargetRelativePath lays a namespace `a.b` out as the
  // FILE `a/b.<ext>` — so the relative walk starts from the from-file's
  // DIRECTORY (`a/`), and the last target segment is always the file.
  // These expectations were previously off by one `../` across the board
  // (the walk started from `a/b/` as if the namespace were a directory),
  // making every emitted cross-namespace import unresolvable on disk —
  // see resolveImportPath's doc comment and the multi-file compile check
  // in test/emit/data-extends-choice-crossns.test.ts.
  const emptyRegistry: NamespaceRegistry = { namespaces: new Map() };

  it('sibling namespaces are files in the same directory', () => {
    // a/b.ts -> a/c.ts
    expect(resolveImportPath('a.b', 'a.c', emptyRegistry)).toBe('./c');
  });

  it('same parent, deep target', () => {
    // a/b.ts -> a/c/d.ts
    expect(resolveImportPath('a.b', 'a.c.d', emptyRegistry)).toBe('./c/d');
  });

  it('deep to shallow', () => {
    // a/b/c.ts -> a/d.ts
    expect(resolveImportPath('a.b.c', 'a.d', emptyRegistry)).toBe('../d');
  });

  it('completely different roots', () => {
    // x/y.ts -> a/b.ts
    expect(resolveImportPath('x.y', 'a.b', emptyRegistry)).toBe('../a/b');
  });

  it('same namespace resolves to the file itself', () => {
    // a/b.ts -> a/b.ts (never emitted in practice — same-ns refs are local)
    expect(resolveImportPath('a.b', 'a.b', emptyRegistry)).toBe('./b');
  });

  it('child namespace', () => {
    // a.ts -> a/b.ts
    expect(resolveImportPath('a', 'a.b', emptyRegistry)).toBe('./a/b');
  });

  it('parent namespace', () => {
    // a/b.ts -> a.ts
    expect(resolveImportPath('a.b', 'a', emptyRegistry)).toBe('../a');
  });
});

describe('019 §5.3: namespace allowlist filter', () => {
  it('emits only the allowlisted namespaces', async () => {
    const docs = await parseFixtureFiles('inheritance');
    const outputs = await generate(docs, {
      target: 'typescript',
      namespaces: ['test.base']
    });
    // Only test.base survives; test.derived is filtered out.
    expect(outputs.every((o) => !o.relativePath.includes('derived'))).toBe(true);
    expect(outputs.some((o) => o.relativePath.includes('base'))).toBe(true);
  });

  it('emits everything when no allowlist is passed', async () => {
    const docs = await parseFixtureFiles('inheritance');
    const outputs = await generate(docs, { target: 'typescript' });
    expect(outputs.some((o) => o.relativePath.includes('base'))).toBe(true);
    expect(outputs.some((o) => o.relativePath.includes('derived'))).toBe(true);
  });

  it('returns [] when the allowlist matches no loaded namespace', async () => {
    const docs = await parseFixtureFiles('inheritance');
    const outputs = await generate(docs, {
      target: 'typescript',
      namespaces: ['nonexistent.ns']
    });
    expect(outputs).toEqual([]);
  });

  it('keeps a dependency-closed pair together (base + derived)', async () => {
    const docs = await parseFixtureFiles('inheritance');
    const outputs = await generate(docs, {
      target: 'typescript',
      namespaces: ['test.base', 'test.derived']
    });
    expect(outputs.some((o) => o.relativePath.includes('base'))).toBe(true);
    expect(outputs.some((o) => o.relativePath.includes('derived'))).toBe(true);
  });
});
