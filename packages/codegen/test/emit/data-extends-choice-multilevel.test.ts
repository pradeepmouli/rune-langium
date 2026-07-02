// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Data-extends-Choice — multi-level chain acceptance.
 *
 * Per docs/superpowers/specs/2026-07-02-data-extends-choice-design.md
 * (Semantics: "Chains may be multi-level (`Data extends Data extends
 * Choice`): extras accumulate down to the Choice ancestor.") and the
 * Acceptance gate's "multi-level chain test (synthetic fixture — the
 * corpus has no multi-level case; parse-first validate the fixture)".
 *
 * Fixture: `BasketConstituent extends ObservableItem extends Asset` (a
 * `choice`) — test/fixtures/data-extends-choice-multilevel/input.rune.
 * Parse-validated separately (hasErrors: false) before authoring this
 * suite, per the spec's instruction (the real corpus has no 3-level case
 * to cross-check against, unlike the single-level BasketConstituent-
 * extends-Observable case, which IS real corpus).
 *
 * Exercises all three fixed surfaces end-to-end against the SAME fixture:
 *  1. Transpiler (buildAttributeTypesMap resolves Cash/Commodity through
 *     the intermediate Data parent to the Choice ancestor).
 *  2. Zod (runeExtendChoice derivation + emitted-runtime behavior).
 *  3. TypeScript (generic child class + emitted-runtime behavior).
 */

import { readFile } from 'node:fs/promises';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, it, expect } from 'vitest';
import { walkNamespace } from '../../src/emit/namespace-walker.js';
import { emitNamespace as emitTs } from '../../src/emit/ts-emitter.js';
import { emitNamespace as emitZod } from '../../src/emit/zod-emitter.js';
import { generate } from '../../src/index.js';

const FIXTURE_DIR = resolve(new URL('.', import.meta.url).pathname, '../fixtures/data-extends-choice-multilevel');

async function parseFixture() {
  const content = await readFile(join(FIXTURE_DIR, 'input.rune'), 'utf-8');
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    content,
    URI.parse('inmemory:///data-extends-choice-multilevel.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  expect(doc.parseResult.parserErrors, 'fixture must parse without errors').toHaveLength(0);
  const model = doc.parseResult?.value;
  if (!model || !isRosettaModel(model)) {
    throw new Error('expected a RosettaModel');
  }
  return doc;
}

describe('Data-extends-Choice — multi-level chain (synthetic fixture, parse-validated)', () => {
  it('parses with zero errors (ground-truth check before any assertion depends on the fixture)', async () => {
    const doc = await parseFixture();
    expect(doc.parseResult.parserErrors).toHaveLength(0);
  });

  it('zod: both links derive directly from AssetSchema via runeExtendChoice — never a .extend() chain on a union', async () => {
    const doc = await parseFixture();
    const model = walkNamespace([doc], 'test.dataExtendsChoiceMultilevel');
    const output = emitZod(model, {});
    // Intermediate Data-extends-Choice link (ObservableItem) derives via runeExtendChoice.
    expect(output.content).toContain('export const ObservableItemSchema = runeExtendChoice(AssetSchema, {');
    // Leaf (BasketConstituent extends ObservableItem, itself Choice-derived):
    // ObservableItemSchema IS a z.union(...) result (no .extend() method) —
    // BasketConstituentSchema must derive directly from the Choice ANCESTOR
    // (AssetSchema), folding in BOTH ObservableItem's own attrs (identifier)
    // and BasketConstituent's own attrs (weight), not chain .extend() on
    // top of ObservableItemSchema.
    expect(output.content).toContain('export const BasketConstituentSchema = runeExtendChoice(AssetSchema, {');
    expect(output.content).toContain('identifier: z.string().optional()');
    expect(output.content).toContain('weight: z.number().optional()');
    expect(output.content).not.toContain('ObservableItemSchema.extend');
    expect(output.content).not.toContain('DIAGNOSTIC');
  });

  it("zod: the leaf's condition (CashIsAbsent) resolves through the multi-level chain to the REAL field key (data.cash), no DIAGNOSTIC", async () => {
    const doc = await parseFixture();
    const model = walkNamespace([doc], 'test.dataExtendsChoiceMultilevel');
    const output = emitZod(model, {});
    // `Cash` is the DSL-text pseudo-attribute name (buildAttributeTypesMap's
    // key, matching what the author literally wrote); `cash` is the REAL
    // emitted field key (choiceOptionFieldName) — see
    // zod-data-extends-choice.test.ts's single-level equivalent for the
    // full rationale. Multi-level must resolve the SAME remap even though
    // the Choice is 2 links away (ObservableItem, then the Choice).
    expect(output.content).toContain('runeAttrExists(data.cash)');
    expect(output.content).not.toContain('data.Cash');
    expect(output.content).not.toContain('DIAGNOSTIC');
  });

  it('ts: BasketConstituentShape has only BasketConstituent-own attrs; ObservableItemShape has only its own', async () => {
    const doc = await parseFixture();
    const model = walkNamespace([doc], 'test.dataExtendsChoiceMultilevel');
    const output = emitTs(model, {});
    expect(output.content).toContain('export interface ObservableItemShape {\n  identifier?: string;\n}');
    // BasketConstituent extends a Data (ObservableItem) at the leaf, so its
    // Shape interface DOES extend — ordinary Data-extends-Data emission,
    // unaffected by this feature.
    expect(output.content).toContain('export interface BasketConstituentShape extends ObservableItemShape');
  });

  it('ts: ObservableItem (the Data-extends-Choice link) is a generic class over Asset', async () => {
    const doc = await parseFixture();
    const model = walkNamespace([doc], 'test.dataExtendsChoiceMultilevel');
    const output = emitTs(model, {});
    expect(output.content).toContain('export class ObservableItem<T extends Asset = Asset> implements ObservableItemShape');
    expect(output.content).toContain('validateAsset(): { valid: boolean; errors: string[] } {');
  });

  it('ts: BasketConstituent (Data-extends-Data at the leaf) extends ObservableItem ordinarily — no generic param', async () => {
    const doc = await parseFixture();
    const model = walkNamespace([doc], 'test.dataExtendsChoiceMultilevel');
    const output = emitTs(model, {});
    expect(output.content).toContain('export class BasketConstituent extends ObservableItem implements BasketConstituentShape');
    expect(output.content).not.toContain('class BasketConstituent<T');
  });
});

describe('Data-extends-Choice — multi-level chain (emitted-runtime behavior, real execution)', () => {
  async function loadEmittedZodModule(): Promise<Record<string, unknown>> {
    const doc = await parseFixture();
    const outputs = await generate(doc, { target: 'zod' });
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-multilevel-zod-'));
    let modulePath = '';
    for (const output of outputs) {
      const outPath = join(tmpDir, output.relativePath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, output.content, 'utf-8');
      if (output.relativePath.includes('dataExtendsChoiceMultilevel')) modulePath = outPath;
    }
    expect(modulePath).not.toBe('');
    return (await import(/* @vite-ignore */ pathToFileURL(modulePath).toString())) as Record<string, unknown>;
  }

  async function loadEmittedTsModule(): Promise<Record<string, unknown>> {
    const doc = await parseFixture();
    const outputs = await generate(doc, { target: 'typescript' });
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-multilevel-ts-'));
    let modulePath = '';
    for (const output of outputs) {
      const outPath = join(tmpDir, output.relativePath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, output.content, 'utf-8');
      if (output.relativePath.includes('dataExtendsChoiceMultilevel')) modulePath = outPath;
    }
    expect(modulePath).not.toBe('');
    return (await import(/* @vite-ignore */ pathToFileURL(modulePath).toString())) as Record<string, unknown>;
  }

  it('zod: BasketConstituentSchema accepts a valid payload distributed through both links', async () => {
    const mod = await loadEmittedZodModule();
    const schema = mod['BasketConstituentSchema'] as { safeParse: (v: unknown) => { success: boolean } };
    // Zod arm keys are camelCase-first-letter of the option TYPE name
    // (choiceOptionFieldName: `Commodity` -> `commodity`) — a DIFFERENT
    // naming domain from the transpiler's pseudo-attribute keys (which use
    // the bare option type name, e.g. `Cash`, `Commodity` — see the TS
    // suite below, which correctly uses the capitalized form for the same
    // reason `buildAttributeTypesMap`'s Choice-parent walk does).
    const result = schema.safeParse({ commodity: { quantity: 3 }, identifier: 'x1', weight: 2 });
    expect(result.success).toBe(true);
  });

  it('zod: BasketConstituentSchema rejects a multi-option payload (exactly-one-of preserved through both links)', async () => {
    const mod = await loadEmittedZodModule();
    const schema = mod['BasketConstituentSchema'] as { safeParse: (v: unknown) => { success: boolean } };
    const result = schema.safeParse({
      cash: { amount: 1 },
      commodity: { quantity: 3 },
      identifier: 'x1',
      weight: 2
    });
    expect(result.success).toBe(false);
  });

  it("zod: BasketConstituentSchema's own condition (CashIsAbsent) still enforces", async () => {
    const mod = await loadEmittedZodModule();
    const schema = mod['BasketConstituentSchema'] as { safeParse: (v: unknown) => { success: boolean } };
    const result = schema.safeParse({ cash: { amount: 1 }, identifier: 'x1', weight: 2 });
    expect(result.success).toBe(false);
  });

  it('ts: constructing a BasketConstituent through both links carries the Choice option + intermediate + own attrs', async () => {
    const mod = await loadEmittedTsModule();
    const ObservableItem = mod['ObservableItem'] as new (data: unknown) => Record<string, unknown>;
    const BasketConstituent = mod['BasketConstituent'] as new (data: unknown) => Record<string, unknown>;

    // camelCase keys (`commodity`) — the REAL emitted union member key, not
    // the bare option type name.
    const observable = new ObservableItem({ commodity: { quantity: 3 }, identifier: 'x1' });
    expect(observable['identifier']).toBe('x1');
    expect(observable['commodity']).toEqual({ quantity: 3 });

    // BasketConstituent extends ObservableItem (Data-extends-Data at the
    // leaf) via `super(data)` per the ordinary (unchanged) convention —
    // the ctor param type is plain BasketConstituentShape (no generic),
    // so the Choice-carrying fields flow through structurally (data is a
    // superset object), not via a generic parameter at this level.
    const bc = new BasketConstituent({ commodity: { quantity: 3 }, identifier: 'x1', weight: 2 } as any);
    expect(bc['weight']).toBe(2);
  });

  it("ts: ObservableItem's validateAsset() enforces exactly-one-of even when reached through the intermediate link", async () => {
    const mod = await loadEmittedTsModule();
    const ObservableItem = mod['ObservableItem'] as new (
      data: unknown
    ) => { validateAsset(): { valid: boolean; errors: string[] } };
    const valid = new ObservableItem({ cash: { amount: 1 }, identifier: 'x1' });
    expect(valid.validateAsset().valid).toBe(true);

    const invalid = new ObservableItem({ cash: { amount: 1 }, commodity: { quantity: 2 }, identifier: 'x1' });
    expect(invalid.validateAsset().valid).toBe(false);
  });
});
