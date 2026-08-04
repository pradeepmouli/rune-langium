// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * standalone-zod-schema-extraction final-review follow-up (PR #470 bot
 * comment id 3714695769) — `emitChoiceSchema`'s option loop's own
 * `onUnresolved` fell back to a guessed `${refText}Schema` reference with NO
 * diagnostic pushed at all, unlike `resolveTypeExpr`'s attribute-side
 * `onUnresolved` (which always calls `reportUnresolvedReference`). A Choice
 * option typed by a name that doesn't resolve to anything therefore silently
 * emitted an undefined-at-evaluation-time schema reference with no signal in
 * `output.diagnostics`. Fixed by routing the Choice-option path through
 * `reportUnresolvedReference` too, using the `${choice.name} option` label
 * already established for this exact non-attribute (`ChoiceOption` has no
 * `.name`) case in xsd-emitter.ts's `resolveTypeCallToXsdType` call site.
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

describe('zod-emitter — Choice-option unresolved-reference diagnostic', () => {
  it('reports unresolved-ref for a Choice option typed by a name that does not resolve to anything', async () => {
    const source = `
namespace test.zodChoiceUnresolvedOption
version "0.0.0"

choice Asset:
    TotallyUnknownType
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.zodChoiceUnresolvedOption');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('TotallyUnknownTypeSchema');
    expect(output.diagnostics).toContainEqual({
      severity: 'warning',
      code: 'unresolved-ref',
      message: "Attribute 'Asset option': type 'TotallyUnknownType' is not resolved; emitting TotallyUnknownTypeSchema"
    });
  });
});
