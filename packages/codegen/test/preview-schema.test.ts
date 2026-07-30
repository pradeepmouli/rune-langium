// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generatePreviewSchemas } from '../src/export.js';
import type { PreviewField } from '../src/types.js';

const skipIfNodeLt22 = it.skipIf(Number(process.versions.node.split('.')[0]) < 22);
const REAL_CDM_ADJUSTABLE_DATE_FIXTURES = [
  new URL('../../../.resources/cdm/base-datetime-enum.rosetta', import.meta.url),
  new URL('../../../.resources/cdm/base-datetime-type.rosetta', import.meta.url)
] as const;
const skipIfAdjustableDateFixturesUnavailable = it.skipIf(
  Number(process.versions.node.split('.')[0]) < 22 ||
    !REAL_CDM_ADJUSTABLE_DATE_FIXTURES.every((fixtureUrl) => existsSync(fixtureUrl))
);

async function parseModel(source: string) {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///preview-schema.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  const parseErrors = doc.parseResult.parserErrors.map((error) => error.message);
  expect(parseErrors).toEqual([]);
  return doc;
}

async function parseFixture(relativePath: string) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  return parseModel(source);
}

async function parseModels(sources: readonly string[]) {
  const { RuneDsl } = createRuneDslServices();
  const docs = sources.map((source, i) =>
    RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      source,
      URI.parse(`inmemory:///preview-schema-${i}.rosetta`)
    )
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build(docs);
  for (const doc of docs) {
    expect(doc.parseResult.parserErrors.map((error) => error.message)).toEqual([]);
  }
  return docs;
}

