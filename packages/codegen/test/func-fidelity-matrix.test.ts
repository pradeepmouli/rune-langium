// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * SC-009 Function Fidelity Matrix — T129.
 *
 * Target: 100-case battery for curated CDM func subset.
 * For each func: (a) emitted module compiles, (b) dynamic import + call,
 * (c) output matches Python generator's evaluation (≥99% parity).
 *
 * STATUS: Marked .todo due to curated-fixture coverage gap.
 *
 * The curated CDM fixtures under `packages/codegen/test/fixtures/` do not
 * include Rune `func` declarations — the curated CDM fixture set currently
 * covers only types, enumerations, and conditions (23 .rune files, 0 funcs).
 * The CDM model itself defines hundreds of computation-heavy funcs, but
 * the curated subset used in this test suite does not currently include
 * Rune func files. Until CDM func fixtures are added to the curated set
 * (a separate task), this matrix operates with 4 available func cases
 * (from the US6 fixture set: add-two, accumulator, alias-func, recursive).
 *
 * Available func cases: 4 (add-two, accumulator, alias-func, recursive)
 * Required for full SC-009: 100
 * Coverage gap: 96 cases
 *
 * When CDM func fixtures are added, remove the `.todo` from the 100-case
 * test and replace the stub with actual fixture iteration.
 *
 * T129, SC-009, FR-028, FR-029.
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';

const FUNCS_FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures/funcs');

/**
 * Parse a Rune file and return the TS output content + funcs metadata.
 */
async function generateAndInspect(fixtureName: string) {
  const inputPath = join(FUNCS_FIXTURES_DIR, fixtureName, 'input.rune');
  const content = await readFile(inputPath, 'utf-8');
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    content,
    URI.parse(`inmemory:///fidelity-${fixtureName}.rosetta`)
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  return generate(doc, { target: 'typescript' });
}

// ---------------------------------------------------------------------------
// SC-009 partial matrix — 4 available func fixtures
// (Full 100-case battery is .todo pending CDM func fixture coverage)
// ---------------------------------------------------------------------------

describe('func-fidelity-matrix: SC-009 (T129)', () => {
  // Actual cases available (4 of 100 required)
  // These verify: (a) emitted module has export function, (b) funcs[] is populated

  it('add-two: emitted module contains export function (SC-009 case 1/4)', async () => {
    const outputs = await generateAndInspect('add-two');
    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs[0]!.content).toContain('export function AddTwo(');
    expect(outputs[0]!.funcs.length).toBeGreaterThan(0);
    expect(outputs[0]!.funcs[0]!.name).toBe('AddTwo');
  });

  it('accumulator: emitted module contains array output (SC-009 case 2/4)', async () => {
    const outputs = await generateAndInspect('accumulator');
    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs[0]!.content).toContain('export function CollectItems(');
    expect(outputs[0]!.content).toContain('number[]');
    expect(outputs[0]!.funcs.length).toBeGreaterThan(0);
  });

  it('alias-func: emitted module contains alias binding (SC-009 case 3/4)', async () => {
    const outputs = await generateAndInspect('alias-func');
    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs[0]!.content).toContain('export function AliasFunc(');
    expect(outputs[0]!.content).toContain('const x =');
    expect(outputs[0]!.funcs.length).toBeGreaterThan(0);
  });

  it('recursive: emitted module contains multiple functions (SC-009 case 4/4)', async () => {
    const outputs = await generateAndInspect('recursive');
    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs[0]!.content).toContain('export function Double(');
    expect(outputs[0]!.content).toContain('export function Triple(');
    expect(outputs[0]!.funcs.length).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Full 100-case CDM battery — .todo until curated CDM func fixtures are added
  // (coverage gap: 96 cases missing)
  // ---------------------------------------------------------------------------

  it.todo(
    'SC-009: 100-case CDM func battery (≥99% parity) — ' +
      'BLOCKED: curated CDM fixture set has 0 func declarations (needs 100). ' +
      'Available: 4 US6 fixture funcs. Gap: 96. ' +
      'Add CDM func fixtures to packages/codegen/test/fixtures/funcs/ to activate.'
  );
});
