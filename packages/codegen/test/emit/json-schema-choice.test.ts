// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * JSON Schema emitter — Choice emission (item 1 of docs/superpowers/specs/
 * 2026-07-02-emitter-crossns-hardening-design.md).
 *
 * The JSON Schema emitter never implemented `emitChoice` — any reference to
 * a Choice type (an attribute typed by one, or a `Data extends Choice`
 * supertype) emitted a dangling `$ref: #/$defs/<Choice>`. This suite pins
 * the fix with real ajv validation (draft 2020-12), mirroring the SAME five
 * behavior cases zod-data-extends-choice.test.ts already locks in for the
 * zod target: single option + extras passes; multi-option fails;
 * extras-only fails; extras validate their own schema; unknown keys
 * rejected.
 */

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { walkNamespace } from '../../src/emit/namespace-walker.js';
import { emitNamespace } from '../../src/emit/json-schema-emitter.js';

async function parseSource(source: string, uri = 'inmemory:///model.rosetta') {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse(uri));
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  expect(doc.parseResult.parserErrors, 'fixture must parse without errors').toHaveLength(0);
  return doc;
}

const CHOICE_ONLY = `
namespace test.jsonSchemaChoice
version "0.0.0"

type Cash:
    amount number (0..1)

type Commodity:
    quantity number (0..1)

choice Asset:
    Cash
    Commodity
`;

const DATA_EXTENDS_CHOICE = `
namespace test.jsonSchemaChoiceExtends
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
`;

const MULTI_LEVEL = `
namespace test.jsonSchemaChoiceMultilevel
version "0.0.0"

type Cash:
    amount number (0..1)

type Commodity:
    quantity number (0..1)

choice Asset:
    Cash
    Commodity

type ObservableItem extends Asset:
    identifier string (0..1)

type BasketConstituent extends ObservableItem:
    weight number (0..1)
`;

describe('json-schema-emitter — plain Choice emission', () => {
  it('emits a $defs entry for the Choice', async () => {
    const doc = await parseSource(CHOICE_ONLY);
    const model = walkNamespace([doc], 'test.jsonSchemaChoice');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const defs = schema['$defs'] as Record<string, unknown>;
    expect(defs['Asset']).toBeDefined();
  });

  it('the emitted schema itself is valid JSON Schema 2020-12', async () => {
    const doc = await parseSource(CHOICE_ONLY);
    const model = walkNamespace([doc], 'test.jsonSchemaChoice');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    expect(ajv.validateSchema(schema), JSON.stringify(ajv.errors)).toBe(true);
  });

  it('ajv: exactly one option key present -> VALID ({cash: ...})', async () => {
    const doc = await parseSource(CHOICE_ONLY);
    const model = walkNamespace([doc], 'test.jsonSchemaChoice');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/Asset' });
    expect(validate({ cash: { amount: 5 } }), JSON.stringify(validate.errors)).toBe(true);
  });

  it('ajv: both option keys present -> INVALID ({cash, commodity})', async () => {
    const doc = await parseSource(CHOICE_ONLY);
    const model = walkNamespace([doc], 'test.jsonSchemaChoice');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/Asset' });
    expect(validate({ cash: { amount: 5 }, commodity: { quantity: 1 } })).toBe(false);
  });

  it('ajv: no option key present -> INVALID ({})', async () => {
    const doc = await parseSource(CHOICE_ONLY);
    const model = walkNamespace([doc], 'test.jsonSchemaChoice');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/Asset' });
    expect(validate({})).toBe(false);
  });
});

