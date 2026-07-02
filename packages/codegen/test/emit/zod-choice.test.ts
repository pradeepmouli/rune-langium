// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * W2 — zod-emitter Choice emission.
 *
 * `z.union([...])` of per-option `z.object` shapes — key-presence
 * discrimination, not `z.discriminatedUnion` (CDM Choice instances encode
 * as an object with exactly one option key present, no literal `$type` tag
 * to discriminate on). Same field-naming decision as ts-emitter (see
 * test/emit/ts-choice.test.ts): camelCase-first-letter of the option's
 * type name.
 */

import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, it, expect } from 'vitest';
import { walkNamespace } from '../../src/emit/namespace-walker.js';
import { emitNamespace } from '../../src/emit/zod-emitter.js';

async function parseSource(source: string) {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse('inmemory:///model.rosetta'));
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  const model = doc.parseResult?.value;
  if (!model || !isRosettaModel(model)) {
    throw new Error('expected a RosettaModel');
  }
  return doc;
}

const FIXTURE = `
namespace test.choice
version "0.0.0"

type Cash:
    amount number (0..1)

type Commodity:
    quantity number (0..1)

choice Asset:
    Cash
    Commodity

type Trade:
    asset Asset (0..1)
`;

describe('zod-emitter — Choice emission (W2)', () => {
  it('emits a z.union of per-option z.object schemas', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.choice');
    const output = emitNamespace(model, {});
    expect(output.content).toContain(
      'export const AssetSchema = z.union([z.object({ cash: CashSchema }), z.object({ commodity: CommoditySchema })]);'
    );
  });

  it('emits a z.infer type alias for the Choice union', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.choice');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('export type Asset = z.infer<typeof AssetSchema>;');
  });

  it('a Data attribute TYPED BY a Choice references the Choice schema, not z.unknown()', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.choice');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('asset: AssetSchema.optional()');
    expect(output.content).not.toContain('asset: z.unknown()');
  });
});
