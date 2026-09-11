// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import ts from 'typescript-classic';
import { resolve } from 'node:path';
import { generate } from '../../src/export.js';

async function compile(source: string, typeAssertions = '') {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///functions.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  expect(doc.parseResult.parserErrors).toEqual([]);
  const outputs = await generate(doc, { target: 'typescript' });
  expect(outputs.flatMap((output) => output.diagnostics.filter((d) => d.severity === 'error'))).toEqual([]);
  const code = outputs[0]!.content;
  const fileName = resolve('generated-function-runtime.ts');
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    skipLibCheck: true,
    types: []
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  host.readFile = (file) => (file === fileName ? code + '\n' + typeAssertions : readFile(file));
  const program = ts.createProgram([fileName], options, host);
  expect(ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual(
    []
  );
  const js = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const exports: Record<string, (input: Record<string, unknown>) => unknown> = {};
  new Function('exports', js)(exports);
  return exports;
}

describe('generated TypeScript function execution', () => {
  it('executes resolved calls and both conditional branches', async () => {
    const funcs = await compile(`namespace test.runtime
func Double:
 inputs: n int (1..1)
 output: result int (1..1)
 set result: n + n
func Choose:
 inputs: n int (1..1)
 output: result int (1..1)
 set result: if n > 0 then Double(Double(n)) else 0
`);
    expect(funcs.Choose!({ n: 3 })).toBe(12);
    expect(funcs.Choose!({ n: -1 })).toBe(0);
  });

  it('enforces declared input, output, and collection types at call sites', async () => {
    await compile(
      `namespace test.runtime
func Required:
 inputs: n int (1..1)
 output: result int (1..1)
 set result: n
func Optional:
 inputs: n int (0..1)
 output: result int (0..1)
 set result: n
func Many:
 inputs: values int (0..*)
 output: result int (0..*)
 set result: values
`,
      `
const numberResult: number = Required({n: 1});
const optionalResult: number | undefined = Optional({});
const arrayResult: number[] = Many({values: [1, 2]});
// @ts-expect-error Required input is missing.
Required({});
// @ts-expect-error Rune int accepts numbers.
Required({n: '1'});
// @ts-expect-error Rune output is numeric.
const wrongOutput: string = Required({n: 1});
// @ts-expect-error Optional output may be absent.
const missingOptionality: number = Optional({});
// @ts-expect-error Collection input requires an array.
Many({values: 1});
`
    );
  });

  it('deduplicates values and checks set membership', async () => {
    const funcs = await compile(`namespace test.runtime
func Unique:
 inputs: values int (0..*)
 output: result int (0..*)
 set result: values distinct
func HasAll:
 inputs:
  values int (0..*)
  requested int (0..*)
 output: result boolean (1..1)
 set result: values contains requested
`);
    expect(funcs.Unique!({ values: [2, 1, 2, 3] })).toEqual([2, 1, 3]);
    expect(funcs.HasAll!({ values: [2, 1, 2, 3], requested: [1, 3] })).toBe(true);
    expect(funcs.HasAll!({ values: [2, 1, 2, 3], requested: [] })).toBe(false);
  });

  it('calls reporting rules and host-provided library implementations', async () => {
    const funcs = await compile(`namespace test.runtime
type Amount:
 value int (1..1)
reporting rule ReadAmount from Amount:
 value
library function Adjust(value int) int
func Compute:
 inputs: amount Amount (1..1)
 output: result int (1..1)
 set result: Adjust(ReadAmount(amount))
`);
    expect(() => funcs.Compute!({ amount: { value: 3 } })).toThrow('requires an implementation');
    Object.assign(funcs.Adjust!, { implementation: (value: number) => value + 10 });
    expect(funcs.Compute!({ amount: { value: 3 } })).toBe(13);
  });

  it('counts scalars and validates one-of across declared object fields', async () => {
    const funcs = await compile(`namespace test.runtime
type Alternatives:
 a int (0..1)
 b int (0..*)
func Count:
 inputs: value int (0..1)
 output: result int (1..1)
 set result: value count
func ExactlyOne:
 inputs: value Alternatives (1..1)
 output: result boolean (1..1)
 set result: value one-of
`);
    expect(funcs.Count!({ value: 7 })).toBe(1);
    expect(funcs.Count!({})).toBe(0);
    expect(funcs.ExactlyOne!({ value: { a: 1, b: [] } })).toBe(true);
    expect(funcs.ExactlyOne!({ value: { a: 1, b: [2] } })).toBe(false);
    expect(funcs.ExactlyOne!({ value: { b: [] } })).toBe(false);
  });

  it('preserves field metadata and reads its value in ordinary expressions', async () => {
    const funcs = await compile(`namespace test.runtime
func Label:
 inputs: text string (1..1)
 output: result string (1..1)
  [metadata scheme]
 set result: text with-meta {scheme: "urn:test"}
func Read:
 inputs: text string (1..1)
  [metadata scheme]
 output: result string (1..1)
 set result: text
func Relabel:
 inputs: text string (1..1)
  [metadata scheme]
 output: result string (1..1)
  [metadata scheme]
 set result: text with-meta {scheme: "urn:updated"}
`);
    expect(funcs.Label!({ text: 'A' })).toEqual({ value: 'A', meta: { scheme: 'urn:test' } });
    expect(funcs.Read!({ text: { value: 'A', meta: { scheme: 'urn:test' } } })).toBe('A');
    expect(funcs.Relabel!({ text: { value: 'A', meta: { scheme: 'urn:test', location: 'kept' } } })).toEqual({
      value: 'A',
      meta: { scheme: 'urn:updated', location: 'kept' }
    });
  });

  it('passes typed metadata arguments between functions and normalizes collection outputs', async () => {
    const funcs = await compile(`namespace test.runtime
func Echo:
 inputs: text string (1..1)
  [metadata scheme]
 output: result string (1..1)
  [metadata scheme]
 set result: text
func Call:
 inputs: text string (1..1)
  [metadata scheme]
 output: result string (1..1)
  [metadata scheme]
 set result: Echo(text)
func Implicit:
 inputs: texts string (0..*)
 output: result string (0..*)
  [metadata scheme]
 set result: texts extract [Echo]
func Labels:
 inputs: texts string (0..*)
 output: result string (0..*)
  [metadata scheme]
 set result: texts with-meta {scheme: "urn:test"}
func OptionalLabel:
 inputs: text string (0..1)
 output: result string (0..1)
  [metadata scheme]
 set result: text
`);
    const text = { value: 'A', meta: { scheme: 'urn:test' } };
    expect(funcs.Call!({ text })).toEqual(text);
    expect(funcs.Implicit!({ texts: ['A', 'B'] })).toEqual([
      { value: 'A', meta: {} },
      { value: 'B', meta: {} }
    ]);
    expect(funcs.Labels!({ texts: ['A', 'B'] })).toEqual([text, { value: 'B', meta: text.meta }]);
    expect(funcs.Labels!({})).toEqual([]);
    expect(funcs.OptionalLabel!({})).toBeUndefined();
  });

  it('types keyed data and emits reference outputs without embedding the value', async () => {
    const funcs = await compile(
      `namespace test.runtime
type Item:
 [metadata key]
 name string (1..1)
func Reference:
 inputs: source Item (1..1)
 output: result Item (1..1)
  [metadata reference]
 set result: source as-key
`,
      `
const item: Item = {name: 'A', meta: {externalKey: 'item-1'}};
const reference: RuneReferenceWithMeta<Item> = Reference({source: item});
// @ts-expect-error Reference outputs are wrappers, not direct data values.
const value: Item = Reference({source: item});
`
    );
    expect(funcs.Reference!({ source: { name: 'A', meta: { externalKey: 'item-1' } } })).toEqual({
      externalReference: 'item-1'
    });
  });

  it('collects deep collection features across populated branches', async () => {
    const funcs = await compile(`namespace test.runtime
type Branch:
 values int (0..*)
type Root:
 left Branch (0..1)
 right Branch (0..1)
func Collect:
 inputs: source Root (1..1)
 output: result int (0..*)
 set result: source ->> values
`);
    expect(funcs.Collect!({ source: { right: { values: [2, 3] } } })).toEqual([2, 3]);
    expect(funcs.Collect!({ source: { left: { values: [1] }, right: { values: [2, 3] } } })).toEqual([1, 2, 3]);
  });

  it('inherits function inputs and forwards super arguments', async () => {
    const funcs = await compile(`namespace test.runtime
func Base:
 inputs: n int (1..1)
 output: result int (1..1)
 set result: n + 1
func Derived extends Base:
 set result: super(n) + 1
func Use:
 inputs: n int (1..1)
 output: result int (1..1)
 set result: Derived(n)
`);
    expect(funcs.Use!({ n: 3 })).toBe(5);
  });

  it('returns empty for a value conditional without an else and checks the output binding', async () => {
    const funcs = await compile(`namespace test.runtime
func Positive:
 inputs: n int (1..1)
 output: result int (0..1)
 set result: if n > 0 then n
 post-condition: result is absent or result > 0
`);
    expect(funcs.Positive!({ n: 3 })).toBe(3);
    expect(funcs.Positive!({ n: -1 })).toBeUndefined();
  });
  it('passes implicit pipeline arguments and preserves array set/add values', async () => {
    const funcs = await compile(`namespace test.runtime
func Double:
 inputs: n int (1..1)
 output: result int (1..1)
 set result: n + n
func Collect:
 inputs: values int (0..*)
 output: result int (0..*)
 set result: values extract [Double]
 add result: [7, 8]
 add result: 9
`);
    expect(funcs.Collect!({ values: [1, 2] })).toEqual([2, 4, 7, 8, 9]);
  });

  it('initializes nested output assignment paths', async () => {
    const funcs = await compile(`namespace test.runtime
type Inner:
 value int (1..1)
type Outer:
 nested Inner (1..1)
func Build:
 inputs: amount int (1..1)
 output: result Outer (1..1)
 set result -> nested -> value: amount
`);
    expect(funcs.Build!({ amount: 4 })).toEqual({ nested: { value: 4 } });
  });

  it('selects dispatch implementations and keeps the base fallback', async () => {
    const funcs = await compile(`namespace test.runtime
enum Kind:
 Cash
 Credit
func Compute:
 inputs:
  kind Kind (1..1)
  amount int (1..1)
 output: result int (1..1)
 set result: amount
func Compute(kind: Kind -> Cash):
 set result: amount + 1
func Compute(kind: Kind -> Credit):
 set result: amount + 2
`);
    expect(funcs.Compute!({ kind: 'Cash', amount: 3 })).toBe(4);
    expect(funcs.Compute!({ kind: 'Credit', amount: 3 })).toBe(5);
    expect(funcs.Compute!({ kind: 'other', amount: 3 })).toBe(3);
  });
});
