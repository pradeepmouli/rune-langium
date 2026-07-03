// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Regression test for the item-1 adjacent-suspect fix
 * (docs/superpowers/specs/2026-07-02-emitter-crossns-hardening-design.md):
 * plain Data-extends-Data JSON Schema composition must validate instances
 * that carry BOTH inherited parent properties and the child's own
 * properties. Real ajv (draft 2020-12) against the LITERAL emitted schema
 * (test/fixtures/inheritance/input.rune: `Dog extends Animal`, `Poodle
 * extends Dog`), not a hand-simplified analogue.
 *
 * json-schema-data-extends-data-ajv-probe.test.ts proved the PRE-FIX shape
 * (`allOf: [{$ref: parent}, {..., additionalProperties: false}]`) rejects
 * exactly this instance — this test pins the FIXED behavior.
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { Ajv2020 } from './ajv-2020.js';
import { generate } from '../../src/index.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, '../fixtures');

async function generateJsonSchema(fixtureName: string): Promise<Record<string, unknown>> {
  const fixtureDir = join(FIXTURES_DIR, fixtureName);
  const content = await readFile(join(fixtureDir, 'input.rune'), 'utf-8');

  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    content,
    URI.parse(`inmemory:///${fixtureName}.rosetta`)
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  expect(doc.parseResult.parserErrors, 'fixture must parse without errors').toHaveLength(0);

  const outputs = await generate(doc, { target: 'json-schema' });
  expect(outputs.length).toBeGreaterThan(0);
  return JSON.parse(outputs[0]!.content) as Record<string, unknown>;
}

describe('JSON Schema Data-extends-Data: parent properties validate on the composed schema', () => {
  it('an instance carrying both the parent property and the child own property is VALID', async () => {
    const schema = await generateJsonSchema('inheritance');
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/Dog' });

    const result = validate({ name: 'Rex', breed: 'Labrador' });
    expect(result, JSON.stringify(validate.errors)).toBe(true);
  });

  it('a two-level chain (Poodle extends Dog extends Animal) validates all three levels of properties', async () => {
    const schema = await generateJsonSchema('inheritance');
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/Poodle' });

    const result = validate({ name: 'Fifi', breed: 'Standard', size: 'small' });
    expect(result, JSON.stringify(validate.errors)).toBe(true);
  });

  it('missing a required PARENT property still fails (inheritance is not silently dropped)', async () => {
    const schema = await generateJsonSchema('inheritance');
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/Dog' });

    const result = validate({ breed: 'Labrador' });
    expect(result).toBe(false);
  });

  it('an unknown property is still rejected at a LEAF type (unevaluatedProperties preserves strictness at the composed level)', async () => {
    // Poodle is the leaf of the chain (nothing extends it in this
    // namespace) — its composed `allOf` node is the one that carries
    // `unevaluatedProperties: false` (see emitTypeDef's doc comment: only
    // the outermost composed node in a chain may self-close).
    const schema = await generateJsonSchema('inheritance');
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/Poodle' });

    const result = validate({ name: 'Rex', breed: 'Labrador', size: 'medium', bogus: true });
    expect(result).toBe(false);
  });

  it('Dog (an intermediate type with a local subtype, Poodle) does NOT reject unknown properties when validated standalone — the documented trade-off', async () => {
    // Dog is $ref'd into Poodle's allOf branch, so Dog's own composed node
    // must NOT self-close (see emitTypeDef's doc comment) — the emitter
    // cannot give the SAME shared `$defs/Dog` entry two different
    // closing behaviors depending on whether it's validated standalone or
    // through a subtype. This is the recorded trade-off, not a bug: only
    // LEAF types (no local subtype) get strict standalone validation.
    const schema = await generateJsonSchema('inheritance');
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/Dog' });

    const result = validate({ name: 'Rex', breed: 'Labrador', bogus: true });
    expect(result).toBe(true);
  });

  it('Animal (the ROOT of the chain, also a local supertype of Dog and Sibling) does NOT reject unknown properties when validated standalone — the SAME documented trade-off', async () => {
    // Animal's own $defs entry is $ref'd into BOTH Dog's and Sibling's
    // allOf branches (see fixtures/inheritance/input.rune), so it too
    // must not self-close with additionalProperties: false — identical
    // reasoning to the Dog case above, pinned separately because Animal
    // is a plain (non-composed) def, not itself an allOf node, so it
    // exercises the OTHER branch of emitTypeDef's typesWithLocalSubtype
    // check (the plain-Data branch, not the allOf/unevaluatedProperties
    // branch).
    const schema = await generateJsonSchema('inheritance');
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/Animal' });

    const result = validate({ name: 'Rex', bogus: true });
    expect(result).toBe(true);
  });

  it('the emitted schema itself is valid JSON Schema 2020-12 (ajv meta-schema check)', async () => {
    const schema = await generateJsonSchema('inheritance');
    const ajv = new Ajv2020({ strict: false });
    const isValid = ajv.validateSchema(schema);
    expect(isValid, JSON.stringify(ajv.errors)).toBe(true);
  });
});
