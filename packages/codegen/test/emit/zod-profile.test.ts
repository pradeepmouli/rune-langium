// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Fixture-based tests for `zodProfile` (019 Phase 0.5.2) — exercises
 * `runGenerate` end-to-end against a real 2-namespace model and checks
 * the output structure for each Zod layout.
 *
 * Per-namespace layout (today's library default): no behavior change.
 * Barrel layout: per-namespace files (with import from runtime sidecar
 * instead of inline helpers), one `index.zod.ts`, one `runtime.zod.ts`.
 * Single-file layout: one `model.zod.ts` containing all schemas plus
 * the inlined helpers; the size-limit branch is exercised separately.
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

describe('Zod LanguageProfile (019 Phase 0.5.2)', () => {
  it('per-namespace layout (library default) is unchanged: one file per namespace, inlined helpers', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'zod' });

    const paths = outputs.map((o) => o.relativePath).sort();
    expect(paths).toEqual(['bar.zod.ts', 'foo.zod.ts']);

    // Each per-namespace file still inlines the helper block.
    for (const out of outputs) {
      expect(out.content).toContain('const runeCheckOneOf = (values:');
      expect(out.content).toContain(`import { z } from 'zod';`);
      // And does NOT pull from a sidecar.
      expect(out.content).not.toContain(`from './runtime.zod.js'`);
    }
  });

  it('barrel layout emits per-namespace files + index.zod.ts + runtime.zod.ts', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'zod', zod: { layout: 'barrel' } });

    const paths = outputs.map((o) => o.relativePath).sort();
    expect(paths).toEqual(['bar.zod.ts', 'foo.zod.ts', 'index.zod.ts', 'runtime.zod.ts']);

    // Per-namespace files no longer inline the helper block — they
    // import it from the sidecar.
    const fooOutput = outputs.find((o) => o.relativePath === 'foo.zod.ts');
    expect(fooOutput?.content).toContain(
      `import { runeCheckOneOf, runeCount, runeAttrExists, runeToDate, runeToTime, runeToDateTime, runeToZonedDateTime } from './runtime.zod.js';`
    );
    expect(fooOutput?.content).not.toContain('// --- rune-codegen runtime helpers (inlined) ---');

    // index.zod.ts re-exports each namespace module.
    const indexOutput = outputs.find((o) => o.relativePath === 'index.zod.ts');
    expect(indexOutput?.content).toContain(`export * from './foo.zod.js';`);
    expect(indexOutput?.content).toContain(`export * from './bar.zod.js';`);

    // runtime.zod.ts ships the helpers as `export const`.
    const runtimeOutput = outputs.find((o) => o.relativePath === 'runtime.zod.ts');
    expect(runtimeOutput?.content).toContain(`export const runeCheckOneOf`);
    expect(runtimeOutput?.content).toContain(`export const runeCount`);
    expect(runtimeOutput?.content).toContain(`export const runeAttrExists`);
  });

  it('single-file layout emits one model.zod.ts (no helpers in the sidecar slot for single-file)', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'zod', zod: { layout: 'single-file' } });

    const paths = outputs.map((o) => o.relativePath).sort();
    // Single-file still ships the runtime sidecar (Profile's
    // `makeSharedArtifacts` always returns it). The model file is the
    // canonical artifact; the sidecar is informational.
    expect(paths).toEqual(['model.zod.ts', 'runtime.zod.ts']);

    const model = outputs.find((o) => o.relativePath === 'model.zod.ts');
    // One canonical header, one Zod import, one inlined helpers block.
    expect((model?.content.match(/import \{ z \} from 'zod';/g) ?? []).length).toBe(1);
    expect((model?.content.match(/const runeCheckOneOf = \(values:/g) ?? []).length).toBe(1);
    // Both namespace bodies present, with stripped per-namespace headers.
    expect(model?.content).toContain('TradeSchema');
    expect(model?.content).toContain('PartySchema');
    // No leftover per-namespace header lines after strip.
    expect((model?.content.match(/^\/\/ Source namespace:/gm) ?? []).length).toBe(0);
  });

  it('single-file layout fires the size guardrail when maxNamespaces is exceeded', async () => {
    // Build a 51-namespace model to trip the maxNamespaces=50 default.
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
      target: 'zod',
      zod: { layout: 'single-file' }
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'single-file-too-large'
    });
    expect(outputs[0]?.diagnostics[0]?.message).toContain('51 > 50');
  });
});
