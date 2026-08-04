// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * unified-type-reference-resolution Task 6 — xsd-emitter's
 * `resolveAttributeType` now delegates to the shared `resolveTypeCallTarget`
 * resolver (type-ref-resolver.ts, Task 1), which transparently chases
 * `RosettaTypeAlias` chains. Before this migration, an ATTRIBUTE typed
 * directly by a type alias fell through the `isRosettaBasicType`/
 * `isRosettaEnumeration`/`isData`/`isChoice` checks in the hand-rolled
 * `typeRef`/`refText` chain (neither branch ever consulted
 * `typeAliasByName`) and landed on the generic unresolved-ref fallback,
 * emitting `xs:string` plus a warning instead of the alias's real underlying
 * type — this file is the regression guard for that specific integration
 * point (mirrors json-schema-type-alias-field.test.ts, Task 5's sibling for
 * the JSON Schema target).
 *
 * The alias-to-primitive case deliberately uses `int` (not `string`) — this
 * emitter's OWN existing unresolved-fallback ALSO happens to render
 * `xs:string`, so an alias-to-string case would not distinguish fixed from
 * broken; `xs:int` vs. the `xs:string` fallback genuinely differ.
 */

import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, it, expect } from 'vitest';
import { walkNamespace } from '../../src/emit/namespace-walker.js';
import { emitNamespace } from '../../src/emit/xsd-emitter.js';

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

describe('xsd-emitter — attribute typed via a type-alias reference', () => {
  it('resolves a field typed via a type-alias-to-non-string-primitive to the correct xs: builtin', async () => {
    const source = `
namespace test.xsdAliasField
version "0.0.0"

typeAlias MyAlias: int

type Foo:
    bar MyAlias (1..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.xsdAliasField');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('<xs:element name="bar" type="xs:int"/>');
    expect(output.diagnostics.filter((d) => d.code === 'unresolved-ref')).toHaveLength(0);
  });

  it('resolves a field typed via a type-alias-to-Data to the Data type name', async () => {
    const source = `
namespace test.xsdAliasField2
version "0.0.0"

type Bar:
    x string (0..1)

typeAlias MyAlias: Bar

type Foo:
    bar MyAlias (1..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.xsdAliasField2');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('<xs:element name="bar" type="Bar"/>');
    expect(output.diagnostics.filter((d) => d.code === 'unresolved-ref')).toHaveLength(0);
  });

  it('resolves a field typed via a type-alias-to-Choice to the Choice type name', async () => {
    const source = `
namespace test.xsdAliasField3
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
    bar MyAlias (1..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.xsdAliasField3');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('<xs:element name="bar" type="Asset"/>');
    expect(output.diagnostics.filter((d) => d.code === 'unresolved-ref')).toHaveLength(0);
  });

  it('chases a 2-hop type-alias chain (alias-to-alias-to-Data) for an attribute', async () => {
    const source = `
namespace test.xsdAliasFieldChain
version "0.0.0"

type Party:
    partyId string (1..1)

typeAlias Inner: Party
typeAlias Outer: Inner

type Foo:
    bar Outer (1..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.xsdAliasFieldChain');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('<xs:element name="bar" type="Party"/>');
    expect(output.diagnostics.filter((d) => d.code === 'unresolved-ref')).toHaveLength(0);
  });
});
