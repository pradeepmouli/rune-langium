// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * W2 — namespace-walker Choice collection.
 *
 * Before this work, walkNamespace never collected `choice` declarations
 * (see NamespaceWalkResult — no choiceByName field), so neither the ts- nor
 * zod-emitter produced any output for them, and attributes TYPED BY a
 * Choice fell to `unknown` in the typeRef mapping (isChoice was never
 * consulted). This mirrors Data's treatment: collected into a by-name map,
 * included in the reference graph (a Data attribute typed by a Choice
 * creates an edge; a Choice's own options reference their Data types),
 * and threaded through emitOrder / cyclicTypes.
 */

import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, it, expect } from 'vitest';
import { walkNamespace } from '../src/emit/namespace-walker.js';

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

describe('walkNamespace — Choice collection (W2)', () => {
  it('collects choice declarations into choiceByName', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.choice');
    expect(model.choiceByName.has('Asset')).toBe(true);
    expect(model.choiceByName.get('Asset')!.attributes.map((o) => o.typeCall.type.$refText)).toEqual([
      'Cash',
      'Commodity'
    ]);
  });

  it('includes the Choice name in emitOrder', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.choice');
    expect(model.emitOrder).toContain('Asset');
  });

  it('emitOrder places a Choice AFTER its option types (options must be declared first)', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.choice');
    const order = Array.from(model.emitOrder);
    const cashIdx = order.indexOf('Cash');
    const commodityIdx = order.indexOf('Commodity');
    const assetIdx = order.indexOf('Asset');
    expect(cashIdx).toBeGreaterThanOrEqual(0);
    expect(commodityIdx).toBeGreaterThanOrEqual(0);
    expect(assetIdx).toBeGreaterThan(cashIdx);
    expect(assetIdx).toBeGreaterThan(commodityIdx);
  });

  it('emitOrder places a Data type that references a Choice AFTER the Choice (Trade after Asset)', async () => {
    const doc = await parseSource(FIXTURE);
    const model = walkNamespace([doc], 'test.choice');
    const order = Array.from(model.emitOrder);
    expect(order.indexOf('Trade')).toBeGreaterThan(order.indexOf('Asset'));
  });
});