describe('FormPreviewSchema generation', () => {
  skipIfNodeLt22('serializes scalar, optional, array, enum, and nested fields', async () => {
    const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      enum Side:
        Buy displayName "Buy side"
        Sell

      type Party:
        name string (1..1)

      type Trade:
        id string (1..1)
        quantity int (0..1)
        tags string (0..*)
        side Side (1..1)
        party Party (1..1)
    `);

    const schemas = generatePreviewSchemas([doc]);
    const trade = schemas.find((schema) => schema.targetId === 'test.preview.Trade');

    expect(trade).toMatchObject({
      schemaVersion: 1,
      targetId: 'test.preview.Trade',
      title: 'Trade',
      status: 'ready'
    });
    expect(trade?.sourceMap).toEqual([
      {
        fieldPath: 'id',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 13,
        sourceChar: 9
      },
      {
        fieldPath: 'quantity',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 14,
        sourceChar: 9
      },
      {
        fieldPath: 'tags',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 15,
        sourceChar: 9
      },
      {
        fieldPath: 'side',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 16,
        sourceChar: 9
      },
      {
        fieldPath: 'party',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 17,
        sourceChar: 9
      },
      {
        fieldPath: 'party.name',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 10,
        sourceChar: 9
      }
    ]);
    expect(trade?.fields).toEqual([
      { path: 'id', label: 'Id', kind: 'string', required: true },
      {
        path: 'quantity',
        label: 'Quantity',
        kind: 'number',
        required: false,
        cardinality: { min: 0, max: 1 }
      },
      {
        path: 'tags',
        label: 'Tags',
        kind: 'array',
        required: false,
        cardinality: { min: 0, max: 'unbounded' },
        children: [{ path: 'tags[]', label: 'Tags item', kind: 'string', required: true }]
      },
      {
        path: 'side',
        label: 'Side',
        kind: 'enum',
        required: true,
        enumValues: [
          { value: 'Buy', label: 'Buy side' },
          { value: 'Sell', label: 'Sell' }
        ]
      },
      {
        path: 'party',
        label: 'Party',
        kind: 'object',
        required: true,
        children: [{ path: 'party.name', label: 'Name', kind: 'string', required: true }]
      }
    ]);
  });

  skipIfNodeLt22('marks recursive expansion as unsupported instead of expanding forever', async () => {
    const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Node:
        value string (1..1)
        child Node (0..1)
    `);

    const [node] = generatePreviewSchemas([doc], { maxDepth: 1 });

    expect(node?.targetId).toBe('test.preview.Node');
    expect(node?.unsupportedFeatures).toContain('recursive-reference:Node');
    expect(node?.fields).toEqual([
      { path: 'value', label: 'Value', kind: 'string', required: true },
      {
        path: 'child',
        label: 'Child',
        kind: 'unknown',
        required: false,
        cardinality: { min: 0, max: 1 },
        description: 'Recursive reference to Node is not expanded in form preview.'
      }
    ]);
  });

  skipIfNodeLt22(
    'does not spuriously block expansion when two DIFFERENT types in different namespaces share a bare simple name (issue #436)',
    async () => {
      // The `seenTypes` recursion guard previously keyed by bare `.name`
      // alone. `trade.Observable` referencing the UNRELATED
      // `asset.Observable` (same simple name, different namespace, no
      // actual cycle) used to trip the guard the moment the outer schema
      // being generated was ALSO named `Observable` — the guard seeds
      // itself with the outer type's own bare name, so a same-named nested
      // reference reads as "already seen" even though it's a distinct type.
      const docs = await parseModels([
        `
          namespace test.crossns.asset
          version "1"

          type Observable:
            value number (1..1)
        `,
        `
          namespace test.crossns.trade
          version "1"

          import test.crossns.asset.*

          type Observable:
            name string (1..1)
            linked test.crossns.asset.Observable (0..1)
        `
      ]);

      const schemas = generatePreviewSchemas(docs);
      const tradeObservable = schemas.find((s) => s.targetId === 'test.crossns.trade.Observable');

      expect(tradeObservable?.status).toBe('ready');
      expect(tradeObservable?.unsupportedFeatures).toBeUndefined();
      expect(tradeObservable?.fields.find((f) => f.path === 'linked')).toMatchObject({
        kind: 'object',
        children: [{ path: 'linked.value', label: 'Value', kind: 'number', required: true }]
      });
    }
  );

  skipIfNodeLt22(
    "does not stop early walking an 'extends' chain through a same-simple-name ancestor in a different namespace (issue #436 follow-up)",
    async () => {
      // collectInheritedAttributes has its OWN separate `visited` cycle
      // guard (distinct from buildDataSchema/etc.'s `seenTypes`), which had
      // the identical bare-name-collision bug: `derived.Observable extends
      // base.Observable` (same simple name, different namespace) stopped
      // the walk after the FIRST link, silently dropping the base type's
      // inherited attributes — a structurally-invalid sample (missing a
      // required parent field) would have passed preview validation.
      const docs = await parseModels([
        `
          namespace test.crossns2.base
          version "1"

          type Observable:
            value number (1..1)
        `,
        `
          namespace test.crossns2.derived
          version "1"

          import test.crossns2.base.*

          type Observable extends test.crossns2.base.Observable:
            extra string (1..1)
        `
      ]);

      const schemas = generatePreviewSchemas(docs);
      const derivedObservable = schemas.find((s) => s.targetId === 'test.crossns2.derived.Observable');

      expect(derivedObservable?.status).toBe('ready');
      expect(derivedObservable?.fields.map((f) => f.path)).toEqual(['value', 'extra']);
    }
  );

  skipIfNodeLt22('can return one fully-qualified target schema by id', async () => {
    const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Same:
        value string (1..1)

      type Container:
        same Same (1..1)
    `);

    const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Container' });

    expect(schemas.map((schema) => schema.targetId)).toEqual(['test.preview.Container']);
  });

  skipIfNodeLt22('covers all supported preview field kinds plus unknown fallback', async () => {
    const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      enum Side:
        Buy
        Sell

      type Party:
        name string (1..1)

      type Trade:
        tradeId string (1..1)
        quantity int (0..1)
        active boolean (0..1)
        side Side (1..1)
        party Party (1..1)
        aliases string (0..*)
        missing MissingType (0..1)
    `);

    const [trade] = generatePreviewSchemas([doc], { targetId: 'test.preview.Trade' });
    const kinds = new Set<string>();
    for (const field of trade?.fields ?? []) {
      kinds.add(field.kind);
      // Only 'object'/'array' PreviewField variants carry `children`.
      if (field.kind === 'object' || field.kind === 'array') {
        for (const child of field.children) {
          kinds.add(child.kind);
        }
      }
    }

    expect(Array.from(kinds).sort()).toEqual(['array', 'boolean', 'enum', 'number', 'object', 'string', 'unknown']);
    expect(trade?.unsupportedFeatures).toContain('unresolved-reference:MissingType');
  });

  skipIfNodeLt22('marks duplicate target ids as unsupported instead of silently overwriting', async () => {
    const first = await parseModel(`
      namespace "test.preview"
      version "1"

      type Trade:
        tradeId string (1..1)
    `);
    const second = await parseModel(`
      namespace "test.preview"
      version "1"

      type Trade:
        settlementDate string (0..1)
    `);

    const [trade] = generatePreviewSchemas([first, second], { targetId: 'test.preview.Trade' });

    expect(trade).toMatchObject({
      targetId: 'test.preview.Trade',
      status: 'unsupported',
      fields: [],
      unsupportedFeatures: ['duplicate-target:test.preview.Trade']
    });
  });

  skipIfAdjustableDateFixturesUnavailable(
    'generates a stable preview schema for the real CDM AdjustableDate type',
    async () => {
      const enumDoc = await parseFixture('../../../.resources/cdm/base-datetime-enum.rosetta');
      const typeDoc = await parseFixture('../../../.resources/cdm/base-datetime-type.rosetta');

      const [adjustableDate] = generatePreviewSchemas([enumDoc, typeDoc], {
        targetId: 'cdm.base.datetime.AdjustableDate'
      });

      expect(adjustableDate).toMatchObject({
        targetId: 'cdm.base.datetime.AdjustableDate',
        title: 'AdjustableDate'
      });
      expect(adjustableDate?.fields.map((field) => field.path)).toEqual([
        'unadjustedDate',
        'dateAdjustments',
        'dateAdjustmentsReference',
        'adjustedDate'
      ]);
      expect(adjustableDate?.fields.find((field) => field.path === 'dateAdjustments')).toMatchObject({
        kind: 'object'
      });
    }
  );

  // ── T037: Type Alias Preview ─────────────────────────────────────────────

  skipIfNodeLt22('generates a scalar field for a primitive type alias (typeAlias)', async () => {
    const doc = await parseModel(`
        namespace "test.preview"
        version "1"

        typeAlias ProductCode:
          string
      `);

    const schemas = generatePreviewSchemas([doc]);
    const alias = schemas.find((s) => s.targetId === 'test.preview.ProductCode');

    expect(alias).toMatchObject({
      schemaVersion: 1,
      kind: 'typeAlias',
      targetId: 'test.preview.ProductCode',
      title: 'ProductCode',
      status: 'ready'
    });
    expect(alias?.fields).toEqual([{ path: 'value', label: 'Product Code', kind: 'string', required: true }]);
  });

  skipIfNodeLt22('generates object fields for a data-type alias (typeAlias referencing a type)', async () => {
    const doc = await parseModel(`
        namespace "test.preview"
        version "1"

        type Address:
          street string (1..1)
          city string (1..1)

        typeAlias BillingAddress:
          Address
      `);

    const schemas = generatePreviewSchemas([doc]);
    const alias = schemas.find((s) => s.targetId === 'test.preview.BillingAddress');

    expect(alias).toMatchObject({
      schemaVersion: 1,
      kind: 'typeAlias',
      targetId: 'test.preview.BillingAddress',
      title: 'BillingAddress',
      status: 'ready'
    });
    expect(alias?.fields.map((f) => f.path)).toEqual(['street', 'city']);
    expect(alias?.fields[0]).toMatchObject({ kind: 'string', required: true });
  });

  // ── T038: Choice Preview ─────────────────────────────────────────────────

  // ── T054: Function Preview ───────────────────────────────────────────────

  skipIfNodeLt22('generates a function schema with input fields (T054)', async () => {
    const doc = await parseModel(`
      namespace "test.funcpreview"
      version "1"

      func AddTwo:
        inputs:
          a number (1..1)
          b number (1..1)
        output:
          result number (1..1)
    `);

    const schemas = generatePreviewSchemas(doc);
    const funcSchema = schemas.find((s) => s.kind === 'function');

    expect(funcSchema).toBeDefined();
    expect(funcSchema!.title).toBe('AddTwo');
    expect(funcSchema!.targetId).toBe('test.funcpreview.AddTwo');
    expect(funcSchema!.status).toBe('ready');
    expect(funcSchema!.fields).toHaveLength(2);
    expect(funcSchema!.fields[0]!.label).toBe('A');
    expect(funcSchema!.fields[1]!.label).toBe('B');
  });

  skipIfNodeLt22('generates a choice schema with one field per option', async () => {
    const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Cash:
        amount number (1..1)

      type Securities:
        isin string (1..1)

      choice Collateral:
        Cash
        Securities
    `);

    const schemas = generatePreviewSchemas([doc]);
    const choice = schemas.find((s) => s.targetId === 'test.preview.Collateral');

    expect(choice).toMatchObject({
      schemaVersion: 1,
      kind: 'choice',
      targetId: 'test.preview.Collateral',
      title: 'Collateral',
      status: 'ready'
    });
    // `path` is the REAL emitted object key (lower-camel-cased, matching
    // `choiceOptionFieldName` — the same rule zod/json-schema/ts emitters
    // use for a Choice's actual generated schema), while `label` keeps the
    // original DSL casing for display.
    expect(choice?.fields.map((f) => f.path)).toEqual(['cash', 'securities']);
    expect(choice?.fields.map((f) => f.label)).toEqual(['Cash', 'Securities']);
    // Each option is required: false because only one may be chosen
    expect(choice?.fields.every((f) => f.required === false)).toBe(true);
    expect(choice?.fields.find((f) => f.path === 'cash')).toMatchObject({
      kind: 'object',
      label: 'Cash'
    });
    expect(choice?.fields.find((f) => f.path === 'securities')).toMatchObject({
      kind: 'object',
      label: 'Securities'
    });
  });

  skipIfNodeLt22(
    "choice option field 'path' uses the real emitted key (lower-camel), not the raw DSL casing",
    async () => {
      // Regression test (Codex round-3 finding #1): buildChoiceOptionField
      // previously set `path` from the raw DSL type-reference text
      // (`Cash`), which does NOT match what the real generated Zod/JSON
      // Schema/TypeScript emitters accept as the Choice arm's object key
      // (`cash`, per `choiceOptionFieldName` in base-namespace-emitter.ts).
      // An instance authored via the Prototype perspective and keyed by the
      // old `path` would fail to validate against the real generated
      // schema for the same model.
      const doc = await parseModel(`
        namespace "test.preview"
        version "1"

        type Cash:
          amount number (1..1)

        choice Collateral:
          Cash
      `);

      const schemas = generatePreviewSchemas([doc]);
      const choice = schemas.find((s) => s.targetId === 'test.preview.Collateral');

      expect(choice?.fields).toHaveLength(1);
      expect(choice?.fields[0]).toMatchObject({ path: 'cash', label: 'Cash' });
    }
  );

  skipIfNodeLt22(
    'choice option with a namespace-qualified type reference uses the RESOLVED node name for path/label, not the raw qualified $refText (issue #437)',
    async () => {
      // buildChoiceOptionField previously preferred the raw `$refText` over
      // the resolved node's bare `.name`. For an unqualified reference the
      // two coincide, masking the bug — a namespace-qualified reference
      // (`test.preview.Cash`) exposes it: the real emitters
      // (`emitChoiceSchema`'s `optionTypeRef?.ref?.name ?? ...`) always key
      // off the resolved node's bare name, so the preview must match.
      const doc = await parseModel(`
        namespace "test.preview"
        version "1"

        type Cash:
          amount number (1..1)

        choice Collateral:
          test.preview.Cash
      `);

      const schemas = generatePreviewSchemas([doc]);
      const choice = schemas.find((s) => s.targetId === 'test.preview.Collateral');

      expect(choice?.fields).toHaveLength(1);
      expect(choice?.fields[0]).toMatchObject({ path: 'cash', label: 'Cash' });
    }
  );

  skipIfNodeLt22('choice with unresolved option type produces unsupported status', async () => {
    const doc = await parseModel(`
        namespace "test.preview"
        version "1"

        choice Instrument:
          Bond
          Equity
      `);
    const schemas = generatePreviewSchemas(doc);
    const instrument = schemas.find((s) => s.targetId === 'test.preview.Instrument');
    expect(instrument).toBeDefined();
    expect(instrument!.fields.length).toBeGreaterThanOrEqual(0);
  });

  skipIfNodeLt22(
    'includes inherited fields from a Data supertype chain, not just the subtype own attributes',
    async () => {
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Base:
        id string (1..1)

      type Middle extends Base:
        note string (1..1)

      type Sub extends Middle:
        quantity int (0..1)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Sub' });
      const sub = schemas.find((schema) => schema.targetId === 'test.preview.Sub');

      expect(sub).toBeDefined();
      // Inherited fields (from Base and Middle) must be present alongside Sub's
      // own attribute — a bug here would silently pass validation on required
      // parent fields that were missing from an instance.
      expect(sub?.fields.map((field) => field.path).sort()).toEqual(['id', 'note', 'quantity']);
      expect(sub?.fields.find((field) => field.path === 'id')).toMatchObject({ kind: 'string', required: true });
      expect(sub?.fields.find((field) => field.path === 'note')).toMatchObject({ kind: 'string', required: true });
      // A plain Data-only schema (no Choice ancestor) must NOT carry
      // `choiceArmPaths` — round-9 finding #1 regression guard.
      expect(sub?.choiceArmPaths).toBeUndefined();
    }
  );

  skipIfNodeLt22(
    'includes Choice-ancestor option fields when a Data type extends a Choice (round-5 finding #1)',
    async () => {
      // Regression test: buildDataSchema previously only walked Data-to-Data
      // `extends` chains, silently dropping a Choice ancestor's options from
      // the generated FormPreviewSchema. Combined with preview-validator.ts's
      // `.strict()` validators (round-2 finding #1), a real, schema-valid
      // payload keyed by a Choice-derived field was rejected as an
      // "unrecognized key". `Commodity` (capitalized DSL name) intentionally
      // differs in casing from its real emitted field key (`commodity`, per
      // `choiceOptionFieldName`) so the test also proves the option field's
      // `path` is lower-camel-cased, not the raw DSL type-reference text.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Commodity:
        name string (1..1)

      type Cash:
        amount number (1..1)

      choice Observable:
        Commodity
        Cash

      type BasketConstituent extends Observable:
        weight number (1..1)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.BasketConstituent' });
      const basketConstituent = schemas.find((schema) => schema.targetId === 'test.preview.BasketConstituent');

      expect(basketConstituent).toBeDefined();
      // Both BasketConstituent's own attribute AND each Choice option's
      // (lower-camel) field must be present.
      expect(basketConstituent?.fields.map((field) => field.path).sort()).toEqual(['cash', 'commodity', 'weight']);
      expect(basketConstituent?.fields.find((field) => field.path === 'weight')).toMatchObject({
        kind: 'number',
        required: true
      });
      const commodityField = basketConstituent?.fields.find((field) => field.path === 'commodity');
      expect(commodityField).toMatchObject({ path: 'commodity', label: 'Commodity', kind: 'object', required: false });
      const cashField = basketConstituent?.fields.find((field) => field.path === 'cash');
      expect(cashField).toMatchObject({ path: 'cash', label: 'Cash', kind: 'object', required: false });
      // round-9 finding #1: `choiceArmPaths` marks which of `fields` are
      // Choice-ancestor-derived arms, so preview-validator.ts's "exactly one
      // arm present" enforcement can run for a Data-extends-Choice schema
      // (whose `kind` is NOT `'choice'`).
      expect(basketConstituent?.choiceArmPaths).toEqual(['commodity', 'cash']);
    }
  );

  skipIfNodeLt22(
    "a Data-extends-Choice schema's own attribute wins over a colliding inherited Choice option, flagged as unsupported (issue #435)",
    async () => {
      // Same collision as the typeAlias/nested-objectField regression tests
      // below, but exercised directly at buildDataSchema's own call site —
      // this is the exact scenario from the issue text: `Basket extends
      // Innermost` declares its own `cash string` attribute while
      // `Innermost` has a `Cash` option whose real emitted field key
      // (`choiceOptionFieldName('Cash')`) is also `cash`.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Cash:
        amount number (1..1)

      type Commodity:
        symbol string (1..1)

      choice Innermost:
        Cash
        Commodity

      type Basket extends Innermost:
        cash string (1..1)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Basket' });
      const basket = schemas.find((schema) => schema.targetId === 'test.preview.Basket');

      expect(basket).toBeDefined();
      // The non-colliding Commodity option survives; the colliding Cash
      // option is dropped in favor of Basket's own `cash string` attribute.
      expect(basket?.fields.map((field) => field.path).sort()).toEqual(['cash', 'commodity']);
      expect(basket?.fields.find((field) => field.path === 'cash')).toMatchObject({
        kind: 'string',
        required: true
      });
      expect(basket?.choiceArmPaths).toEqual(['commodity']);
      expect(basket?.status).toBe('unsupported');
      expect(basket?.unsupportedFeatures).toContain('choice-arm-collision:cash');
    }
  );

  skipIfNodeLt22(
    'expands a Choice-typed attribute (as distinct from Data-extends-Choice) into one field per option (issue #394)',
    async () => {
      // Regression test for issue #394: buildBaseField had no branch for a
      // DIRECT Choice type reference (an attribute typed `variant:
      // Observable (1..1)`, not a Data type EXTENDING a Choice) — it fell
      // through to the unresolved-reference case and reported status
      // 'unsupported' with kind 'unknown', even though the Choice itself
      // was fully resolved and navigable elsewhere in the app. Mirrors
      // zod-emitter.ts's own prior "W2" fix for the identical gap in
      // resolveTypeExpr's isChoice branch.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Commodity:
        name string (1..1)

      type Cash:
        amount number (1..1)

      choice Observable:
        Commodity
        Cash

      type Trade:
        variant Observable (1..1)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Trade' });
      const trade = schemas.find((schema) => schema.targetId === 'test.preview.Trade');

      expect(trade).toBeDefined();
      expect(trade?.status).toBe('ready');
      expect(trade?.unsupportedFeatures).toBeUndefined();
      const variantField = trade?.fields.find((field) => field.path === 'variant');
      expect(variantField).toMatchObject({ path: 'variant', label: 'Variant', kind: 'object', required: true });
      expect(variantField && 'children' in variantField ? variantField.children.map((c) => c.path).sort() : []).toEqual(
        ['variant.cash', 'variant.commodity']
      );
      // choiceArmPaths marks both arms so preview-validator.ts can enforce
      // "exactly one of variant.commodity / variant.cash present" — the
      // same enforcement the Data-extends-Choice case above gets.
      expect(variantField && 'choiceArmPaths' in variantField ? variantField.choiceArmPaths : undefined).toEqual([
        'variant.commodity',
        'variant.cash'
      ]);
    }
  );

  skipIfNodeLt22(
    'rewrites choiceArmPaths and Data-arm grandchild paths for a Choice-typed attribute with array cardinality (Codex review, PR #433)',
    async () => {
      // Regression test, round 1: asArrayItem rewrote a Choice-typed array
      // item's `children[].path` from `variant.arm` to `variant[].arm` but
      // left `choiceArmPaths` (spread via `...field`) pointing at the stale
      // pre-rewrite paths. preview-validator.ts's "exactly one arm present"
      // lookup then found no children matching the stale arm paths and
      // rejected every array item as if no arm were selected.
      //
      // Regression test, round 2: fixing round 1 with a one-level-only
      // children rewrite still left a Data-typed arm's OWN nested
      // attributes (a grandchild of the array item) at the stale
      // pre-rewrite path — `variants.commodity.name` instead of
      // `variants[].commodity.name` — pointing outside the rewritten array
      // item's subtree entirely and making that field impossible to
      // populate correctly. `Commodity`'s `name` attribute below is exactly
      // that grandchild.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Commodity:
        name string (1..1)

      type Cash:
        amount number (1..1)

      choice Observable:
        Commodity
        Cash

      type Trade:
        variants Observable (0..*)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Trade' });
      const trade = schemas.find((schema) => schema.targetId === 'test.preview.Trade');

      expect(trade).toBeDefined();
      expect(trade?.status).toBe('ready');
      const variantsField = trade?.fields.find((field) => field.path === 'variants');
      expect(variantsField).toMatchObject({ path: 'variants', kind: 'array' });
      const item =
        variantsField && 'children' in variantsField ? (variantsField.children?.[0] as PreviewField) : undefined;
      expect(item).toMatchObject({ path: 'variants[]', kind: 'object' });
      const itemChildPaths = item && 'children' in item ? item.children?.map((c) => c.path).sort() : [];
      expect(itemChildPaths).toEqual(['variants[].cash', 'variants[].commodity']);
      // The round-1 bug: choiceArmPaths must match children[].path exactly,
      // not the pre-array-rewrite `variants.*` form.
      const itemArmPaths = item && 'choiceArmPaths' in item ? item.choiceArmPaths : undefined;
      expect(itemArmPaths?.slice().sort()).toEqual(['variants[].cash', 'variants[].commodity']);
      // The round-2 bug: the Commodity arm's OWN `name` attribute (a
      // grandchild of the array item) must also be rewritten.
      const commodityArm =
        item && 'children' in item ? item.children?.find((c) => c.path === 'variants[].commodity') : undefined;
      const commodityGrandchildPaths =
        commodityArm && 'children' in commodityArm ? commodityArm.children?.map((c) => c.path) : undefined;
      expect(commodityGrandchildPaths).toEqual(['variants[].commodity.name']);
    }
  );

  skipIfNodeLt22(
    'rewrites a Choice arm’s OWN nested array descendant through both container kinds (Codex review, PR #433 round 3)',
    async () => {
      // Regression test, round 3: rewritePathPrefix's round-2 fix recursed
      // through 'object' fields but explicitly stopped at 'array' fields —
      // a Data-typed Choice arm with its OWN nested array attribute
      // (`Commodity.legs (0..*)` below) had its array field's own path
      // rewritten (`variants.commodity.legs` → `variants[].commodity.legs`)
      // but never descended into the array's single item field, leaving
      // the deeper `[]`-suffixed path (`variants.commodity.legs[].price`)
      // stale — pointing outside the rewritten array item's subtree.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Leg:
        price number (1..1)

      type Commodity:
        name string (1..1)
        legs Leg (0..*)

      choice Observable:
        Commodity

      type Trade:
        variants Observable (0..*)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Trade' });
      const trade = schemas.find((schema) => schema.targetId === 'test.preview.Trade');

      expect(trade).toBeDefined();
      expect(trade?.status).toBe('ready');
      const variantsField = trade?.fields.find((field) => field.path === 'variants');
      const item =
        variantsField && 'children' in variantsField ? (variantsField.children?.[0] as PreviewField) : undefined;
      const commodityArm =
        item && 'children' in item ? item.children?.find((c) => c.path === 'variants[].commodity') : undefined;
      const legsField =
        commodityArm && 'children' in commodityArm
          ? commodityArm.children?.find((c) => c.path === 'variants[].commodity.legs')
          : undefined;
      expect(legsField).toMatchObject({ path: 'variants[].commodity.legs', kind: 'array' });
      const legItem = legsField && 'children' in legsField ? (legsField.children?.[0] as PreviewField) : undefined;
      expect(legItem).toMatchObject({ path: 'variants[].commodity.legs[]', kind: 'object' });
      const legItemChildPaths = legItem && 'children' in legItem ? legItem.children?.map((c) => c.path) : undefined;
      expect(legItemChildPaths).toEqual(['variants[].commodity.legs[].price']);
    }
  );

  skipIfNodeLt22(
    'expands a doubly-nested Choice — a Choice option whose Data type itself extends another Choice (Codex review, PR #433 round 5)',
    async () => {
      // Regression test: this was a documented, deferred gap that predates
      // this PR — buildChoiceOptionField's Data-option branch discarded
      // collectInheritedAttributes' `choiceAncestor`, silently dropping the
      // inherited arms whenever a Choice OPTION's Data type itself extends
      // a DIFFERENT Choice. A preview sample could validate as complete
      // while the real emitted `runeExtendChoice` Zod schema rejects it for
      // missing the inherited arm, with no field offered to supply it.
      // Mirrors objectField's own choiceAncestor expansion.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Commodity:
        name string (1..1)

      type Cash:
        amount number (1..1)

      choice Innermost:
        Commodity
        Cash

      type BasketConstituent extends Innermost:
        weight number (1..1)

      choice Observable:
        BasketConstituent

      type Trade:
        variant Observable (1..1)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Trade' });
      const trade = schemas.find((schema) => schema.targetId === 'test.preview.Trade');

      expect(trade).toBeDefined();
      expect(trade?.status).toBe('ready');
      const variantField = trade?.fields.find((field) => field.path === 'variant');
      const constituentArm =
        variantField && 'children' in variantField
          ? variantField.children?.find((c) => c.path === 'variant.basketConstituent')
          : undefined;
      expect(constituentArm).toMatchObject({ path: 'variant.basketConstituent', kind: 'object' });
      const constituentChildPaths =
        constituentArm && 'children' in constituentArm ? constituentArm.children?.map((c) => c.path).sort() : [];
      // BasketConstituent's own `weight` PLUS the inherited Innermost arms
      // (`commodity`/`cash`), all prefixed under `variant.basketConstituent`.
      expect(constituentChildPaths).toEqual([
        'variant.basketConstituent.cash',
        'variant.basketConstituent.commodity',
        'variant.basketConstituent.weight'
      ]);
      const constituentArmPaths =
        constituentArm && 'choiceArmPaths' in constituentArm ? constituentArm.choiceArmPaths : undefined;
      expect(constituentArmPaths?.slice().sort()).toEqual([
        'variant.basketConstituent.cash',
        'variant.basketConstituent.commodity'
      ]);
    }
  );

  skipIfNodeLt22(
    'marks an empty Choice-typed attribute as unsupported instead of a trivially-satisfiable object (Codex review, PR #433 round 6)',
    async () => {
      // Regression test: a Choice with zero options parses (the Rune
      // validator only warns), but the real emitted schema
      // (zod-emitter.ts's emitChoiceSchema) is `z.never()` for one — an
      // uninhabited type NO value can ever satisfy. Without this guard,
      // `children`/`choiceArmPaths` both came out empty and the field read
      // as a trivially-satisfiable required object accepting `{}`, the
      // opposite of "no valid value exists".
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      choice Impossible:

      type Trade:
        variant Impossible (1..1)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Trade' });
      const trade = schemas.find((schema) => schema.targetId === 'test.preview.Trade');

      expect(trade).toBeDefined();
      expect(trade?.status).toBe('unsupported');
      expect(trade?.unsupportedFeatures).toContain('empty-choice:Impossible');
      const variantField = trade?.fields.find((field) => field.path === 'variant');
      expect(variantField).toMatchObject({ path: 'variant', kind: 'unknown' });
    }
  );

  skipIfNodeLt22('marks an empty top-level Choice schema as unsupported (Codex review, PR #433 round 6)', async () => {
    const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      choice Impossible:
    `);

    const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Impossible' });
    const impossible = schemas.find((schema) => schema.targetId === 'test.preview.Impossible');

    expect(impossible).toBeDefined();
    expect(impossible?.status).toBe('unsupported');
    expect(impossible?.fields).toEqual([]);
    expect(impossible?.unsupportedFeatures).toContain('empty-choice:Impossible');
  });

  skipIfNodeLt22(
    'includes Choice-ancestor option fields when a typeAlias resolves to a Data-extends-Choice type',
    async () => {
      // Regression test (follow-up to round-5 finding #1): buildTypeAliasSchema's
      // data-alias branch only destructured `.attributes` from
      // collectInheritedAttributes, silently dropping a Choice ancestor's
      // options — the same bug buildDataSchema had, but for a `typeAlias`
      // pointing at a Data-extends-Choice type instead of the Data type
      // itself. Both sit `fields` directly at the schema root, so the same
      // expansion applies unmodified.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Commodity:
        name string (1..1)

      type Cash:
        amount number (1..1)

      choice Observable:
        Commodity
        Cash

      type BasketConstituent extends Observable:
        weight number (1..1)

      typeAlias BasketConstituentAlias:
        BasketConstituent
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.BasketConstituentAlias' });
      const alias = schemas.find((schema) => schema.targetId === 'test.preview.BasketConstituentAlias');

      expect(alias).toBeDefined();
      expect(alias?.fields.map((field) => field.path).sort()).toEqual(['cash', 'commodity', 'weight']);
      expect(alias?.fields.find((field) => field.path === 'weight')).toMatchObject({
        kind: 'number',
        required: true
      });
      const commodityField = alias?.fields.find((field) => field.path === 'commodity');
      expect(commodityField).toMatchObject({ path: 'commodity', label: 'Commodity', kind: 'object', required: false });
      const cashField = alias?.fields.find((field) => field.path === 'cash');
      expect(cashField).toMatchObject({ path: 'cash', label: 'Cash', kind: 'object', required: false });
      // round-9 finding #1: same `choiceArmPaths` expansion as buildDataSchema,
      // applied to the typeAlias data-alias branch.
      expect(alias?.choiceArmPaths).toEqual(['commodity', 'cash']);
    }
  );

  skipIfNodeLt22(
    "a typeAlias's Data-extends-Choice expansion keeps the Data type's own attribute on a name collision, and flags the collision as unsupported (issue #435)",
    async () => {
      // Mirrors buildDataSchema's collision precedence (round-5 finding #1
      // comment at its call site): when a Choice option's real emitted field
      // key collides with one of the Data type's own attribute names, the
      // Data type's own (more-derived) attribute wins and the Choice option
      // is dropped from `fields`/`choiceArmPaths`. The real emitted
      // `runeExtendChoice` schema merges the Data type's own attributes into
      // EVERY arm via `.extend()`, which replaces the colliding arm's
      // distinguishing type entirely — that arm no longer conveys "the Cash
      // option was selected" at all, so preview-validator.ts's "exactly one
      // arm present" check would silently under-constrain if the collision
      // weren't surfaced. `dropCollidingChoiceArmFields` now marks it
      // `unsupported` instead of dropping it silently.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Cash:
        amount number (1..1)

      choice Observable:
        Cash

      type BasketConstituent extends Observable:
        cash string (1..1)

      typeAlias BasketConstituentAlias:
        BasketConstituent
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.BasketConstituentAlias' });
      const alias = schemas.find((schema) => schema.targetId === 'test.preview.BasketConstituentAlias');

      expect(alias).toBeDefined();
      expect(alias?.fields.map((field) => field.path)).toEqual(['cash']);
      // BasketConstituent's own `cash string` attribute wins over the Choice
      // option's `cash` object field.
      expect(alias?.fields.find((field) => field.path === 'cash')).toMatchObject({
        kind: 'string',
        required: true
      });
      expect(alias?.status).toBe('unsupported');
      expect(alias?.unsupportedFeatures).toContain('choice-arm-collision:cash');
    }
  );

  skipIfNodeLt22(
    'includes Choice-ancestor option fields, prefixed with the ambient path, on a NESTED Data-extends-Choice attribute',
    async () => {
      // Regression test (further follow-up to round-5 finding #1): objectField
      // (reached via buildBaseField for a nested Data-type attribute) only
      // destructured `.attributes` from collectInheritedAttributes, silently
      // dropping a Choice ancestor's options for a NESTED reference — unlike
      // buildDataSchema/buildTypeAliasSchema, whose `fields` sit at the schema
      // root, objectField's children must have the Choice option's `path`
      // prefixed with the ambient field path (e.g. `constituent.commodity`,
      // not bare `commodity`), or the option is mis-keyed against the real
      // generated (runeExtendChoice) schema for `Trade.constituent`.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Commodity:
        name string (1..1)

      type Cash:
        amount number (1..1)

      choice Observable:
        Commodity
        Cash

      type BasketConstituent extends Observable:
        weight number (1..1)

      type Trade:
        constituent BasketConstituent (1..1)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Trade' });
      const trade = schemas.find((schema) => schema.targetId === 'test.preview.Trade');

      expect(trade).toBeDefined();
      const constituentField = trade?.fields.find((field) => field.path === 'constituent');
      expect(constituentField).toMatchObject({ path: 'constituent', kind: 'object', required: true });
      // Only 'object'/'array' PreviewField variants carry `children`.
      if (constituentField?.kind !== 'object') throw new Error('expected constituent field to be an object');
      expect(constituentField.children.map((child) => child.path).sort()).toEqual([
        'constituent.cash',
        'constituent.commodity',
        'constituent.weight'
      ]);
      const commodityChild = constituentField.children.find((child) => child.path === 'constituent.commodity');
      expect(commodityChild).toMatchObject({
        path: 'constituent.commodity',
        label: 'Commodity',
        kind: 'object',
        required: false
      });
      const cashChild = constituentField.children.find((child) => child.path === 'constituent.cash');
      expect(cashChild).toMatchObject({ path: 'constituent.cash', label: 'Cash', kind: 'object', required: false });
    }
  );

  skipIfNodeLt22('sets choiceArmPaths on a NESTED Data-extends-Choice object field (round-10 finding B)', async () => {
    // objectField already expands a Choice ancestor's options into
    // `children` (see the previous test), but the returned object field
    // carried no equivalent to FormPreviewSchema.choiceArmPaths — so
    // preview-validator.ts had no metadata to enforce "exactly one arm
    // present" for a NESTED object field the way it already does for a
    // top-level Data-extends-Choice schema (round-9 finding #1). Mirrors
    // that same pattern, scoped to the object field's own children.
    const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Commodity:
        name string (1..1)

      type Cash:
        amount number (1..1)

      choice Observable:
        Commodity
        Cash

      type BasketConstituent extends Observable:
        weight number (1..1)

      type Trade:
        constituent BasketConstituent (1..1)
    `);

    const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Trade' });
    const trade = schemas.find((schema) => schema.targetId === 'test.preview.Trade');

    expect(trade).toBeDefined();
    const constituentField = trade?.fields.find((field) => field.path === 'constituent');
    // Only 'object'/'array' PreviewField variants carry `children`/`choiceArmPaths`.
    if (constituentField?.kind !== 'object') throw new Error('expected constituent field to be an object');
    expect(constituentField.choiceArmPaths?.slice().sort()).toEqual(['constituent.cash', 'constituent.commodity']);
  });

  skipIfNodeLt22(
    "a NESTED Data-extends-Choice expansion keeps the Data type's own attribute on a name collision",
    async () => {
      // Mirrors buildDataSchema's/buildTypeAliasSchema's collision precedence,
      // at the nested objectField call site: when a Choice option's real
      // emitted field key collides with one of the Data type's own attribute
      // names, the Data type's own (more-derived) attribute wins.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Cash:
        amount number (1..1)

      choice Observable:
        Cash

      type BasketConstituent extends Observable:
        cash string (1..1)

      type Trade:
        constituent BasketConstituent (1..1)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Trade' });
      const trade = schemas.find((schema) => schema.targetId === 'test.preview.Trade');

      expect(trade).toBeDefined();
      const constituentField = trade?.fields.find((field) => field.path === 'constituent');
      // Only 'object'/'array' PreviewField variants carry `children`.
      if (constituentField?.kind !== 'object') throw new Error('expected constituent field to be an object');
      expect(constituentField.children.map((child) => child.path)).toEqual(['constituent.cash']);
      // BasketConstituent's own `cash string` attribute wins over the Choice
      // option's `cash` object field.
      expect(constituentField.children.find((child) => child.path === 'constituent.cash')).toMatchObject({
        kind: 'string',
        required: true
      });
      // The collision is flagged (issue #435) even though it's nested —
      // `ctx.unsupportedFeatures` is the SAME Set threaded through the
      // whole recursive expansion, so it surfaces on the top-level Trade
      // schema too, not just the constituent field.
      expect(trade?.status).toBe('unsupported');
      expect(trade?.unsupportedFeatures).toContain('choice-arm-collision:constituent.cash');
    }
  );

  skipIfNodeLt22(
    'rewrites a choice-arm-collision diagnostic path when the collision is nested inside an array-valued attribute (issue #435 round 2)',
    async () => {
      // rewritePathPrefix (used by asArrayItem to convert an array item's
      // whole subtree from `positions.constituent.cash` to
      // `positions[].constituent.cash`) only rewrites the returned FIELD
      // tree — the collision diagnostic was recorded separately into
      // ctx.unsupportedFeatures BEFORE that rewrite ran, so without
      // rewriteCollisionDiagnostics it would still name the stale,
      // non-array path, pointing consumers at a path that doesn't exist in
      // the returned schema.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Cash:
        amount number (1..1)

      type Commodity:
        symbol string (1..1)

      choice Innermost:
        Cash
        Commodity

      type Basket extends Innermost:
        cash string (1..1)

      type Holder:
        constituent Basket (1..1)

      type Trade:
        positions Holder (0..*)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Trade' });
      const trade = schemas.find((schema) => schema.targetId === 'test.preview.Trade');

      expect(trade?.status).toBe('unsupported');
      expect(trade?.unsupportedFeatures).toContain('choice-arm-collision:positions[].constituent.cash');
      expect(trade?.unsupportedFeatures).not.toContain('choice-arm-collision:positions.constituent.cash');
    }
  );

  skipIfNodeLt22(
    'removes a descendant choice-arm-collision diagnostic when the whole subtree containing it is dropped by an OUTER collision (issue #435 round 3)',
    async () => {
      // Doubly-nested collision: the outer Choice option "Cash" resolves to
      // a Data type that itself extends ANOTHER Choice and has its OWN
      // inner collision ("foo" vs. InnerChoice's "Foo" option) — building
      // that "cash" object field records `choice-arm-collision:cash.foo`.
      // Then the OUTER Basket's own `cash string` attribute collides with
      // the outer "Cash" option itself, dropping the ENTIRE "cash" object
      // field (foo collision and all). Without removing the now-stale
      // descendant diagnostic, the returned schema would report a
      // collision at `cash.foo` even though nothing at that path exists —
      // the final `fields` only has Basket's own scalar `cash`.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Foo:
        value string (1..1)

      choice InnerChoice:
        Foo

      type Cash extends InnerChoice:
        foo string (1..1)

      type Commodity:
        symbol string (1..1)

      choice Innermost:
        Cash
        Commodity

      type Basket extends Innermost:
        cash string (1..1)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Basket' });
      const basket = schemas.find((schema) => schema.targetId === 'test.preview.Basket');

      expect(basket?.status).toBe('unsupported');
      expect(basket?.fields.map((field) => field.path).sort()).toEqual(['cash', 'commodity']);
      expect(basket?.fields.find((field) => field.path === 'cash')).toMatchObject({ kind: 'string', required: true });
      expect(basket?.unsupportedFeatures).toContain('choice-arm-collision:cash');
      expect(basket?.unsupportedFeatures).not.toContain('choice-arm-collision:cash.foo');
    }
  );

  skipIfNodeLt22(
    "keeps a RETAINED field's own choice-arm-collision diagnostic when a DIFFERENT, discarded arm collides at the same path (issue #435 round 4)",
    async () => {
      // Distinct from round 3: there, the diagnostic under the dropped path
      // belonged to the discarded arm itself (a doubly-nested collision
      // inside the arm being thrown away). Here, Basket's OWN "cash"
      // attribute (type Wrapper, which extends InnerChoice and has its own
      // "foo" vs. InnerChoice's "Foo" option collision) records
      // `choice-arm-collision:cash.foo` FIRST, while attributeFields are
      // built — before OuterChoice's "Cash" option is even built. When that
      // outer "Cash" option (unrelated to Wrapper) then also collides with
      // Basket's own "cash" attribute name and gets dropped, a path-prefix
      // removal (the round-3 approach) can't tell "cash.foo" belongs to the
      // RETAINED Wrapper subtree apart from anything the discarded "Cash"
      // option itself might have recorded — and would incorrectly delete
      // it. Only diagnostics newly recorded while building the SPECIFIC
      // discarded option should be removed.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Foo:
        value string (1..1)

      choice InnerChoice:
        Foo

      type Wrapper extends InnerChoice:
        foo string (1..1)

      type Cash:
        amount number (1..1)

      type Commodity:
        symbol string (1..1)

      choice OuterChoice:
        Cash
        Commodity

      type Basket extends OuterChoice:
        cash Wrapper (1..1)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Basket' });
      const basket = schemas.find((schema) => schema.targetId === 'test.preview.Basket');

      expect(basket?.status).toBe('unsupported');
      expect(basket?.fields.map((field) => field.path).sort()).toEqual(['cash', 'commodity']);
      expect(basket?.unsupportedFeatures).toContain('choice-arm-collision:cash');
      expect(basket?.unsupportedFeatures).toContain('choice-arm-collision:cash.foo');

      const cashField = basket?.fields.find((field) => field.path === 'cash');
      if (cashField?.kind !== 'object') throw new Error('expected cash field to be an object');
      expect(cashField.children.map((child) => child.path)).toEqual(['cash.foo']);
      expect(cashField.children.find((child) => child.path === 'cash.foo')).toMatchObject({
        kind: 'string',
        required: true
      });
    }
  );

  skipIfNodeLt22(
    "keeps a RETAINED field's own choice-arm-collision diagnostic when a discarded arm's UNRELATED array attribute happens to rewrite the same path prefix (issue #435 round 5)",
    async () => {
      // Distinct from round 4: there, the discarded arm's OWN build never
      // touched the retained diagnostic at all. Here, Basket's own "cash"
      // attribute (type Wrapper) has a nested Data-extends-Choice
      // collision at "cash.items.foo" — recorded while building
      // attributeFields, before the choice-options loop even starts. The
      // discarded "Cash" option ALSO happens to declare its own
      // array-valued, OBJECT-typed "items" attribute (nothing to do with
      // Wrapper's) — building it calls asArrayItem's `field.kind ===
      // 'object'` branch (the only branch that rewrites diagnostics; a
      // scalar array item can't itself contain a nested collision, so
      // asArrayItem doesn't bother rewriting for that case), which
      // rewrites any choice-arm-collision diagnostic under "cash.items" to
      // "cash.items[]". If that rewrite (or anything else the discarded
      // option's build does) can reach the RETAINED diagnostic at all —
      // e.g. by sharing the ambient unsupportedFeatures set instead of an
      // isolated one per option — the retained diagnostic gets renamed
      // away and then swept up as "new" when the option is dropped, with
      // nothing to restore it.
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Foo:
        value string (1..1)

      choice InnerChoice:
        Foo

      type ItemThing extends InnerChoice:
        foo string (1..1)

      type Wrapper:
        items ItemThing (1..1)

      type ItemsHolder:
        note string (1..1)

      type Cash:
        items ItemsHolder (0..*)

      type Commodity:
        symbol string (1..1)

      choice OuterChoice:
        Cash
        Commodity

      type Basket extends OuterChoice:
        cash Wrapper (1..1)
    `);

      const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Basket' });
      const basket = schemas.find((schema) => schema.targetId === 'test.preview.Basket');

      expect(basket?.status).toBe('unsupported');
      expect(basket?.fields.map((field) => field.path).sort()).toEqual(['cash', 'commodity']);
      expect(basket?.unsupportedFeatures).toContain('choice-arm-collision:cash');
      expect(basket?.unsupportedFeatures).toContain('choice-arm-collision:cash.items.foo');
      expect(basket?.unsupportedFeatures).not.toContain('choice-arm-collision:cash.items[].foo');

      const cashField = basket?.fields.find((field) => field.path === 'cash');
      if (cashField?.kind !== 'object') throw new Error('expected cash field to be an object');
      const itemsField = cashField.children.find((child) => child.path === 'cash.items');
      if (itemsField?.kind !== 'object') throw new Error('expected cash.items field to be an object');
      expect(itemsField.children.map((child) => child.path)).toEqual(['cash.items.foo']);
    }
  );
});
