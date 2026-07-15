// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generatePreviewSchemas } from '../src/export.js';

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
    "a typeAlias's Data-extends-Choice expansion keeps the Data type's own attribute on a name collision",
    async () => {
      // Mirrors buildDataSchema's collision precedence (round-5 finding #1
      // comment at its call site): when a Choice option's real emitted field
      // key collides with one of the Data type's own attribute names, the
      // Data type's own (more-derived) attribute wins and the Choice option
      // is dropped rather than overwriting it.
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
    }
  );
});
