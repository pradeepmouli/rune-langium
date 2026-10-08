// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { AstUtils, URI, type LangiumDocument } from 'langium';
import {
  assertValidDocuments,
  createRuneDslServices,
  getNodeSourceRegion,
  BASICTYPES_ROSETTA
} from '@rune-langium/core';
import {
  createPythonProjectionContext,
  generatePythonModule,
  projectPythonCondition,
  selectPythonProjection
} from '../../src/projection/python-functions.js';
import { referenceCases, referenceFiles } from '../helpers/cdm-reference.js';
import { linkedFunctions } from './python-test-utils.js';

function execute(source: string, cases: readonly { expression: string; data?: unknown }[]) {
  const result = spawnSync(
    process.env.PYTHON_BINARY ?? 'python3',
    [new URL('python-runtime-check.py', import.meta.url).pathname],
    {
      encoding: 'utf8',
      input: JSON.stringify({ source, cases })
    }
  );
  expect(result.status, result.error?.message ?? result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Array<{ value?: unknown; error?: string }>;
}

describe('complete Python function projections', () => {
  it('types a continuous body and preserves aliases, nested writes, append and condition order', async () => {
    const funcs = await linkedFunctions(`namespace python.functions
type Child:
 amount number (1..1)
type Result:
 child Child (1..1)
 values number (0..3)
func Build:
 inputs: value number (1..1)
 output: answer Result (1..1)
 alias doubled: value * 2
 condition Positive: doubled >= 0
 set answer -> child -> amount: doubled
 set answer -> values: [value]
 add answer -> values: doubled
 post-condition Complete: answer -> child -> amount >= 0
`);
    const document = AstUtils.getDocument(funcs[0]!);
    const module = generatePythonModule([document]);
    const name = module.bindings.get('python.functions.Build')!;
    expect(module.code).toContain(`def ${name}(input: ${name}_Input) -> Result:`);
    expect(
      execute(module.code + '\nfrom typing import get_type_hints\n', [
        {
          expression: `str(get_type_hints(${name}_Input)["value"])`
        }
      ])
    ).toEqual([{ value: "<class 'float'>" }]);
    expect(module.code).toContain('NotRequired[list[float]]');
    expect(execute(module.code, [{ expression: `${name}(data)`, data: { value: 2 } }])).toEqual([
      { value: { child: { amount: 4 }, values: [2, 4] } }
    ]);
    expect(execute(module.code, [{ expression: `${name}(data)`, data: { value: -1 } }])[0]!.error).toContain(
      'Positive'
    );
    const selected = selectPythonProjection(
      module,
      {
        uri: document.uri.toString(),
        nodeId: 'Build',
        region: getNodeSourceRegion(funcs[0]!)
      },
      'function'
    );
    expect(selected.language).toBe('python');
    expect(selected.code.match(/^def /gm)).toHaveLength(1);
    expect(selected.code.indexOf('doubled =')).toBeLessThan(selected.code.indexOf('Positive'));
    expect(selected.sourceMap[0]!.sourceUri).toBe(document.uri.toString());
    for (const condition of [...funcs[0]!.conditions, ...funcs[0]!.postConditions]) {
      const subject = { uri: document.uri.toString(), nodeId: 'Build', region: getNodeSourceRegion(condition) };
      const guard = selectPythonProjection(module, subject, 'condition');
      expect(selected.code).toContain(
        guard.code
          .split('\n')
          .map((line) => '    ' + line)
          .join('\n')
      );
      expect(guard.code).toContain('raise ValueError');
      expect(projectPythonCondition(condition, createPythonProjectionContext([document], subject)).code).toBe(
        guard.code
      );
    }
  });

  it('preserves inherited signatures, super calls and enum dispatch with base fallback', async () => {
    const funcs = await linkedFunctions(`namespace python.dispatch
enum Kind:
 Cash
 Credit
func Compute:
 inputs: kind Kind (1..1) amount number (1..1)
 output: answer number (1..1)
 set answer: amount
func Compute(kind: Kind -> Cash):
 set answer: amount + 1
func Compute(kind: Kind -> Credit):
 set answer: amount + 2
func Parent:
 inputs: amount number (1..1)
 output: answer number (1..1)
 set answer: amount + 1
func Child extends Parent:
 set answer: super(amount) + 2
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    const compute = module.bindings.get('python.dispatch.Compute')!;
    const child = module.bindings.get('python.dispatch.Child')!;
    expect(
      execute(module.code, [
        { expression: `${compute}(data)`, data: { kind: 'Cash', amount: 3 } },
        { expression: `${compute}(data)`, data: { kind: 'Credit', amount: 3 } },
        { expression: `${compute}(data)`, data: { kind: 'Unknown', amount: 3 } },
        { expression: `${child}(data)`, data: { amount: 3 } }
      ])
    ).toEqual([{ value: 4 }, { value: 5 }, { value: 3 }, { value: 6 }]);
  });

  it('keeps a native binding contract visible and rejects execution when no implementation is bound', async () => {
    const funcs = await linkedFunctions(`namespace python.native
func Native:
 inputs: amount number (1..1)
 output: result number (1..1)
 condition Positive: amount > 0
func Call:
 inputs: amount number (1..1)
 output: result number (1..1)
 set result: Native(amount)
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    const name = module.bindings.get('python.native.Call')!;
    const missing = execute(module.code, [{ expression: `${name}(data)`, data: { amount: 2 } }]);
    expect(missing[0]!.error).toContain('Native binding required: python.native.Native');
    expect(execute(module.code, [{ expression: `${name}(data)`, data: { amount: 0 } }])[0]!.error).toContain(
      'Positive'
    );
    expect(
      execute(module.code + '\nrune_bind("python.native.Native", lambda input: input["amount"] * 3)\n', [
        { expression: `${name}(data)`, data: { amount: 2 } }
      ])
    ).toEqual([{ value: 6 }]);
  });

  it('uses collision-safe linked identities for Python keywords, runtime globals and imported calls', async () => {
    const { RuneDsl } = createRuneDslServices();
    const sources = [
      BASICTYPES_ROSETTA,
      `namespace left\nfunc class:\n output: value number (1..1)\n set value: 2\n`,
      `namespace right\nfunc class:\n output: value number (1..1)\n set value: 3\n`,
      `namespace main\nimport left.*\nimport right.*\nfunc rune_list:\n output: value number (1..1)\n set value: left.class() + right.class()\n`
    ];
    const documents = sources.map((source, index) =>
      RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
        source,
        URI.parse(`inmemory:///names-${index}.rosetta`)
      )
    );
    await RuneDsl.shared.workspace.DocumentBuilder.build(documents);
    assertValidDocuments(documents);
    const module = generatePythonModule(documents);
    expect(new Set(module.bindings.values()).size).toBe(module.bindings.size);
    expect([...module.bindings.values()]).not.toContain('class');
    expect([...module.bindings.values()]).not.toContain('rune_list');
    expect(execute(module.code, [{ expression: `${module.bindings.get('main.rune_list')}({})` }])).toEqual([
      { value: 5 }
    ]);
  });

  it('projects Data conditions as typed predicates independent of the reverse lens', async () => {
    const funcs = await linkedFunctions(`namespace python.conditions
type Amount:
 value number (1..1)
 condition Positive: value >= 0
func Identity:
 inputs: amount Amount (1..1)
 output: result Amount (1..1)
 set result: amount
`);
    const document = AstUtils.getDocument(funcs[0]!);
    const module = generatePythonModule([document]);
    const condition = module.projections.find((entry) => entry.kind === 'condition')!;
    expect(condition.code).toContain('data: Amount');
    expect(condition.code).toContain('-> bool:');
    const name = /^def (\w+)/.exec(condition.code)![1]!;
    expect(
      execute(module.code, [
        { expression: `${name}(data)`, data: { value: 0 } },
        { expression: `${name}(data)`, data: { value: -1 } }
      ])
    ).toEqual([{ value: true }, { value: false }]);
  });

  it('preserves user types when generated input records and metadata type names collide', async () => {
    const funcs = await linkedFunctions(`namespace python.names
type F_Input:
 x number (1..1)
type RuneField:
 y number (1..1)
func F:
 inputs: other F_Input (1..1)
 output: result number (1..1)
 set result: other -> x
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    const name = module.bindings.get('python.names.F')!;
    expect(
      execute(module.code + '\nfrom typing import get_type_hints\n', [
        {
          expression: `list(get_type_hints(get_type_hints(get_type_hints(${name})["input"])["other"]))`
        }
      ])
    ).toEqual([{ value: ['x'] }]);
    expect(module.code).not.toMatch(/^RuneField = TypedDict/m);
  });

  it('preserves absent optional metadata outputs and dispatches on wrapped enum values', async () => {
    const funcs = await linkedFunctions(`namespace python.metadata
annotation metadata:
 scheme string (0..1)
metaType scheme string
enum Kind:
 Cash
 Credit
func Label:
 inputs: text string (0..1)
 output: result string (0..1)
  [metadata scheme]
 set result: text
func Compute:
 inputs: kind Kind (0..1)
  [metadata scheme]
 output: result number (1..1)
 set result: 0
func Compute(kind: Kind -> Cash):
 set result: 1
func Compute(kind: Kind -> Credit):
 set result: 2
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    const label = module.bindings.get('python.metadata.Label')!,
      compute = module.bindings.get('python.metadata.Compute')!;
    expect(module.code).toContain('RuneField[Kind]');
    expect(
      execute(module.code, [
        { expression: `${label}(data)`, data: {} },
        { expression: `${label}(data)`, data: { text: '' } },
        { expression: `${compute}(data)`, data: { kind: { value: 'Cash', meta: { scheme: 'x' } } } },
        { expression: `${compute}(data)`, data: { kind: { value: 'Credit', meta: { scheme: 'x' } } } }
      ])
    ).toEqual([{ value: null }, { value: { value: '', meta: {} } }, { value: 1 }, { value: 2 }]);
  });

  it('normalizes raw metadata inputs before choosing a dispatch branch', async () => {
    const funcs = await linkedFunctions(`namespace python.dispatchRaw
annotation metadata:
 scheme string (0..1)
metaType scheme string
enum Kind:
 Cash
func Compute:
 inputs: kind Kind (0..1)
  [metadata scheme]
 output: result number (1..1)
 set result: 0
func Compute(kind: Kind -> Cash):
 set result: 1
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    expect(
      execute(module.code, [
        { expression: `${module.bindings.get('python.dispatchRaw.Compute')}(data)`, data: { kind: 'Cash' } }
      ])
    ).toEqual([{ value: 1 }]);
  });

  it('keeps linked collection-path writes within declared bounds and normalizes numeric inputs', async () => {
    const funcs = await linkedFunctions(`namespace python.bounds
type Child:
 values number (0..2)
type Outer:
 children Child (0..*)
func Build:
 inputs: values number (0..*)
 output: result Outer (1..1)
 set result -> children -> values: values
 add result -> children -> values: 3
func Precise:
 inputs: number number (1..1)
 output: result boolean (1..1)
 set result: number + 1 = number
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    const build = module.bindings.get('python.bounds.Build')!,
      precise = module.bindings.get('python.bounds.Precise')!;
    const outputs = execute(module.code, [
      { expression: `${build}(data)`, data: { values: [1] } },
      { expression: `${build}(data)`, data: { values: [1, 2] } },
      { expression: `${precise}(data)`, data: { number: 9007199254740992 } }
    ]);
    expect(outputs[0]).toEqual({ value: { children: [{ values: [1, 3] }] } });
    expect(outputs[1]!.error).toContain('too many');
    expect(outputs[2]).toEqual({ value: true });
  });
});

describe('pinned CDM Python backend execution', () => {
  let outputs: Array<{ value?: unknown; error?: string }>;
  beforeAll(async () => {
    const { RuneDsl } = createRuneDslServices();
    const documents: LangiumDocument[] = referenceFiles().map(({ uri, content }) =>
      RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(content, URI.parse(uri))
    );
    await RuneDsl.shared.workspace.DocumentBuilder.build(documents, { validation: false });
    assertValidDocuments(documents);
    const module = generatePythonModule(documents);
    outputs = execute(
      module.code,
      referenceCases.map((testCase) => ({
        expression: `${module.bindings.get(testCase.function)}(data)`,
        data: testCase.inputs
      }))
    );
  });
  it.each(referenceCases)('$id ($function)', (testCase) => {
    const output = outputs[referenceCases.indexOf(testCase)]!;
    if (testCase.expectedError) expect(output.error).toContain(testCase.expectedError);
    else {
      expect(output.error).toBeUndefined();
      const expected = testCase.knownDifference?.expectedRune ?? testCase.expected;
      if (testCase.absoluteTolerance)
        expect(Math.abs(Number(output.value) - Number(expected))).toBeLessThanOrEqual(testCase.absoluteTolerance);
      else expect(output.value).toEqual(expected);
    }
  });
});
