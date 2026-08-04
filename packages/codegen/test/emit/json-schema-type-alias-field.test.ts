// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * unified-type-reference-resolution Task 5 — json-schema-emitter's
 * `resolveItemSchema` now delegates to the shared `resolveTypeCallTarget`
 * resolver (type-ref-resolver.ts, Task 1), which transparently chases
 * `RosettaTypeAlias` chains. Before this migration, an ATTRIBUTE typed
 * directly by a type alias fell through every isRosettaBasicType/
 * isRosettaEnumeration/isData/isChoice branch in the hand-rolled chain and
 * landed on the generic "Unknown type reference kind" diagnostic, emitting
 * `{}` instead of the alias's real underlying schema — this file is the
 * regression guard for that specific integration point (mirrors
 * zod-type-alias-field.test.ts, Task 3's sibling for the Zod target).
 */

import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, it, expect } from 'vitest';
import { walkNamespace } from '../../src/emit/namespace-walker.js';
import { emitNamespace } from '../../src/emit/json-schema-emitter.js';

async function parseSource(source: string, uri = 'inmemory:///model.rosetta') {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse(uri));
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  const model = doc.parseResult?.value;
  if (!model || !isRosettaModel(model)) {
    throw new Error('expected a RosettaModel');
  }
  return doc;
}

describe('json-schema-emitter — attribute typed via a type-alias reference', () => {
  it('resolves a field typed via a type-alias-to-primitive to the correct builtin schema', async () => {
    const source = `
namespace test.jsonSchemaAliasField
version "0.0.0"

typeAlias MyAlias: string

type Foo:
    bar MyAlias (0..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.jsonSchemaAliasField');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as { $defs: Record<string, { properties: Record<string, unknown> }> };
    expect(schema.$defs['Foo']!.properties['bar']).toEqual({ type: 'string' });
    expect(output.diagnostics.filter((d) => d.code === 'unresolved-ref')).toHaveLength(0);
  });

  it('resolves a field typed via a type-alias-to-Data to the Data $ref', async () => {
    const source = `
namespace test.jsonSchemaAliasField2
version "0.0.0"

type Bar:
    x string (0..1)

typeAlias MyAlias: Bar

type Foo:
    bar MyAlias (0..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.jsonSchemaAliasField2');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as { $defs: Record<string, { properties: Record<string, unknown> }> };
    expect(schema.$defs['Foo']!.properties['bar']).toEqual({ $ref: '#/$defs/Bar' });
    expect(output.diagnostics.filter((d) => d.code === 'unresolved-ref')).toHaveLength(0);
  });

  it('resolves a field typed via a type-alias-to-Choice to the Choice $ref', async () => {
    const source = `
namespace test.jsonSchemaAliasField3
version "0.0.0"

type Cash:
    amount number (0..1)

type Commodity:
    quantity number (0..1)

choice Asset:
    Cash
    Commodity

typeAlias MyAlias: Asset

type Foo:
    bar MyAlias (0..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.jsonSchemaAliasField3');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as { $defs: Record<string, { properties: Record<string, unknown> }> };
    expect(schema.$defs['Foo']!.properties['bar']).toEqual({ $ref: '#/$defs/Asset' });
    expect(output.diagnostics.filter((d) => d.code === 'unresolved-ref')).toHaveLength(0);
  });

  it('chases a 2-hop type-alias chain (alias-to-alias-to-Data) for an attribute', async () => {
    const source = `
namespace test.jsonSchemaAliasFieldChain
version "0.0.0"

type Party:
    partyId string (1..1)

typeAlias Inner: Party
typeAlias Outer: Inner

type Foo:
    bar Outer (0..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.jsonSchemaAliasFieldChain');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as { $defs: Record<string, { properties: Record<string, unknown> }> };
    expect(schema.$defs['Foo']!.properties['bar']).toEqual({ $ref: '#/$defs/Party' });
    expect(output.diagnostics.filter((d) => d.code === 'unresolved-ref')).toHaveLength(0);
  });
});
