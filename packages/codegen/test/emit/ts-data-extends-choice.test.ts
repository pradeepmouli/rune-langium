// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Data-extends-Choice — ts-emitter surface.
 *
 * Per docs/superpowers/specs/2026-07-02-data-extends-choice-design.md
 * (AMENDED "TS type — generic intersection" and "TS class — generic child
 * class" sections): a `Data` whose `superType` is a `Choice` (real corpus
 * case: `BasketConstituent extends Observable`) emits:
 *  - `<Name>Shape` interface holding ONLY the child's OWN attributes (no
 *    `extends <Parent>Shape` — a Choice's emitted form is a union type, and
 *    interfaces cannot extend a union; this is the same `<Name>Shape`
 *    naming idiom `emitInterface` already uses for Data-extends-Data, just
 *    without the extends clause when the parent is a Choice).
 *  - a generic CLASS threading the arm type parameter through the
 *    constructor: `constructor(data: T & <Name>Shape)` +
 *    `Object.assign(this, data)` for the T-surface, own attributes still
 *    assigned explicitly afterward (existing convention, unchanged) — per
 *    the spec's amended encoding. NOT a mixin, NOT a competing static
 *    `of<T>()` factory; `static from`/`new <Name>(...)` remain the only
 *    construction paths.
 *
 * Before this fix: emitInterface/emitClass only ever checked
 * `isData(parentRef)` for the extends/inheritance branch — a Choice
 * supertype silently fell through to the "no parent" branch, so the child
 * lost ALL inherited option fields and emitted as if it had no supertype
 * at all (own attributes only, `implements <Name>Shape` with no `extends`,
 * no generic parameter, no exactly-one-of validator for the inherited
 * options).
 */

import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, it, expect } from 'vitest';
import { walkNamespace } from '../../src/emit/namespace-walker.js';
import { emitNamespace } from '../../src/emit/ts-emitter.js';
import { generate } from '../../src/index.js';

async function parseSource(source: string) {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///model.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  const model = doc.parseResult?.value;
  if (!model || !isRosettaModel(model)) {
    throw new Error('expected a RosettaModel');
  }
  return doc;
}

const FIXTURE = `
namespace test.tsDataExtendsChoice
version "0.0.0"

type Cash:
    amount number (0..1)

type Commodity:
    quantity number (0..1)

choice Asset:
    Cash
    Commodity

type BasketConstituent extends Asset:
    weight number (0..1)

    condition CashIsAbsent:
        Cash is absent
`;

describe('ts-emitter — Data extends Choice: TYPE surface (own-attrs Shape interface)', () => {
  it('emits <Name>Shape holding only the OWN attributes — no extends clause (Choice parent has no interface form)', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.tsDataExtendsChoice');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('export interface BasketConstituentShape {\n  weight?: number;\n}');
    expect(output.content).not.toContain('BasketConstituentShape extends');
  });
});

describe('ts-emitter — Data extends Choice: CLASS surface (generic child class)', () => {
  it('emits a class generic over the Choice arm, defaulting to the full Choice union', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.tsDataExtendsChoice');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('export class BasketConstituent<T extends Asset = Asset>');
  });

  it("the constructor threads the generic (data: T & <Name>Shape) and Object.assign's the T-surface", async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.tsDataExtendsChoice');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('constructor(data: T & BasketConstituentShape) {');
    expect(output.content).toContain('Object.assign(this, data);');
  });

  it('own attributes are still assigned explicitly in the constructor (existing convention preserved)', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.tsDataExtendsChoice');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('this.weight = data.weight as typeof this.weight;');
  });

  it('does NOT emit a mixin factory (ObservableMixin-shaped export) — superseded design', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.tsDataExtendsChoice');
    const output = emitNamespace(model, {});
    expect(output.content).not.toMatch(/Mixin\s*=\s*</);
    expect(output.content).not.toContain('Constructor');
  });

  it('static from(...) still delegates to `new <Name>(...)` — single construction path preserved', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.tsDataExtendsChoice');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('static from(json: unknown): BasketConstituent {');
    expect(output.content).toContain('return new BasketConstituent(json as BasketConstituentShape);');
  });

  it('emits an exactly-one-of validate method reading the REAL (camelCase) field keys, not the DSL-text option names', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.tsDataExtendsChoice');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('validateAsset(): { valid: boolean; errors: string[] } {');
    // `this.cash`/`this.commodity` (camelCase) are the REAL populated
    // fields (Object.assign(this, data) from a `{ cash: Cash }`-shaped
    // union member) — NOT `this.Cash`/`this.Commodity` (the bare option
    // type names, which is what the ERROR MESSAGE still uses for
    // readability, but is never a real property on the instance).
    expect(output.content).toContain('runeCheckOneOf([this.cash, this.commodity])');
    expect(output.content).toContain("errors.push('Asset: exactly one of [Cash, Commodity] must be present");
  });

  it("the child's own condition (CashIsAbsent) is still emitted", async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.tsDataExtendsChoice');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('validateCashIsAbsent(): { valid: boolean; errors: string[] } {');
    expect(output.content).not.toContain('DIAGNOSTIC');
  });
});

