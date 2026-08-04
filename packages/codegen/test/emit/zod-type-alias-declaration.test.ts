// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * unified-type-reference-resolution follow-up — zod-emitter's
 * `emitTypeAliasSchema` (the type-alias DECLARATION's own right-hand side,
 * e.g. `typeAlias A: B` — what does `B` resolve to) now delegates to the
 * shared `resolveTypeCallTarget` resolver (type-ref-resolver.ts, Task 1),
 * the same resolver Task 3 migrated `resolveTypeExpr` onto for ATTRIBUTE
 * references. Before this fix, `emitTypeAliasSchema` hand-rolled its own
 * isRosettaBasicType/isRosettaEnumeration/isData/refText chain with no
 * isRosettaTypeAlias branch and no alias-chain-chasing — `typeAlias A: B`
 * where `B` was itself a `typeAlias B: C` silently degraded to
 * `z.unknown()`. This file is the regression guard for that alias-
 * declaration-RHS integration point (mirrors zod-type-alias-field.test.ts,
 * Task 3's attribute-side sibling).
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

describe('zod-emitter — type-alias declaration RHS is itself a type alias', () => {
  it('resolves a genuine 2-hop alias chain (A: B, B: string) to the terminal primitive validator', async () => {
    // `A`'s RHS (`B`) is not a primitive/Data/Enum/Choice directly — it is
    // ITSELF a `typeAlias B: string`. A single-hop chase (B resolves once,
    // lands on a name it still doesn't recognize as terminal) would NOT be
    // enough to prove the fix; this requires the resolver to walk from A's
    // typeCall, discover B is a RosettaTypeAlias, and chase INTO B's own
    // typeCall to reach the terminal primitive `string`.
    const source = `
namespace test.aliasChain
version "0.0.0"

typeAlias B: string

typeAlias A: B
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.aliasChain');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('export const ASchema = z.string();');
    expect(output.content).not.toContain('export const ASchema = z.unknown();');
  });

  it('resolves a type-alias declaration RHS pointing at a Data type to the Data schema reference', async () => {
    const source = `
namespace test.aliasDeclDataRef
version "0.0.0"

type Bar:
    x string (0..1)

typeAlias MyAlias: Bar
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.aliasDeclDataRef');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('export const MyAliasSchema = BarSchema;');
    expect(output.content).not.toContain('export const MyAliasSchema = z.unknown();');
  });
});
