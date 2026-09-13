// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, expect, it } from 'vitest';
import { URI } from 'langium';
import { assertValidDocuments, createRuneDslServices, BASICTYPES_ROSETTA } from '../../src/index.js';

describe('switch target scope', () => {
  it.each(
    ['date', 'string', 'Kind', 'Text'].flatMap((type) => [
      { type, input: type },
      { type, input: 'Payload' }
    ])
  )('rejects standalone $type guards on $input inputs before publication', async ({ type, input }) => {
    const { RuneDsl } = createRuneDslServices();
    const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
    const docs = [
      factory.fromString(BASICTYPES_ROSETTA, URI.parse('inmemory:///basictypes.rosetta')),
      factory.fromString(
        `namespace test.switches
enum Kind:
 A
typeAlias Text: string
type Payload:
 amount int (1..1)
func Check:
 inputs: value ${input} (1..1)
 output: result int (1..1)
 set result: value switch ${type} then 1, default 0
`,
        URI.parse('inmemory:///switch.rosetta')
      )
    ];
    await RuneDsl.shared.workspace.DocumentBuilder.build(docs, { validation: false });
    expect(docs[1]!.parseResult.parserErrors).toEqual([]);
    expect(() => assertValidDocuments(docs)).toThrow(`named '${type}'`);
  });
});
