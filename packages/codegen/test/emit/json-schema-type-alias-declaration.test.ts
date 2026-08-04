// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * unified-type-reference-resolution Task 5 follow-up — json-schema-emitter's
 * `emitTypeAliasDef` (the type-alias DECLARATION's own right-hand side, e.g.
 * `typeAlias A: B` — what does `B` resolve to) now delegates to the shared
 * `resolveTypeCallTarget` resolver (type-ref-resolver.ts, Task 1), the same
 * resolver this task's field-side migration used for `resolveItemSchema`.
 * Before this fix, `emitTypeAliasDef` hand-rolled its own
 * isRosettaBasicType/isRosettaEnumeration/isData/refText chain (duplicated
 * TWICE, once per branch) with no `isRosettaTypeAlias` branch and no
 * `isChoice` handling at all — `typeAlias A: B` where `B` was itself a
 * `typeAlias B: C`, or where `B` was a Choice, silently fell through to
 * `{ type: 'string' }`. This file is the regression guard for that
 * alias-declaration-RHS integration point (mirrors
 * zod-type-alias-declaration.test.ts, Task 3's follow-up sibling for the
 * Zod target).
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

describe('json-schema-emitter — type-alias declaration RHS is itself a type alias', () => {
  it('resolves a genuine 2-hop alias chain (A: B, B: string) to the terminal primitive schema', async () => {
    // `A`'s RHS (`B`) is not a primitive/Data/Enum/Choice directly — it is
    // ITSELF a `typeAlias B: string`. A single-hop chase would not be
    // enough to prove the fix; this requires the resolver to walk from A's
    // typeCall, discover B is a RosettaTypeAlias, and chase INTO B's own
    // typeCall to reach the terminal primitive `string`.
    const source = `
namespace test.jsonSchemaAliasChain
version "0.0.0"

typeAlias B: string

typeAlias A: B
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.jsonSchemaAliasChain');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as { $defs: Record<string, unknown> };
    expect(schema.$defs['A']).toEqual({ type: 'string' });
  });

  it('resolves a type-alias declaration RHS pointing at a Data type to the Data $ref', async () => {
    const source = `
namespace test.jsonSchemaAliasDeclDataRef
version "0.0.0"

type Bar:
    x string (0..1)

typeAlias MyAlias: Bar
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.jsonSchemaAliasDeclDataRef');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as { $defs: Record<string, unknown> };
    expect(schema.$defs['MyAlias']).toEqual({ $ref: '#/$defs/Bar' });
  });

  it('resolves a type-alias declaration RHS pointing at a Choice type to the Choice $ref (previously unhandled)', async () => {
    const source = `
namespace test.jsonSchemaAliasDeclChoiceRef
version "0.0.0"

type Cash:
    amount number (0..1)

type Commodity:
    quantity number (0..1)

choice Asset:
    Cash
    Commodity

typeAlias MyAlias: Asset
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.jsonSchemaAliasDeclChoiceRef');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as { $defs: Record<string, unknown> };
    expect(schema.$defs['MyAlias']).toEqual({ $ref: '#/$defs/Asset' });
  });

  it('resolves stdlib alias-flavored builtin primitives (int/productType/eventType/calculation), not the fallback', async () => {
    const source = `
namespace test.jsonSchemaAliasDeclStdlibPrimitives
version "0.0.0"

typeAlias AliasInt: int
typeAlias AliasProductType: productType
typeAlias AliasEventType: eventType
typeAlias AliasCalculation: calculation
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.jsonSchemaAliasDeclStdlibPrimitives');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as { $defs: Record<string, unknown> };
    expect(schema.$defs['AliasInt']).toEqual({ type: 'integer' });
    expect(schema.$defs['AliasProductType']).toEqual({ type: 'string' });
    expect(schema.$defs['AliasEventType']).toEqual({ type: 'string' });
    expect(schema.$defs['AliasCalculation']).toEqual({ type: 'string' });
  });
});
