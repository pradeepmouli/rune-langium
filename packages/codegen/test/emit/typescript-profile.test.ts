// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Fixture-based tests for `typescriptProfile` (019 Phase 0.5.3).
 *
 * Mirrors the Zod profile tests against the TypeScript emitter — same
 * three layouts (per-namespace, barrel, single-file) plus the size
 * guardrail.
 */

import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/index.js';

const SOURCE_A = `namespace foo

type Trade:
  tradeId string (1..1)
  quantity number (1..1)
`;

const SOURCE_B = `namespace bar

type Party:
  name string (1..1)
`;

async function parseTwoNamespaces() {
  const { RuneDsl } = createRuneDslServices();
  const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
  const builder = RuneDsl.shared.workspace.DocumentBuilder;
  const docA = factory.fromString(SOURCE_A, URI.parse('inmemory:///foo.rosetta'));
  const docB = factory.fromString(SOURCE_B, URI.parse('inmemory:///bar.rosetta'));
  await builder.build([docA, docB], { validation: false });
  return [docA, docB];
}

describe('TypeScript LanguageProfile (019 Phase 0.5.3)', () => {
  it('per-namespace layout (library default) is unchanged: one file per namespace, inlined helpers', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'typescript' });

    const paths = outputs.map((o) => o.relativePath).sort();
    expect(paths).toEqual(['bar.ts', 'foo.ts']);

    for (const out of outputs) {
      expect(out.content).toContain('const runeCheckOneOf = (values:');
      // TS emit doesn't carry `import { z }` — that's Zod-only.
      expect(out.content).not.toContain(`import { z } from 'zod';`);
      expect(out.content).not.toContain(`from './runtime.js'`);
    }
  });

  it('barrel layout emits per-namespace files + index.ts + runtime.ts', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, {
      target: 'typescript',
      typescript: { layout: 'barrel' }
    });

    const paths = outputs.map((o) => o.relativePath).sort();
    expect(paths).toEqual(['bar.ts', 'foo.ts', 'index.ts', 'runtime.ts']);

    const fooOutput = outputs.find((o) => o.relativePath === 'foo.ts');
    expect(fooOutput?.content).toContain(`import { runeCheckOneOf, runeCount, runeAttrExists } from './runtime.js';`);
    expect(fooOutput?.content).not.toContain('// --- rune-codegen runtime helpers (inlined) ---');

    const indexOutput = outputs.find((o) => o.relativePath === 'index.ts');
    expect(indexOutput?.content).toContain(`export * from './foo.js';`);
    expect(indexOutput?.content).toContain(`export * from './bar.js';`);

    const runtimeOutput = outputs.find((o) => o.relativePath === 'runtime.ts');
    expect(runtimeOutput?.content).toContain(`export const runeCheckOneOf`);
    expect(runtimeOutput?.content).toContain(`export const runeCount`);
    expect(runtimeOutput?.content).toContain(`export const runeAttrExists`);
  });

  it('single-file layout emits one model.ts plus the runtime sidecar', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, {
      target: 'typescript',
      typescript: { layout: 'single-file' }
    });

    const paths = outputs.map((o) => o.relativePath).sort();
    expect(paths).toEqual(['model.ts', 'runtime.ts']);

    const model = outputs.find((o) => o.relativePath === 'model.ts');
    // One canonical helpers block; no Zod import (TS-only target).
    expect((model?.content.match(/const runeCheckOneOf = \(values:/g) ?? []).length).toBe(1);
    expect(model?.content).not.toContain(`import { z } from 'zod';`);
    // Both namespace bodies present.
    expect(model?.content).toContain('Trade');
    expect(model?.content).toContain('Party');
    // No leftover per-namespace header lines after strip.
    expect((model?.content.match(/^\/\/ Source namespace:/gm) ?? []).length).toBe(0);
  });

  it('single-file layout fires the size guardrail when maxNamespaces is exceeded', async () => {
    const { RuneDsl } = createRuneDslServices();
    const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
    const builder = RuneDsl.shared.workspace.DocumentBuilder;
    const docs = [];
    for (let i = 0; i < 51; i++) {
      docs.push(
        factory.fromString(
          `namespace ns${i}\n\ntype T${i}:\n  x string (1..1)\n`,
          URI.parse(`inmemory:///ns${i}.rosetta`)
        )
      );
    }
    await builder.build(docs, { validation: false });

    const outputs = await generate(docs, {
      target: 'typescript',
      typescript: { layout: 'single-file' }
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'single-file-too-large'
    });
  });
});
