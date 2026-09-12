// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { URI } from 'langium';
import { assertValidDocuments, createRuneDslServices } from '../../src/index.js';

async function build(sources: string[]) {
  const { RuneDsl } = createRuneDslServices();
  const documents = sources.map((source, i) =>
    RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      source,
      URI.parse(`inmemory:///publication-${i}.rosetta`)
    )
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build(documents, { validation: false });
  return documents;
}

describe('artifact document validation', () => {
  it.each([
    ['type', 'type Broken:\n value MissingType (1..1)', 'MissingType'],
    [
      'function',
      'basicType int\nfunc Broken:\n output: result int (1..1)\n set result: MissingFunction()',
      'MissingFunction'
    ],
    [
      'enum value',
      'enum Kind:\n Known\nfunc Broken:\n output: result Kind (1..1)\n set result: Kind -> MissingValue',
      'MissingValue'
    ]
  ])('rejects an unresolved %s with semantic validation disabled', async (_kind, source, missing) => {
    const documents = await build([`namespace example\n${source}`]);
    expect(documents[0]!.parseResult.parserErrors).toEqual([]);
    expect(documents[0]!.diagnostics).toBeUndefined();
    expect(() => assertValidDocuments(documents)).toThrow(`linking error(s): Could not resolve reference`);
    expect(() => assertValidDocuments(documents)).toThrow(missing);
    expect(() => assertValidDocuments(documents)).toThrow('publication-0.rosetta');
  });

  it('accepts complete cross-file dependencies and rejects the same batch when a dependency is omitted', async () => {
    const dependent = 'namespace example\ntype A:\n b B (1..1)';
    const dependency = 'namespace example\ntype B:';
    const complete = await build([dependent, dependency]);
    expect(() => assertValidDocuments(complete)).not.toThrow();
    const incomplete = await build([dependent]);
    expect(() => assertValidDocuments(incomplete)).toThrow('B');
  });

  it('rejects documents that have not been linked', () => {
    const { RuneDsl } = createRuneDslServices();
    const document = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      'namespace example\ntype A:',
      URI.parse('inmemory:///unbuilt.rosetta')
    );
    expect(() => assertValidDocuments([document])).toThrow('document has not been linked');
  });

  it('retains syntax rejection before linking checks', async () => {
    const documents = await build(['not Rune']);
    expect(() => assertValidDocuments(documents)).toThrow('parse error(s)');
  });
});
