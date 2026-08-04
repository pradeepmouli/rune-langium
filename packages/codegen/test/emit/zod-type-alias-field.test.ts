// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * unified-type-reference-resolution Task 3 — zod-emitter's `resolveTypeExpr`
 * (and `resolveTypeExprAsTs`) now delegate to the shared `resolveTypeCallTarget`
 * resolver (type-ref-resolver.ts, Task 1), which transparently chases
 * `RosettaTypeAlias` chains. Before this migration, an ATTRIBUTE typed
 * directly by a type alias (as opposed to the alias declaration itself,
 * covered by us7-type-aliases.test.ts) fell through every isRosettaBasicType/
 * isRosettaEnumeration/isData/isChoice branch in the hand-rolled chain and
 * silently degraded to `z.unknown()` — this file is the regression guard for
 * that specific integration point.
 */

import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, it, expect } from 'vitest';
import { walkNamespace } from '../../src/emit/namespace-walker.js';
import { emitNamespace } from '../../src/emit/zod-emitter.js';

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

describe('zod-emitter — attribute typed via a type-alias reference', () => {
  it('resolves a field typed via a type-alias-to-primitive to the correct Zod validator', async () => {
    const source = `
namespace test.aliasField
version "0.0.0"

typeAlias MyAlias: string

type Foo:
    bar MyAlias (0..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.aliasField');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('bar: z.string().optional()');
    expect(output.content).not.toContain('z.unknown()');
  });

  it('resolves a field typed via a type-alias-to-Data to the Data schema reference', async () => {
    const source = `
namespace test.aliasField2

version "0.0.0"

type Bar:
    x string (0..1)

typeAlias MyAlias: Bar

type Foo:
    bar MyAlias (0..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.aliasField2');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('bar: BarSchema.optional()');
    expect(output.content).not.toContain('z.unknown()');
  });
});

/**
 * The resolver's `onPrimitive` callback receives the stdlib "type-alias-
 * flavored builtin" name (`int`, `productType`, `eventType`, `calculation`)
 * directly — these are real `RosettaTypeAlias` nodes in the stdlib
 * (base-types.ts) that the resolver deliberately does NOT chase through
 * (see type-ref-resolver.ts's ROSETTA_BASIC_TYPE_NAMES short-circuit).
 * zod-emitter's `this.ctx.builtinTypeMap` (mergeProfileTypeMaps(zodProfile))
 * must have entries for all four so `onPrimitive` never falls back to
 * `z.unknown()` for them.
 */
describe('zod-emitter — stdlib alias-flavored builtin primitives', () => {
  it('maps int/productType/eventType/calculation to their distinct Zod validators, not z.unknown()', async () => {
    const source = `
namespace test.stdlibPrimitives
version "0.0.0"

type Foo:
    a int (0..1)
    b productType (0..1)
    c eventType (0..1)
    d calculation (0..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.stdlibPrimitives');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('a: z.number().int().optional()');
    expect(output.content).toContain('b: z.string().optional()');
    expect(output.content).toContain('c: z.string().optional()');
    expect(output.content).toContain('d: z.string().optional()');
    expect(output.content).not.toContain('z.unknown()');
  });
});
