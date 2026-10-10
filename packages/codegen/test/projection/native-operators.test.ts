// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parseExpression, isData, isRosettaModel } from '@rune-langium/core';
import { transpileExpression, type ExpressionTranspilerContext } from '../../src/expr/transpiler.js';
import { RUNTIME_HELPER_JS_SOURCE } from '../../src/helpers.js';
import ts from 'typescript-classic';
import { writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { linkedFunctions } from './python-test-utils.js';
import { generatedDirectory } from '../helpers/generated-directory.js';
import { AstUtils } from 'langium';
import { generate } from '../../src/export.js';
import { createRequire } from 'node:module';

const context: ExpressionTranspilerContext = {
  selfName: 'data',
  emitMode: 'ts-expression',
  typeName: 'Test',
  conditionName: 'rule',
  attributeTypes: new Map(),
  diagnostics: []
};
function render(text: string) {
  const parsed = parseExpression(text);
  expect(parsed.hasErrors).toBe(false);
  return transpileExpression(parsed.value, context);
}
function evaluate(text: string, data: unknown = {}) {
  const code = ts.transpileModule('const result = (' + render(text) + ');', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  return new Function('data', RUNTIME_HELPER_JS_SOURCE + '\n' + code + '\nreturn result;')(data);
}

describe('native operators in the canonical emitter', () => {
  it('keeps required fields of the current validated Data record native', async () => {
    const [func] = await linkedFunctions(`namespace native.data
 type Value:
  amount int (1..1)
  condition Increment: amount + 1 > amount
 func Anchor:
  output: result int (1..1)
  set result: 1
`);
    const model = AstUtils.getDocument(func!).parseResult.value;
    if (!isRosettaModel(model)) throw new Error('Expected a model');
    const data = model.elements.find(isData)!;
    const expression = transpileExpression(data.conditions[0]!.expression!, context);
    expect(expression).not.toContain('rune.binary');
    expect(expression).not.toContain('rune.compare');
    expect(new Function('data', `return ${expression};`)({ amount: 2 })).toBe(true);
  });

  it('lifts required outputs and aliases because declaration cardinality does not prove initialization', async () => {
    const [func] = await linkedFunctions(`namespace native.initialization
func RequiredOutput:
 inputs: flag boolean (1..1)
 output: result number (1..1)
 alias pending: result
 set result: if flag then 1
 set result: result + 1
 set result: pending + 1
`);
    for (const operation of func!.operations.slice(1)) {
      const expression = transpileExpression(operation.expression, {
        ...context,
        localBindings: new Map([
          ['result', 'result'],
          ['pending', 'pending']
        ])
      });
      expect(expression).toContain('rune.binary');
      const javascript = ts.transpileModule(
        `function run(result: unknown, pending: unknown) { return ${expression}; }`,
        { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
      ).outputText;
      expect(
        new Function(
          'result',
          'pending',
          RUNTIME_HELPER_JS_SOURCE + '\n' + javascript + '\nreturn run(result, pending);'
        )(undefined, undefined)
      ).toBeUndefined();
    }
  });
  it('rejects an absent final result rather than returning NaN from emitted TypeScript', async () => {
    const [func] = await linkedFunctions(`namespace native.initialization
func RequiredOutput:
 inputs: flag boolean (1..1)
 output: result number (1..1)
 set result: if flag then 1
 set result: result + 1
`);
    const files = await generate([AstUtils.getDocument(func!)], {
      target: 'typescript',
      typescript: { layout: 'single-file' }
    });
    const source = files.find((file) => file.content.includes('function RequiredOutput'))!.content;
    const javascript = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText;
    const exports: { RequiredOutput?: (input: { flag: boolean }) => number } = {};
    new Function('exports', 'require', javascript)(exports, createRequire(import.meta.url));
    expect(exports.RequiredOutput!({ flag: true })).toBe(2);
    expect(() => exports.RequiredOutput!({ flag: false })).toThrow("Function 'RequiredOutput' produced no result");
  });
  it('uses strict scalar equality and direct numeric comparisons', () => {
    expect(render('"a" = "b"')).toBe("(('a' as string) === 'b')");
    expect(render('True <> False')).toBe('((true as boolean) !== false)');
    expect(render('1 < 2')).toBe('(1 < 2)');
    expect(render('1 + 2')).toBe('(1 + 2)');
    expect(evaluate('1 + 2 * 3')).toBe(7);
    expect(evaluate('(1 + 2) * 3')).toBe(9);
  });
  it('retains collection and unresolved structured value semantics', () => {
    expect(evaluate('[1, 2] = [1, 2]')).toBe(true);
    expect(evaluate('[1, 2] = [2, 1]')).toBe(false);
    expect(evaluate('a = b', { a: { value: 1 }, b: { value: 1 } })).toBe(true);
    expect(evaluate('a = b', { a: undefined, b: null })).toBe(true);
    expect(render('a = b')).toBe('(rune.valueKey(data.a) === rune.valueKey(data.b))');
    expect(render('[1, 2] = [1, 2]')).toMatch(/^rune\.equals\([^]*, "all"\)$/);
    expect(render('[1, 2] = [1, 2]')).not.toContain('=>');
  });
  it('strictly compiles native equality after nested boolean control-flow narrowing', async () => {
    const [func] = await linkedFunctions(`namespace native.narrowing
func Check:
 inputs: flag boolean (1..1)
 output: result boolean (1..1)
 set result: if flag = False then (if flag = True then False else True) else True
`);
    const expression = transpileExpression(func!.operations[0]!.expression, {
      ...context,
      attributeTypes: new Map([['flag', 'boolean']])
    });
    const directory = generatedDirectory(join(tmpdir(), 'rune-native-equality-'));
    try {
      const filename = join(directory, 'case.ts');
      const source = `function execute(data: {flag: boolean}) { return ${expression}; }`;
      writeFileSync(filename, source);
      const compile = spawnSync(
        'pnpm',
        ['exec', 'tsc', '--ignoreConfig', '--strict', '--noEmit', '--skipLibCheck', '--target', 'ESNext', filename],
        { encoding: 'utf8' }
      );
      expect(compile.status, compile.stdout + compile.stderr).toBe(0);
      const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
      const run = new Function('data', javascript + '\nreturn execute(data);');
      expect(run({ flag: false })).toBe(true);
      expect(run({ flag: true })).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
