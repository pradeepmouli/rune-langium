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
    const outputs = generate(docs, { target: 'typescript' });
    expect(outputs.length).toBeGreaterThanOrEqual(2);
  });

  it('T042 inheritance — derived namespace references base types', async () => {
    const docs = await parseFixtureFiles('inheritance');
    const outputs = generate(docs, { target: 'typescript' });
    const derivedOutput = outputs.find((o) => o.relativePath.includes('derived'));
    expect(derivedOutput).toBeDefined();
    // The derived namespace should reference base types (import or inline)
    expect(derivedOutput!.content).toContain('BaseEntity');
  });

  it('T043 attribute-ref — usage namespace references types namespace', async () => {
    const docs = await parseFixtureFiles('attribute-ref');
    const outputs = generate(docs, { target: 'typescript' });
    const usageOutput = outputs.find((o) => o.relativePath.includes('usage'));
    expect(usageOutput).toBeDefined();
    expect(usageOutput!.content).toContain('Address');
  });

  it('T044 func-params — funcs namespace references models namespace', async () => {
    const docs = await parseFixtureFiles('func-params');
    const outputs = generate(docs, { target: 'typescript' });
    const funcsOutput = outputs.find((o) => o.relativePath.includes('funcs'));
    expect(funcsOutput).toBeDefined();
    expect(funcsOutput!.content).toContain('Amount');
  });

  it('T045 circular — both namespaces generate without errors', async () => {
    const docs = await parseFixtureFiles('circular');
    const outputs = generate(docs, { target: 'typescript' });
    expect(outputs.length).toBeGreaterThanOrEqual(2);
    // Neither should have error diagnostics
    for (const output of outputs) {
      const errors = output.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    }
  });

  it('T045 circular — Zod target handles circular refs', async () => {
    const docs = await parseFixtureFiles('circular');
    const outputs = generate(docs, { target: 'zod' });
    expect(outputs.length).toBeGreaterThanOrEqual(2);
    for (const output of outputs) {
      const errors = output.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    }
  });
});

describe('resolveImportPath unit tests', () => {
  const emptyRegistry: NamespaceRegistry = { namespaces: new Map() };

  it('sibling namespaces produce single ../', () => {
    expect(resolveImportPath('a.b', 'a.c', emptyRegistry)).toBe('../c');
  });

  it('same parent, deep target', () => {
    expect(resolveImportPath('a.b', 'a.c.d', emptyRegistry)).toBe('../c/d');
  });

  it('deep to shallow', () => {
    expect(resolveImportPath('a.b.c', 'a.d', emptyRegistry)).toBe('../../d');
  });

  it('completely different roots', () => {
    expect(resolveImportPath('x.y', 'a.b', emptyRegistry)).toBe('../../a/b');
  });

  it('same namespace produces ./', () => {
    expect(resolveImportPath('a.b', 'a.b', emptyRegistry)).toBe('./');
  });

  it('child namespace', () => {
    expect(resolveImportPath('a', 'a.b', emptyRegistry)).toBe('./b');
  });

  it('parent namespace', () => {
    expect(resolveImportPath('a.b', 'a', emptyRegistry)).toBe('..');
  });
});
