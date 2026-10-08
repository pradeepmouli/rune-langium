// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { URI } from 'langium';
import { createRuneDslServices, getExpressionScope, type RosettaModel } from '../../src/index.js';

async function scope(source: string | string[], name: string, aliasIndex?: number) {
  const { RuneDsl } = createRuneDslServices();
  const shared = RuneDsl.shared;
  const docs = (Array.isArray(source) ? source : [source]).map((text, i) =>
    shared.workspace.LangiumDocumentFactory.fromString<RosettaModel>(text, URI.parse(`file:///scope-${i}.rosetta`))
  );
  for (const doc of docs) shared.workspace.LangiumDocuments.addDocument(doc);
  await shared.workspace.DocumentBuilder.build(docs, { validation: false, eagerLinking: true });
  const doc = docs.at(-1)!;
  expect(doc.parseResult.parserErrors).toEqual([]);
  const owner = doc.parseResult.value.elements.find(
    (e) => (e.$type === 'RosettaFunction' || e.$type === 'Data') && e.name === name
  )!;
  if (owner.$type !== 'RosettaFunction' && owner.$type !== 'Data') throw new Error('fixture owner');
  const expression =
    owner.$type === 'RosettaFunction'
      ? aliasIndex === undefined
        ? owner.operations[0]!.expression
        : owner.shortcuts[aliasIndex]!.expression
      : owner.conditions[0]!.expression;
  return getExpressionScope(expression, RuneDsl);
}

describe('authoritative expression scope descriptions', () => {
  it('uses the actual output name and exposes earlier aliases', async () => {
    const entries = await scope(
      'namespace test\nversion "test"\nfunc Convert:\n inputs: date int (1..1)\n output: adjustableOrRelativeDate int (1..1)\n alias earlier: date\n set adjustableOrRelativeDate: earlier',
      'Convert'
    );
    expect(entries).toContainEqual(expect.objectContaining({ name: 'adjustableOrRelativeDate', kind: 'output' }));
    expect(entries).toContainEqual(expect.objectContaining({ name: 'date', kind: 'input', cardinality: '(1..1)' }));
    expect(entries).toContainEqual(expect.objectContaining({ name: 'earlier', kind: 'alias' }));
  });

  it('uses the language service scope for inherited Data attributes', async () => {
    const entries = await scope(
      'namespace test\nversion "test"\ntype Base:\n inherited int (1..1)\ntype Child extends Base:\n own int (1..1)\n condition Valid: inherited = own',
      'Child'
    );
    expect(entries).toContainEqual(expect.objectContaining({ name: 'inherited', kind: 'attribute' }));
    expect(entries).toContainEqual(expect.objectContaining({ name: 'own', kind: 'attribute' }));
    expect(entries.every((e) => e.declarationId.length > 0)).toBe(true);
  });
  it('offers canonically resolved imported callables with their argument counts', async () => {
    const entries = await scope(
      [
        'namespace helpers\nversion "test"\nfunc Combine:\n inputs:\n  a int (1..1)\n  b int (1..1)\n output: total int (1..1)\n set total: a + b',
        'namespace test\nversion "test"\nimport helpers.*\nfunc Use:\n output: result int (1..1)\n set result: Combine(1, 2)'
      ],
      'Use'
    );
    expect(entries).toContainEqual(expect.objectContaining({ name: 'Combine', kind: 'callable', argumentCount: 2 }));
  });

  it('includes Choice symbols from the authoritative language-service scope', async () => {
    const entries = await scope(
      `namespace test
version "test"
type Cash:
 amount int (1..1)
type Security:
 units int (1..1)
choice Asset:
 Cash
 Security
func Use:
 inputs: asset Asset (1..1)
 output: result Asset (1..1)
 set result: asset`,
      'Use'
    );
    expect(entries).toContainEqual(expect.objectContaining({ name: 'Asset', kind: 'choice' }));
  });

  it('counts external parameters and inherited inputs', async () => {
    const entries = await scope(
      `namespace test
version "test"
library function Native(a int, b int) int
func Parent:
 inputs:
  a int (1..1)
  b int (1..1)
 output: result int (1..1)
 set result: a + b
func Derived extends Parent:
 set result: a
func Use:
 output: result int (1..1)
 set result: Derived(1, 2)`,
      'Use'
    );
    expect(entries).toContainEqual(expect.objectContaining({ name: 'Native', kind: 'callable', argumentCount: 2 }));
    expect(entries).toContainEqual(expect.objectContaining({ name: 'Derived', kind: 'callable', argumentCount: 2 }));
  });

  it('resolves a dispatch signature from its declaration and scopes enum members', async () => {
    const entries = await scope(
      [
        'namespace split\nversion "test"\nenum Kind:\n Cash\n Credit\nfunc Compute:\n inputs:\n  kind Kind (1..1)\n  amount int (1..1)\n output: computed int (1..1)\n set computed: amount',
        'namespace split\nversion "test"\nfunc Compute(kind: Kind -> Cash):\n set computed: amount + 1'
      ],
      'Compute'
    );
    expect(entries).toContainEqual(expect.objectContaining({ name: 'amount', kind: 'input' }));
    expect(entries).toContainEqual(expect.objectContaining({ name: 'computed', kind: 'output' }));
  });

  it('does not offer the current alias or later aliases', async () => {
    const entries = await scope(
      'namespace test\nversion "test"\nfunc Use:\n output: result int (1..1)\n alias alphaAlias: 1\n alias betaAlias: alphaAlias + 1\n alias gammaAlias: betaAlias + 1\n set result: gammaAlias',
      'Use',
      1
    );
    expect(entries.filter((e) => e.kind === 'alias').map((e) => e.name)).toEqual(['alphaAlias']);
  });

  it('includes the expected enum members in a Data equality condition', async () => {
    const entries = await scope(
      'namespace test\nversion "test"\nenum Kind:\n Cash\n Credit\ntype Deal:\n kind Kind (1..1)\n condition Valid: kind = Cash',
      'Deal'
    );
    expect(entries).toContainEqual(expect.objectContaining({ name: 'Cash', kind: 'enum' }));
    expect(entries).toContainEqual(expect.objectContaining({ name: 'Credit', kind: 'enum' }));
  });
});