describe('ts-emitter — Data extends Choice (emitted-runtime behavior, real execution)', () => {
  /**
   * Generates the FULL namespace via the public `generate()` entry point,
   * writes the ACTUAL emitted output to a temp dir, and dynamic-imports it
   * — exercising the literal generator output (not a hand-written
   * analogue) at runtime. Mirrors zod-data-extends-choice.test.ts's
   * loadEmittedModule pattern for the Zod surface.
   */
  async function loadEmittedModule(): Promise<Record<string, unknown>> {
    const doc = await parseSource(FIXTURE);
    const outputs = await generate(doc, { target: 'typescript' });
    expect(outputs.length).toBeGreaterThan(0);

    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-ts-data-extends-choice-'));
    let modulePath = '';
    for (const output of outputs) {
      const outPath = join(tmpDir, output.relativePath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, output.content, 'utf-8');
      if (output.relativePath.includes('tsDataExtendsChoice')) {
        modulePath = outPath;
      }
    }
    expect(modulePath).not.toBe('');
    const mod = (await import(/* @vite-ignore */ pathToFileURL(modulePath).toString())) as Record<string, unknown>;
    return mod;
  }

  // Payloads use camelCase keys (`cash`/`commodity`) — matching the REAL
  // emitted union member keys (`export type Asset = { cash: Cash } | {
  // commodity: Commodity }`), NOT the bare option type names.

  it('bare `new BasketConstituent(data)` (non-generic default) constructs and exposes the T-surface + own attrs', async () => {
    const mod = await loadEmittedModule();
    const BasketConstituent = mod['BasketConstituent'] as new (data: unknown) => Record<string, unknown>;
    const bc = new BasketConstituent({ cash: { amount: 5 }, weight: 2 });
    expect(bc['weight']).toBe(2);
    expect(bc['cash']).toEqual({ amount: 5 });
  });

  it('a narrowed generic instantiation `new BasketConstituent<{ commodity: ... }>(data)` also constructs correctly', async () => {
    const mod = await loadEmittedModule();
    const BasketConstituent = mod['BasketConstituent'] as new (data: unknown) => Record<string, unknown>;
    const bc = new BasketConstituent({ commodity: { quantity: 9 }, weight: 3 });
    expect(bc['weight']).toBe(3);
    expect(bc['commodity']).toEqual({ quantity: 9 });
  });

  it('validateAsset() passes for exactly one option present', async () => {
    const mod = await loadEmittedModule();
    const BasketConstituent = mod['BasketConstituent'] as new (
      data: unknown
    ) => { validateAsset(): { valid: boolean; errors: string[] } };
    // Use commodity here (not cash) so this test is independent of
    // CashIsAbsent's own semantics — see the dedicated test below.
    const bc = new BasketConstituent({ commodity: { quantity: 1 }, weight: 2 });
    expect(bc.validateAsset()).toEqual({ valid: true, errors: [] });
  });

  it('validateAsset() fails when multiple option keys are present', async () => {
    const mod = await loadEmittedModule();
    const BasketConstituent = mod['BasketConstituent'] as new (
      data: unknown
    ) => { validateAsset(): { valid: boolean; errors: string[] } };
    const bc = new BasketConstituent({ cash: { amount: 5 }, commodity: { quantity: 1 }, weight: 2 });
    const result = bc.validateAsset();
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Asset');
  });

  it('validateAsset() fails when no option key is present', async () => {
    const mod = await loadEmittedModule();
    const BasketConstituent = mod['BasketConstituent'] as new (
      data: unknown
    ) => { validateAsset(): { valid: boolean; errors: string[] } };
    const bc = new BasketConstituent({ weight: 2 });
    expect(bc.validateAsset().valid).toBe(false);
  });

  it("the child's own condition (validateCashIsAbsent) still enforces post-construction — this is the accessor-naming fix's ground-truth check", async () => {
    const mod = await loadEmittedModule();
    const BasketConstituent = mod['BasketConstituent'] as new (
      data: unknown
    ) => { validateCashIsAbsent(): { valid: boolean; errors: string[] } };
    // `cash` present -> CashIsAbsent must reject. This is the exact case
    // that silently passed as a false positive before the
    // attrAccessorNames/choiceOptionFieldName fix in
    // emitChoiceParentValidateMethod (the check read `this.Cash`, always
    // undefined since Object.assign only ever populates `this.cash`).
    const withCash = new BasketConstituent({ cash: { amount: 5 }, weight: 2 });
    expect(withCash.validateCashIsAbsent().valid).toBe(false);

    const withoutCash = new BasketConstituent({ commodity: { quantity: 1 }, weight: 2 });
    expect(withoutCash.validateCashIsAbsent().valid).toBe(true);
  });

  it('static from(json) delegates to `new BasketConstituent(...)` and round-trips', async () => {
    const mod = await loadEmittedModule();
    const BasketConstituent = mod['BasketConstituent'] as {
      from(json: unknown): { weight?: number };
    };
    const bc = BasketConstituent.from({ cash: { amount: 1 }, weight: 7 });
    expect(bc.weight).toBe(7);
  });
});
