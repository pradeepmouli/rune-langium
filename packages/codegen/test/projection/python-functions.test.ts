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
import { PYTHON_RUNTIME_SOURCE } from '../../src/projection/python-runtime.js';

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
  it('reserves every builtin loaded by the authoritative Python runtime', async () => {
    const [scan] = execute('import ast\nimport builtins\n', [
      {
        expression: `sorted({node.id for node in ast.walk(ast.parse(${JSON.stringify(PYTHON_RUNTIME_SOURCE)})) if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id in vars(builtins)})`
      }
    ]);
    expect(scan!.error).toBeUndefined();
    // These are grammar keywords and cannot be legal Rune function identifiers.
    const names = (scan!.value as string[]).filter((name) => !['all', 'any', 'min', 'set'].includes(name));
    const funcs = await linkedFunctions(
      'namespace python.builtins\n' +
        names.map((name) => `func ${name}:\n output: result number (1..1)\n set result: 1\n`).join('')
    );
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    for (const name of names) expect(module.bindings.get(`python.builtins.${name}`)).not.toBe(name);
  });
  it('preserves absent required outputs and aliases until the final cardinality check', async () => {
    const funcs = await linkedFunctions(`namespace python.initialization
func RequiredOutput:
 inputs: flag boolean (1..1)
 output: result number (1..1)
 set result: if flag then 1
 set result: result + 1
func AliasOutput:
 inputs: flag boolean (1..1)
 output: result number (1..1)
 alias pending: result
 set result: pending + 1
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    const name = module.bindings.get('python.initialization.RequiredOutput')!;
    expect(execute(module.code, [{ expression: `${name}(data)`, data: { flag: false } }])[0]!.error).toContain(
      'produced'
    );
    expect(execute(module.code, [{ expression: `${name}(data)`, data: { flag: true } }])).toEqual([{ value: 2 }]);
    expect(
      execute(module.code, [
        { expression: `${module.bindings.get('python.initialization.AliasOutput')}(data)`, data: { flag: true } }
      ])[0]!.error
    ).toContain('produced');
    expect(module.code).toContain('result: float | None = None');
    expect(module.code).toContain(`def ${name}(input: ${name}_Input) -> float:`);
  });

  it('keeps comprehension bindings and runtime builtins separate from legal declarations', async () => {
    const funcs = await linkedFunctions(`namespace python.names
func Collision:
 inputs: xs number (0..*)
 output: child number (0..*)
 set child: [10]
 add child: xs extract [ child ]
func reversed:
 inputs: xs number (0..*)
 output: result number (0..*)
 set result: xs reverse
func callable:
 inputs: amount number (1..1)
 output: result number (1..1)
 set result: amount
func abs:
 output: result number (1..1)
 set result: 1
func divmod:
 output: result number (1..1)
 set result: 1
func OverflowError:
 output: result number (1..1)
 set result: 1
func Native:
 inputs: amount number (1..1)
 output: result number (1..1)
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    const call = (name: string) => module.bindings.get(`python.names.${name}`)!;
    expect(
      execute(module.code + '\nrune_bind("python.names.Native", lambda input: input["amount"] + 1)\n', [
        { expression: `${call('Collision')}(data)`, data: { xs: [1, 2] } },
        { expression: `${call('reversed')}(data)`, data: { xs: [1, 2] } },
        { expression: `${call('Native')}(data)`, data: { amount: 2 } }
      ])
    ).toEqual([{ value: [10, 10, 10] }, { value: [2, 1] }, { value: 3 }]);
    for (const builtin of ['reversed', 'callable', 'abs', 'divmod', 'OverflowError'])
      expect(call(builtin)).not.toBe(builtin);
  });

  it('accepts computed common parents for only-exists and keeps different parents distinct', async () => {
    const funcs = await linkedFunctions(`namespace python.selection
type Leaf:
 amount number (0..1)
 extra number (0..1)
type Other:
 name string (0..1)
choice Instrument:
 Leaf
 Other
func Check:
 inputs: object Instrument (1..1)
 output: result boolean (1..1)
 set result: ((object as Leaf) -> amount) only exists
func Both:
 inputs: object Instrument (1..1)
 output: result boolean (1..1)
 set result: (((object as Leaf) -> amount), ((object as Leaf) -> extra)) only exists
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    const check = module.bindings.get('python.selection.Check')!;
    expect(
      execute(module.code, [
        { expression: `${check}(data)`, data: { object: { leaf: { amount: 1 } } } },
        { expression: `${check}(data)`, data: { object: { leaf: { amount: 1, extra: 2 } } } },
        {
          expression: `${module.bindings.get('python.selection.Both')}(data)`,
          data: { object: { leaf: { amount: 1, extra: 2 } } }
        }
      ])
    ).toEqual([{ value: true }, { value: false }, { value: true }]);
    const different = await linkedFunctions(`namespace python.different
type Leaf:
 amount number (0..1)
 extra number (0..1)
type Other:
 name string (0..1)
choice Instrument:
 Leaf
 Other
func Check:
 inputs: left Instrument (1..1) right Instrument (1..1)
 output: result boolean (1..1)
 set result: (((left as Leaf) -> amount), ((right as Leaf) -> extra)) only exists
`);
    expect(() => generatePythonModule([AstUtils.getDocument(different[0]!)])).toThrow('linked common parent');
  });

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
      const subject = {
        uri: document.uri.toString(),
        nodeId: 'Build',
        region: getNodeSourceRegion(condition.expression)
      };
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

  it('projects bare only-exists fields with inherited siblings in Data condition scope', async () => {
    const funcs = await linkedFunctions(`namespace python.onlyexists
type Parent:
 extra number (0..1)
type Terms extends Parent:
 price number (0..1)
 dividend number (0..1)
 condition ReturnTerms: (price, dividend) only exists
func Identity:
 inputs: terms Terms (1..1)
 output: result Terms (1..1)
 set result: terms
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    const condition = module.projections.find((entry) => entry.kind === 'condition')!;
    const name = /^def (\w+)/.exec(condition.code)![1]!;
    expect(
      execute(module.code, [
        { expression: `${name}(data)`, data: { price: 1, dividend: 2 } },
        { expression: `${name}(data)`, data: { price: 1, dividend: 2, extra: 0 } }
      ])
    ).toEqual([{ value: true }, { value: false }]);
  });

  it('compiles large switches without nesting limits and evaluates only the chosen branch', async () => {
    const arms = Array.from({ length: 260 }, (_, index) => `${index} then ${index === 0 ? 'Fail()' : index}`);
    const funcs = await linkedFunctions(`namespace python.largeswitch
func Fail:
 output: result number (1..1)
func Select:
 inputs: selector number (1..1)
 output: result number (1..1)
 set result: selector switch ${arms.join(', ')}, default Fail()
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    const name = module.bindings.get('python.largeswitch.Select')!;
    const results = execute(module.code, [
      { expression: `${name}(data)`, data: { selector: 1 } },
      { expression: `${name}(data)`, data: { selector: 259 } },
      { expression: `${name}(data)`, data: { selector: 0 } },
      { expression: `${name}(data)`, data: { selector: 999 } }
    ]);
    expect(results.slice(0, 2)).toEqual([{ value: 1 }, { value: 259 }]);
    expect(results[2]!.error).toContain('Native binding required');
    expect(results[3]!.error).toContain('Native binding required');
  });

  it('checks bare only-exists against the actual output local in function postconditions', async () => {
    const funcs = await linkedFunctions(`namespace python.onlyexistslocal
func Validate:
 inputs: price number (0..1)
 output: result number (0..1)
 set result: price
 post-condition Exclusive: price only exists
`);
    const module = generatePythonModule([AstUtils.getDocument(funcs[0]!)]);
    const name = module.bindings.get('python.onlyexistslocal.Validate')!;
    expect(execute(module.code, [{ expression: `${name}(data)`, data: { price: 1 } }])[0]!.error).toContain(
      'Exclusive'
    );
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
