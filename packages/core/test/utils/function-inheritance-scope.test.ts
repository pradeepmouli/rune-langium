// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { URI } from 'langium';
import {
  BASICTYPES_ROSETTA,
  createRuneDslServices,
  isRosettaModel,
  isRosettaFunction,
  getFunctionInputs,
  getFunctionOutput
} from '../../src/index.js';

describe('inherited function expression scope', () => {
  it('links parent input/output identities through multiple levels of inheritance', async () => {
    const { RuneDsl } = createRuneDslServices();
    const basics = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      BASICTYPES_ROSETTA,
      URI.parse('inmemory:///basics.rosetta')
    );
    const document = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      `namespace scope.inherited
func Parent:
 inputs: amount number (1..1)
 output: answer number (1..1)
 set answer: amount + 1
func Child extends Parent:
 set answer: super(amount) + 2
 post-condition Nonnegative: answer >= 0
func Grandchild extends Child:
 set answer: super(amount)
`,
      URI.parse('inmemory:///inherited.rosetta')
    );
    await RuneDsl.shared.workspace.DocumentBuilder.build([basics, document]);
    expect(document.parseResult.parserErrors).toEqual([]);
    expect(document.references.flatMap((ref) => (ref.error ? [ref.error.message] : []))).toEqual([]);
    if (!isRosettaModel(document.parseResult.value)) throw new Error('Expected model');
    const [parent, child, grandchild] = document.parseResult.value.elements.filter(isRosettaFunction);
    expect(getFunctionInputs(child!)).toEqual(parent!.inputs);
    expect(getFunctionInputs(grandchild!)).toEqual(parent!.inputs);
    expect(grandchild!.operations[0]!.assignRoot.ref).toBe(parent!.output);
    expect(getFunctionOutput(child!)).toBe(parent!.output);
  });
});
