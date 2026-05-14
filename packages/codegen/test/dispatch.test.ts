// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Contract-dispatch tests for `runGenerate` (018 Phase 0 Task 0.4).
 *
 * Locks in:
 * - Unknown / not-yet-registered targets return a single
 *   not-implemented diagnostic (one per request, not per namespace).
 * - The registered targets (zod, typescript, json-schema) still produce
 *   one output per namespace via the NamespaceEmitter dispatch path.
 * - generate() is async and returns Promise<GeneratorOutput[]>.
 */

import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';

const RUNE_SOURCE = `namespace cdm.base.math

type Quantity:
  amount number (1..1)
  currency string (0..1)
`;

async function parseInput() {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    RUNE_SOURCE,
    URI.parse('inmemory:///dispatch-test.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc], { validation: false });
  return doc;
}

describe('runGenerate dispatch (018 Task 0.4)', () => {
  it('rejects targets without a registered emitter with a not-implemented diagnostic', async () => {
    const doc = await parseInput();
    const outputs = await generate(doc, { target: 'sql' });
    // Phase 0 doesn't ship the SQL emitter — registered in Phase 2.
    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.diagnostics.some((d) => d.code === 'not-implemented')).toBe(true);
    expect(outputs[0]?.diagnostics[0]?.message).toContain("'sql'");
  });

  it('produces one output per namespace for registered NamespaceEmitter targets', async () => {
    const doc = await parseInput();
    const outputs = await generate(doc, { target: 'zod' });
    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.relativePath).toMatch(/cdm\/base\/math\.zod\.ts$/);
    expect(outputs[0]?.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('generate() returns a Promise<GeneratorOutput[]>', async () => {
    const doc = await parseInput();
    // Capture the call inside a wrapper so an over-eager auto-fixer
    // doesn't insert `await` between us and the Promise we want to
    // poke at directly.
    const callOnce = (): unknown => generate(doc, { target: 'zod' });
    const result = callOnce();
    expect(typeof (result as Promise<unknown>).then).toBe('function');
    const resolved = await result;
    expect(Array.isArray(resolved)).toBe(true);
  });
});