describe('json-schema-emitter — Data extends Choice', () => {
  it('derives the child def from the Choice $defs entry (never statically decomposed)', async () => {
    const doc = await parseSource(DATA_EXTENDS_CHOICE);
    const model = walkNamespace([doc], 'test.jsonSchemaChoiceExtends');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const defs = schema['$defs'] as Record<string, unknown>;
    const child = defs['BasketConstituent'] as Record<string, unknown>;
    // Derivation, not decomposition: the child def must reference the
    // Choice's $defs entry (an allOf branch or equivalent $ref), not a
    // hand-unrolled union of {cash:...}|{commodity:...} arms.
    expect(JSON.stringify(child)).toContain('#/$defs/Asset');
  });

  it('case 1: single option (not forbidden) + own extras -> VALID', async () => {
    const doc = await parseSource(DATA_EXTENDS_CHOICE);
    const model = walkNamespace([doc], 'test.jsonSchemaChoiceExtends');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/BasketConstituent' });
    const result = validate({ commodity: { quantity: 1 }, weight: 2 });
    expect(result, JSON.stringify(validate.errors)).toBe(true);
  });

  it('case 2: multiple option keys present -> INVALID (exactly-one-of structurally enforced)', async () => {
    const doc = await parseSource(DATA_EXTENDS_CHOICE);
    const model = walkNamespace([doc], 'test.jsonSchemaChoiceExtends');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/BasketConstituent' });
    const result = validate({ cash: { amount: 5 }, commodity: { quantity: 1 }, weight: 2 });
    expect(result).toBe(false);
  });

  it('case 3: extras only, no option key -> INVALID', async () => {
    const doc = await parseSource(DATA_EXTENDS_CHOICE);
    const model = walkNamespace([doc], 'test.jsonSchemaChoiceExtends');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/BasketConstituent' });
    const result = validate({ weight: 2 });
    expect(result).toBe(false);
  });

  it('case 4: extras validate per their own schema (wrong type) -> INVALID', async () => {
    const doc = await parseSource(DATA_EXTENDS_CHOICE);
    const model = walkNamespace([doc], 'test.jsonSchemaChoiceExtends');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/BasketConstituent' });
    const result = validate({ commodity: { quantity: 1 }, weight: 'not-a-number' });
    expect(result).toBe(false);
  });

  it('case 5: unknown key -> INVALID (strictness preserved through derivation)', async () => {
    const doc = await parseSource(DATA_EXTENDS_CHOICE);
    const model = walkNamespace([doc], 'test.jsonSchemaChoiceExtends');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/BasketConstituent' });
    const result = validate({ commodity: { quantity: 1 }, weight: 2, bogus: 'x' });
    expect(result).toBe(false);
  });

  it('the emitted schema itself is valid JSON Schema 2020-12', async () => {
    const doc = await parseSource(DATA_EXTENDS_CHOICE);
    const model = walkNamespace([doc], 'test.jsonSchemaChoiceExtends');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    expect(ajv.validateSchema(schema), JSON.stringify(ajv.errors)).toBe(true);
  });
});

describe('json-schema-emitter — multi-level Data extends Data extends Choice', () => {
  it('resolves the chain through the intermediate Data to the Choice ancestor', async () => {
    const doc = await parseSource(MULTI_LEVEL);
    const model = walkNamespace([doc], 'test.jsonSchemaChoiceMultilevel');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile({ ...schema, $ref: '#/$defs/BasketConstituent' });

    // One option + intermediate's own attr + leaf's own attr -> valid.
    expect(
      validate({ commodity: { quantity: 1 }, identifier: 'abc', weight: 2 }),
      JSON.stringify(validate.errors)
    ).toBe(true);
    // No option key -> invalid (exactly-one-of preserved through the chain).
    expect(validate({ identifier: 'abc', weight: 2 })).toBe(false);
    // Two option keys -> invalid.
    expect(validate({ cash: { amount: 1 }, commodity: { quantity: 1 }, identifier: 'abc', weight: 2 })).toBe(false);
  });

  it('the emitted schema itself is valid JSON Schema 2020-12', async () => {
    const doc = await parseSource(MULTI_LEVEL);
    const model = walkNamespace([doc], 'test.jsonSchemaChoiceMultilevel');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as Record<string, unknown>;
    const ajv = new Ajv({ strict: false });
    expect(ajv.validateSchema(schema), JSON.stringify(ajv.errors)).toBe(true);
  });
});
